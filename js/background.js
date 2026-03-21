// ServiceNow Audio Alerts - Modern Service Worker (Manifest V3)
// Upgraded from legacy background.js for better security and performance

// Global state
const state = {
    currentNumberTickets: 0,
    currentNumberTask: 0,
    currentNumberTotal: 0,
    rootURL: null,
    newStamp: 0,
    newList: [],
    oldList: [],
    scheduledPollMinutes: null,
    scheduledPollEnabled: null,
    lastNotificationCount: null
};

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
    await getSavedData();
});

// Message listener for options page updates
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.type === "SNOW_AUDIO_ALERT_OPTIONS_UPDATED") {
        getSavedData();
    } else if (msg && msg.type === "REQUEST_TICKET_DATA") {
        // Send current ticket data to options page
        sendResponse({
            type: 'TICKET_DATA_RESPONSE',
            queueACount: state.currentNumberTickets,
            queueBCount: state.currentNumberTask,
            totalCount: state.currentNumberTotal,
            tickets: state.newList.slice(0, 5).map(ticketNum => ({
                number: ticketNum,
                description: 'ServiceNow ticket' // Could be enhanced with real descriptions
            }))
        });
    } else if (msg && msg.type === "TEST_NOTIFICATION") {
        // Handle test notification request
        console.log('Creating test notification:', msg);
        showNotification(msg.ticketNumber, msg.ticketDescription, msg.severity);
        sendResponse({ success: true });
    }
});

// Alarm listener for periodic polling
chrome.alarms.onAlarm.addListener(async (info) => {
    if (info.name === "CheckTicketsAlarm") {
        await getSavedData();
    }
});

// Notification click handler
chrome.notifications.onClicked.addListener(async (notificationId) => {
    if (notificationId === 'reminder' && state.ticketNumberGlobal) {
        await openTicketInServiceNow(state.ticketNumberGlobal);
    }
});

// Initialize badge
chrome.action.setBadgeText({ text: "Wait" });

