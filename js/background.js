// ServiceNow Audio Alerts - Modern Service Worker (Manifest V3)
// Refactored into modular architecture for better maintainability

// Import modules
import state, { 
    getState, 
    updateState, 
    resetState, 
    initializeState, 
    getTicketCounts, 
    getTicketLists, 
    getPollingState, 
    updatePollingState, 
    updateTicketCounts, 
    updateTicketLists, 
    setRootURL, 
    setTicketNumberGlobal, 
    updateNewStamp 
} from './modules/state-manager.js';

import { 
    getDataREST, 
    processQueues, 
    setURLProcessor 
} from './modules/servicenow-api.js';

import { 
    showNotification, 
    setupNotificationHandlers 
} from './modules/notification-system.js';

import { 
    changeURLforRESTAPI, 
    validateURL 
} from './modules/url-processor.js';

import { 
    audioNotification, 
    stopAudioNotification 
} from './modules/audio-handler.js';

// Initialize modules
setupNotificationHandlers();
setURLProcessor(changeURLforRESTAPI);

// Initialize service worker
chrome.runtime.onInstalled.addListener(async (details) => {
    if (details.reason === "install") {
        try {
            await chrome.tabs.create({
                'url': `chrome://extensions/?options=${chrome.runtime.id}`
            });
        } catch (e) {
            console.log('Could not open options page:', e);
        }
    }
    
    // Initialize state on install/update
    initializeState();
    await getSavedData();
});

// Message listener for options page updates
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.type === "SNOW_AUDIO_ALERT_OPTIONS_UPDATED") {
        console.log('=== OPTIONS UPDATED - RELOADING CONFIGURATION ===');
        getSavedData();
    } else if (msg && msg.type === "REQUEST_TICKET_DATA") {
        // Send current ticket data to options page
        const counts = getTicketCounts();
        const lists = getTicketLists();
        sendResponse({
            type: 'TICKET_DATA_RESPONSE',
            queueACount: counts.tickets,
            queueBCount: counts.tasks,
            totalCount: counts.total,
            tickets: lists.newList.slice(0, 5).map(ticketNum => ({
                number: ticketNum,
                description: 'ServiceNow ticket' // Could be enhanced with real descriptions
            }))
        });
    } else if (msg && msg.type === "TEST_NOTIFICATION") {
        // Handle test notification request
        console.log('Creating test notification:', msg);
        const customTitle = msg.customTitle || null;
        const queueUrl = msg.queueUrl || null;
        showNotification(msg.ticketNumber, msg.ticketDescription, msg.severity, customTitle, queueUrl);
        sendResponse({ success: true });
    }
});

// Alarm listener for periodic polling
chrome.alarms.onAlarm.addListener(async (info) => {
    if (info.name === "CheckTicketsAlarm") {
        await getSavedData();
    }
});

// Initialize badge
chrome.action.setBadgeText({ text: "Wait" });

// Core functions
async function getSavedData() {
    try {
        const items = await chrome.storage.sync.get([
            'rooturl', 'secondary', 'primary', 'splitcount', 
            'disableAlarm', 'disablePoll', 'alarmCondition', 'pollInterval',
            'primaryNotificationText', 'secondaryNotificationText'
        ]);
        
        await scheduleAlarmFromItems(items);
        await getQueues(items);
    } catch (error) {
        console.error('Error getting saved data:', error);
        chrome.action.setBadgeText({ text: "Err" });
    }
}

function parsePollIntervalMinutes(rawValue) {
    const minutes = parseInt(rawValue, 10);
    return (isNaN(minutes) || minutes < 1) ? 5 : minutes;
}

async function scheduleAlarmFromItems(items) {
    const pollEnabled = items.disablePoll !== "on";
    const minutes = parsePollIntervalMinutes(items.pollInterval);
    const pollingState = getPollingState();

    console.log('Scheduling alarm - pollEnabled:', pollEnabled, 'minutes:', minutes);
    console.log('Current state - scheduledPollEnabled:', pollingState.enabled, 'scheduledPollMinutes:', pollingState.minutes);

    // Always reconfigure when called from options update to ensure sync
    const forceUpdate = pollingState.enabled !== pollEnabled || pollingState.minutes !== minutes;
    
    if (!forceUpdate) {
        console.log('Alarm configuration unchanged, skipping');
        return;
    }

    // Clear existing alarm
    try {
        await chrome.alarms.clear("CheckTicketsAlarm");
        console.log('Cleared existing alarm');
    } catch (e) {
        console.log('No existing alarm to clear:', e.message);
    }

    if (pollEnabled) {
        await chrome.alarms.create("CheckTicketsAlarm", {
            delayInMinutes: minutes,
            periodInMinutes: minutes
        });
        updatePollingState(true, minutes);
        console.log('Created new alarm with interval:', minutes, 'minutes');
    } else {
        updatePollingState(false, null);
        console.log('Polling disabled, alarm not created');
    }
}