// Core functions
async function getSavedData() {
    try {
        const items = await chrome.storage.sync.get([
            'rooturl', 'secondary', 'primary', 'splitcount', 
            'disableAlarm', 'disablePoll', 'alarmCondition', 'pollInterval'
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

    console.log('Scheduling alarm - pollEnabled:', pollEnabled, 'minutes:', minutes);
    console.log('Current state - scheduledPollEnabled:', state.scheduledPollEnabled, 'scheduledPollMinutes:', state.scheduledPollMinutes);

    // Only reconfigure alarms when state changes
    if (state.scheduledPollEnabled === pollEnabled && state.scheduledPollMinutes === minutes) {
        console.log('Alarm configuration unchanged, skipping');
        return;
    }

    // Clear existing alarm
    await chrome.alarms.clear("CheckTicketsAlarm");
    console.log('Cleared existing alarm');

    if (pollEnabled) {
        await chrome.alarms.create("CheckTicketsAlarm", {
            delayInMinutes: minutes,
            periodInMinutes: minutes
        });
        state.scheduledPollEnabled = true;
        state.scheduledPollMinutes = minutes;
        console.log('Created new alarm with interval:', minutes, 'minutes');
    } else {
        state.scheduledPollEnabled = false;
        state.scheduledPollMinutes = null;
        console.log('Polling disabled, alarm not created');
    }
}

async function getQueues(items) {
    console.log('Starting queue processing...');
    
    if (items.disablePoll === "on") {
        console.log('Polling disabled, clearing state');
        state.oldList = [];
        state.newList = [];
        state.currentNumberTickets = 0;
        state.currentNumberTask = 0;
        state.currentNumberTotal = 0;
        chrome.action.setBadgeText({ text: "Off" });
        return;
    }

    const primaryURL = changeURLforRESTAPI(items.primary);
    const secondaryURL = changeURLforRESTAPI(items.secondary);
    state.rootURL = items.rooturl;
    state.newList = [];

    const urls = [];
    if (primaryURL) urls.push(primaryURL);
    if (secondaryURL) urls.push(secondaryURL);

    if (urls.length === 0) {
        console.log('No URLs configured');
        chrome.action.setBadgeText({ text: "0" });
        return;
    }

    try {
        console.log('Fetching data from', urls.length, 'URL(s)');
        chrome.action.setBadgeText({ text: "..." });
        
        const results = await Promise.all(urls.map(url => getDataREST(url)));
        
        let totalCount = 0;
        let shouldNotify = false;
        let latestData = null;

        if (urls.length === 1) {
            const data = results[0];
            totalCount = data.quantity;
            console.log('Single queue - Current total:', state.currentNumberTotal, 'New total:', totalCount);
            if (state.currentNumberTotal < totalCount) {
                console.log('Single queue - New tickets detected, triggering notification');
                state.ticketNumberGlobal = data.number;
                showNotification(data.number, data.description || 'New ticket assigned', data.severity);
                shouldNotify = true;
            } else {
                console.log('Single queue - No new tickets');
            }
            latestData = data;
        } else {
            const [data1, data2] = results;
            totalCount = data1.quantity + data2.quantity;
            console.log('Dual queue - Current total:', state.currentNumberTotal, 'New total:', totalCount);
            console.log('Dual queue - Data1 count:', data1.quantity, 'Data2 count:', data2.quantity);
            
            if (state.currentNumberTotal < totalCount) {
                latestData = data1.timestamp > data2.timestamp ? data1 : data2;
                console.log('Dual queue - Latest data:', latestData.number, 'Timestamp:', latestData.timestamp, 'New stamp:', state.newStamp);
                if (latestData.timestamp > state.newStamp) {
                    console.log('Dual queue - New ticket detected, triggering notification');
                    state.newStamp = latestData.timestamp;
                    state.ticketNumberGlobal = latestData.number;
                    showNotification(latestData.number, latestData.description || 'New ticket assigned', latestData.severity);
                    shouldNotify = true;
                } else {
                    console.log('Dual queue - Ticket count increased but no newer timestamp');
                }
            } else {
                console.log('Dual queue - No new tickets');
            }
        }

        // Update badge
        if (urls.length === 2 && items.splitcount === "true") {
            const badgeText = `${results[0].quantity}|${results[1].quantity}`;
            chrome.action.setBadgeText({ text: badgeText });
        } else {
            chrome.action.setBadgeText({ text: totalCount.toString() });
        }

        state.currentNumberTotal = totalCount;
        
        // Update individual queue counts for UI
        if (urls.length === 2) {
            state.currentNumberTickets = results[0].quantity;
            state.currentNumberTask = results[1].quantity;
        } else if (urls.length === 1) {
            state.currentNumberTickets = results[0].quantity;
            state.currentNumberTask = 0;
        }

        console.log('Queue processing complete - totalCount:', totalCount);

        // Handle audio notifications
        console.log('Audio check - disableAlarm:', items.disableAlarm, 'alarmCondition:', items.alarmCondition, 'totalCount:', totalCount);
        console.log('Old list:', state.oldList, 'New list:', state.newList);
        
        if (items.disableAlarm !== "on") {
            if (items.alarmCondition === "nonZeroCount" && totalCount > 0) {
                console.log('Triggering audio - nonZeroCount condition met');
                await audioNotification();
            } else if (items.alarmCondition === "alarmOnNewEntry") {
                // Check for new tickets by comparing old and new lists
                const difference = state.newList.filter(x => !state.oldList.includes(x));
                console.log('New tickets detected:', difference);
                if (difference.length > 0) {
                    console.log('Triggering audio - new tickets condition met');
                    await audioNotification();
                } else {
                    console.log('No new tickets - audio not triggered');
                }
            } else {
                console.log('No audio trigger - conditions not met');
            }
        } else {
            console.log('Audio disabled');
        }

        // Handle visual notifications for "Count is > 0" condition
        if (items.alarmCondition === "nonZeroCount" && totalCount > 0 && items.disableAlarm !== "on") {
            // For "Count is > 0" condition, show notification when count > 0 even if not increasing
            if (state.currentNumberTotal === 0 || !state.lastNotificationCount || state.lastNotificationCount < totalCount) {
                console.log('Showing notification for nonZeroCount condition');
                const latestTicket = state.newList[0]; // Get first/latest ticket
                if (latestTicket) {
                    showNotification(latestTicket, 'Queue has ' + totalCount + ' ticket(s)', '3');
                    state.lastNotificationCount = totalCount;
                }
            }
        }

        // Update lists for next comparison
        state.oldList = [...state.newList];
        
        // Send ticket updates to options page
        await sendTicketUpdateToOptions();
        
        // Store last poll time
        try {
            const lastPollAt = new Date().toISOString();
            await chrome.storage.local.set({ lastPollAt });
        } catch (e) {
            console.log('Could not store last poll time:', e);
        }

    } catch (error) {
        console.error('Error processing queues:', error);
        chrome.action.setBadgeText({ text: "Err" });
    }
}

async function getDataREST(url) {
    try {
        const response = await fetch(url + '&sysparm_limit=1000', {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        const records = data.records || [];

        if (records.length === 0) {
            return {
                quantity: 0,
                number: null,
                severity: null,
                description: null,
                timestamp: 0,
                account: null,
                assigned_to: null,
                state: null,
                u_next_step_date_and_time: null,
                impact: null,
                category: null,
                opened_by: null,
                assignment_group: null,
                u_first_assignment_group: null,
                u_service_downtime_started: null,
                u_service_downtime_end: null,
                u_fault_cause: null,
                resolved_by: null,
                resolved_at: null,
                u_resolved: null,
                u_resolved_by: null,
                sys_updated_on: 0,
                sys_mod_count: 0
            };
        }

        let maxTimestamp = 0;
        let latestRecord = null;

        records.forEach(record => {
            const ticketNumber = record.number;
            state.newList.push(ticketNumber);

            let severity = record.priority || "5";
            if (ticketNumber.includes("TASK")) {
                severity = "10";
            } else if (ticketNumber.includes("CHG")) {
                severity = "15";
            }

            const timestamp = record.sys_updated_on ? new Date(record.sys_updated_on).getTime() : 0;
            
            if (timestamp > maxTimestamp) {
                maxTimestamp = timestamp;
                latestRecord = {
                    number: ticketNumber,
                    severity: severity,
                    description: record.short_description || record.description,
                    timestamp: timestamp,
                    account: record.account,
                    assigned_to: record.assigned_to,
                    state: record.state,
                    u_next_step_date_and_time: record.u_next_step_date_and_time,
                    impact: record.impact,
                    category: record.category,
                    opened_by: record.opened_by,
                    assignment_group: record.assignment_group,
                    u_first_assignment_group: record.u_first_assignment_group,
                    u_service_downtime_started: record.u_service_downtime_started,
                    u_service_downtime_end: record.u_service_downtime_end,
                    u_fault_cause: record.u_fault_cause,
                    resolved_by: record.resolved_by,
                    resolved_at: record.resolved_at,
                    u_resolved: record.u_resolved,
                    u_resolved_by: record.u_resolved_by,
                    sys_updated_on: record.sys_updated_on,
                    sys_mod_count: record.sys_mod_count
                };
            }
        });

        return {
            quantity: records.length,
            ...latestRecord
        };

    } catch (error) {
        console.error('Error fetching data:', error);
        return {
            quantity: 0,
            number: null,
            severity: null,
            description: null,
            timestamp: 0
        };
    }
}

async function audioNotification() {
    try {
        // Create offscreen document if it doesn't exist
        const existingContexts = await chrome.runtime.getContexts({
            contextTypes: ['OFFSCREEN_DOCUMENT'],
            documentUrls: [chrome.runtime.getURL('offscreen.html')]
        });

        if (existingContexts.length === 0) {
            await chrome.offscreen.createDocument({
                url: 'offscreen.html',
                reasons: ['AUDIO_PLAYBACK'],
                justification: 'Playing audio notifications for ServiceNow updates'
            });
        }

        // Send message to offscreen document to play audio
        await chrome.runtime.sendMessage({ type: "PLAY_AUDIO" });
        console.log('Audio notification sent to offscreen document');
    } catch (error) {
        console.log('Could not play audio notification:', error);
    }
}

function showNotification(ticketNumber, ticketDescription, severity) {
    console.log('Creating notification:', { ticketNumber, ticketDescription, severity });
    
    // For now, use the default ITSM128.png icon that we know exists and works
    const iconUrl = chrome.runtime.getURL('images/ITSM128.png');
    
    const notificationOptions = {
        type: 'basic',
        iconUrl: iconUrl,
        title: ticketNumber,
        message: ticketDescription
    };
    
    console.log('Notification options:', notificationOptions);
    console.log('Icon URL:', iconUrl);
    
    chrome.notifications.create('reminder', notificationOptions, function(notificationId) {
        if (chrome.runtime.lastError) {
            console.error('Notification creation error:', chrome.runtime.lastError);
            // Try fallback without icon if image fails
            const fallbackOptions = {
                type: 'basic',
                title: ticketNumber,
                message: ticketDescription
            };
            chrome.notifications.create('reminder_fallback', fallbackOptions, function(fallbackId) {
                if (chrome.runtime.lastError) {
                    console.error('Fallback notification also failed:', chrome.runtime.lastError);
                } else {
                    console.log('Fallback notification created with ID:', fallbackId);
                }
            });
        } else {
            console.log('Notification created with ID:', notificationId);
        }
    });
    

    //include this line if you want to clear notification after 5 seconds
    setTimeout(function(){chrome.notifications.clear("reminder",function(){});},5000);
}

// Notification click handler - opens appropriate ServiceNow page based on ticket type
chrome.notifications.onClicked.addListener(notificationClicked);

function notificationClicked() {
    chrome.storage.sync.get(['rooturl'], function(result) {
        const rootURL = result.rooturl;
        
        if (!rootURL || !state.ticketNumberGlobal) return;
        
        let urlTicketSearch;
        const ticketPrefix = state.ticketNumberGlobal.substring(0, 3);
        
        switch (ticketPrefix) {
            case "TAS":
                urlTicketSearch = rootURL + "/sc_task.do?sys_id=" + state.ticketNumberGlobal;
                break;
            case "INC":
                urlTicketSearch = rootURL + "/incident.do?sys_id=" + state.ticketNumberGlobal;
                break;
            case "CSP":
                urlTicketSearch = rootURL + "/sn_customer_case.do?sys_id=" + state.ticketNumberGlobal;
                break;
            case "CSR":
                urlTicketSearch = rootURL + "/sn_customer_case.do?sys_id=" + state.ticketNumberGlobal;
                break;
            case "REQ":
                urlTicketSearch = rootURL + "/sc_request.do?sys_id=" + state.ticketNumberGlobal;
                break;
            case "CHG":
                urlTicketSearch = rootURL + "/change_request.do?sys_id=" + state.ticketNumberGlobal;
                break;
            case "RIT":
                urlTicketSearch = rootURL + "/sc_req_item.do?sys_id=" + state.ticketNumberGlobal;
                break;
            case "CAL":
                urlTicketSearch = rootURL + "/new_call.do?sys_id=" + state.ticketNumberGlobal;
                break;
            default:
                urlTicketSearch = rootURL + "/task_list.do?sysparm_query=numberLIKE" + state.ticketNumberGlobal + "&sysparm_first_row=1&sysparm_view=";
        }

        try {
            chrome.tabs.create({
                'url': urlTicketSearch
            });
        } catch (error) {
            console.error('Error opening ticket:', error);
        }
    });
}

// Helper function to get priority label
function getPriorityLabel(severity) {
    const priorityMap = {
        "1": "🔴 CRITICAL",
        "2": "🟠 HIGH", 
        "3": "🟡 MEDIUM",
        "4": "🟢 LOW",
        "5": "🔵 PLANNED",
        "10": "📋 SERVICE REQUEST",
        "15": "🔄 CHANGE"
    };
    return priorityMap[severity] || "📋 TASK";
}

async function openTicketInServiceNow(ticketNumber) {
    if (!ticketNumber || !state.rootURL) return;

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

    const fullUrl = `${state.rootURL}${urlPath}`;

    try {
        await chrome.tabs.create({ url: fullUrl });
    } catch (error) {
        console.error('Error opening ServiceNow tab:', error);
    }
}

function validateURL(url) {
    if (!url || typeof url !== 'string') return false;
    try {
        const urlObj = new URL(url);
        return urlObj.protocol === 'https:' && urlObj.hostname.includes('service-now.com');
    } catch {
        return false;
    }
}

function changeURLforRESTAPI(url) {
    if (!url || url === "") return undefined;

    try {
        const urlObj = new URL(url);
        
        // Validate it's a ServiceNow URL
        if (!urlObj.hostname.includes('service-now.com')) {
            console.warn('URL does not appear to be a ServiceNow instance:', url);
            return undefined;
        }

        // Convert to REST API format
        let restURL = `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}${urlObj.search}`;
        
        // Remove unwanted parameters
        restURL = removeParam("sysparm_fields", restURL);
        restURL = removeParam("sysparm_view", restURL);
        
        // Add JSON and required fields
        const separator = restURL.includes('?') ? '&' : '?';
        restURL += `${separator}JSONv2&sysparm_fields=number,severity,short_description,priority,sys_id,sys_updated_on,account,assigned_to,state,u_next_step_date_and_time,impact,category,opened_by,assignment_group,u_first_assignment_group,u_service_downtime_started,u_service_downtime_end,u_fault_cause,resolved_by,resolved_at,u_resolved,u_resolved_by,sys_mod_count`;
        
        return restURL;
    } catch (error) {
        console.error('Error processing URL:', error);
        return undefined;
    }
}

function removeParam(key, sourceURL) {
    try {
        const url = new URL(sourceURL);
        url.searchParams.delete(key);
        return url.toString();
    } catch {
        // Fallback to string manipulation if URL parsing fails
        const rtn = sourceURL.split("?")[0];
        const queryString = sourceURL.includes("?") ? sourceURL.split("?")[1] : "";
        
        if (!queryString) return rtn;
        
        const params = queryString.split("&").filter(param => !param.startsWith(key + "="));
        return params.length > 0 ? rtn + "?" + params.join("&") : rtn;
    }
}

// Send ticket updates to options page
async function sendTicketUpdateToOptions() {
    try {
        // Get poll interval from storage
        const items = await chrome.storage.sync.get(['pollInterval']);
        const pollInterval = items.pollInterval || 5;
        
        // Get ticket details from current state
        const tickets = state.newList.slice(0, 5).map(ticketNum => ({
            number: ticketNum,
            description: 'ServiceNow ticket' // Could be enhanced with real descriptions
        }));
        
        // Send message via runtime (better than tabs approach)
        await chrome.runtime.sendMessage({
            type: 'TICKET_UPDATE',
            queueACount: state.currentNumberTickets,
            queueBCount: state.currentNumberTask,
            totalCount: state.currentNumberTotal,
            tickets: tickets,
            pollInterval: pollInterval
        });
        
        console.log('Sent ticket update to options:', {
            queueACount: state.currentNumberTickets,
            queueBCount: state.currentNumberTask,
            totalCount: state.currentNumberTotal,
            pollInterval: pollInterval
        });
    } catch (error) {
        console.log('Could not send ticket update to options:', error);
    }
}