async function getQueues(items) {
    console.log('Starting queue processing...');
    
    if (items.disablePoll === "on") {
        console.log('Polling disabled, clearing state');
        resetState();
        chrome.action.setBadgeText({ text: "Off" });
        return;
    }

    setRootURL(items.rooturl);
    
    // Preserve old list before resetting new list for proper comparison
    const lists = getTicketLists();
    const previousList = [...lists.newList];
    
    const queueData = await processQueues(items);
    
    if (queueData.shouldStop) {
        return;
    }

    if (queueData.error) {
        console.error('Queue processing error:', queueData.error);
        chrome.action.setBadgeText({ text: "Err" });
        return;
    }

    const { totalCount, results, latestData, urls } = queueData;
    
    console.log('Queue processing complete - totalCount:', totalCount);

    // Update badge
    if (urls === 2 && items.splitcount === "true") {
        const badgeText = `${results[0].quantity}|${results[1].quantity}`;
        chrome.action.setBadgeText({ text: badgeText });
    } else {
        chrome.action.setBadgeText({ text: totalCount.toString() });
    }

    // Update state with new counts
    if (urls === 2) {
        updateTicketCounts(results[0].quantity, results[1].quantity, totalCount);
    } else if (urls === 1) {
        updateTicketCounts(results[0].quantity, 0, totalCount);
    }

    // Handle notifications based on alert condition
    await handleNotifications(items, totalCount, results, latestData, previousList, urls);

    // Store last poll time BEFORE sending updates to ensure timer sync
    try {
        const lastPollAt = new Date().toISOString();
        await chrome.storage.local.set({ lastPollAt });
        console.log('Stored last poll time:', lastPollAt);
    } catch (e) {
        console.log('Could not store last poll time:', e);
    }

    // Send ticket updates to options page AFTER storing poll time
    await sendTicketUpdateToOptions();
}

async function handleNotifications(items, totalCount, results, latestData, previousList, urls) {
    const lists = getTicketLists();
    
    // Handle notifications based on alert condition
    console.log('=== NOTIFICATION LOGIC ===');
    console.log('Alert condition:', items.alarmCondition);
    console.log('Audio disabled:', items.disableAlarm === "on");
    console.log('Total count:', totalCount);
    
    // Create notifications regardless of audio setting
    if (items.alarmCondition === "nonZeroCount" && totalCount > 0) {
        console.log('✅ Triggering - Count > 0 condition met');
        
        // Play audio only if not disabled
        if (items.disableAlarm !== "on") {
            await audioNotification();
        }
        
        // Always create notifications for non-zero count
        if (urls === 1) {
            // Single queue - one notification
            const customTitle = items.primaryNotificationText || 'Tickets Available';
            showNotification(latestData.number, latestData.description || 'Tickets available', latestData.severity, customTitle, items.primary);
        } else {
            // Dual queue - separate notifications for each queue
            if (results[0].quantity > 0) {
                const customTitle = items.primaryNotificationText || 'Queue 1 - Tickets Available';
                showNotification(results[0].number, results[0].description || 'Queue 1 tickets available', results[0].severity, customTitle, items.primary);
            }
            
            if (results[1].quantity > 0) {
                const customTitle = items.secondaryNotificationText || 'Queue 2 - Tickets Available';
                showNotification(results[1].number, results[1].description || 'Queue 2 tickets available', results[1].severity, customTitle, items.secondary);
            }
        }
        
    } else if (items.alarmCondition === "alarmOnNewEntry") {
        // Check for new tickets by comparing previous and new lists
        console.log('=== NEW TICKET DETECTION LOGIC ===');
        console.log('Previous list:', previousList);
        console.log('New list:', lists.newList);
        console.log('Previous list length:', previousList.length);
        console.log('New list length:', lists.newList.length);
        
        // Find tickets that are in new list but not in previous list
        const difference = lists.newList.filter(x => !previousList.includes(x));
        console.log('New tickets detected (difference):', difference);
        
        // Only trigger if:
        // 1. First run with tickets (previousList is empty but newList has tickets)
        // 2. Not first run but has new tickets (previousList has tickets AND difference > 0)
        if ((previousList.length === 0 && lists.newList.length > 0) || (previousList.length > 0 && difference.length > 0)) {
            console.log('✅ Triggering audio - new tickets condition met');
            console.log('New tickets:', previousList.length === 0 ? lists.newList : difference);
            
            // Play audio only if not disabled
            if (items.disableAlarm !== "on") {
                await audioNotification();
            }
            
            // Create notification for new tickets
            if (urls === 1) {
                // Single queue - one notification
                const customTitle = items.primaryNotificationText || 'New tickets in Queue 1';
                showNotification(latestData.number, latestData.description || 'New ticket assigned', latestData.severity, customTitle, items.primary);
            } else {
                // Dual queue - check which queue has new tickets and create separate notifications
                // For dual queues, we need to track which tickets come from which queue
                // Since we only have ticket numbers, we'll use the latestData to determine which queue triggered
                
                // Check if Queue 1 has new tickets
                if (results[0].quantity > 0) {
                    const customTitle = items.primaryNotificationText || 'New tickets in Queue 1';
                    showNotification(results[0].number, results[0].description || 'New tickets in Queue 1', results[0].severity, customTitle, items.primary);
                }
                
                // Check if Queue 2 has new tickets
                if (results[1].quantity > 0) {
                    const customTitle = items.secondaryNotificationText || 'New tickets in Queue 2';
                    showNotification(results[1].number, results[1].description || 'New tickets in Queue 2', results[1].severity, customTitle, items.secondary);
                }
            }
        } else {
            console.log('❌ No new tickets - audio not triggered');
            if (previousList.length === 0 && lists.newList.length === 0) {
                console.log('🔄 First run detected - no tickets found');
            } else if (previousList.length === lists.newList.length) {
                console.log('📊 Same number of tickets - checking if they are the same tickets');
                const sameTickets = lists.newList.every(x => previousList.includes(x));
                if (sameTickets) {
                    console.log('✅ All tickets are the same - no new tickets');
                } else {
                    console.log('🔄 Different tickets detected but same count - this should not happen');
                }
            }
        }
    } else {
        console.log('❌ No notification trigger - conditions not met');
    }
}

async function openTicketInServiceNow(ticketNumber) {
    if (!ticketNumber) return;

    const currentState = getState();
    if (!currentState.rootURL) return;

    const prefix = ticketNumber.substring(0, 3).toUpperCase();
    let urlPath = '';

    const urlMap = {
        'TAS': '/sc_task.do',
        'INC': '/incident.do',
        'CSP': '/sn_customer_case.do',
        'CSR': '/sn_customer_case.do',
        'REQ': '/sc_request.do',
        'CHG': '/change_request.do',
        'RIT': '/sc_req_item.do',
        'CAL': '/new_call.do'
    };

    if (urlMap[prefix]) {
        urlPath = `${urlMap[prefix]}?sys_id=${ticketNumber}`;
    } else {
        urlPath = `/task_list.do?sysparm_query=numberLIKE${ticketNumber}&sysparm_first_row=1&sysparm_view=`;
    }

    const fullUrl = `${currentState.rootURL}${urlPath}`;

    try {
        await chrome.tabs.create({ url: fullUrl });
    } catch (error) {
        console.error('Error opening ServiceNow tab:', error);
    }
}

// Send ticket updates to options page
async function sendTicketUpdateToOptions() {
    try {
        const counts = getTicketCounts();
        const lists = getTicketLists();
        
        // Get ticket details from current state
        const tickets = lists.newList.slice(0, 5).map(ticketNum => ({
            number: ticketNum,
            description: 'ServiceNow ticket' // Could be enhanced with real descriptions
        }));
        
        // Send message via runtime (better than tabs approach)
        await chrome.runtime.sendMessage({
            type: 'TICKET_UPDATE',
            queueACount: counts.tickets,
            queueBCount: counts.tasks,
            totalCount: counts.total,
            tickets: tickets
        });
        
        console.log('Sent ticket update to options:', {
            queueACount: counts.tickets,
            queueBCount: counts.tasks,
            totalCount: counts.total
        });
    } catch (error) {
        console.log('Could not send ticket update to options:', error);
    }
}
