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
    scheduledPollEnabled: null
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

    // Only reconfigure alarms when state changes
    if (state.scheduledPollEnabled === pollEnabled && state.scheduledPollMinutes === minutes) {
        return;
    }

    // Clear existing alarm
    await chrome.alarms.clear("CheckTicketsAlarm");

    if (pollEnabled) {
        await chrome.alarms.create("CheckTicketsAlarm", {
            delayInMinutes: minutes,
            periodInMinutes: minutes
        });
        state.scheduledPollEnabled = true;
        state.scheduledPollMinutes = minutes;
    } else {
        state.scheduledPollEnabled = false;
        state.scheduledPollMinutes = null;
    }
}

async function getQueues(items) {
    if (items.disablePoll === "on") {
        state.oldList = [];
        state.newList = [];
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
        chrome.action.setBadgeText({ text: "0" });
        return;
    }

    try {
        const results = await Promise.all(urls.map(url => getDataREST(url)));
        
        let totalCount = 0;
        let shouldNotify = false;
        let latestData = null;

        if (urls.length === 1) {
            const data = results[0];
            totalCount = data.quantity;
            if (state.currentNumberTotal < totalCount) {
                state.ticketNumberGlobal = data.number;
                await showNotification(data.number, data, data.severity);
                shouldNotify = true;
            }
            latestData = data;
        } else {
            const [data1, data2] = results;
            totalCount = data1.quantity + data2.quantity;
            
            if (state.currentNumberTotal < totalCount) {
                latestData = data1.timestamp > data2.timestamp ? data1 : data2;
                if (latestData.timestamp > state.newStamp) {
                    state.newStamp = latestData.timestamp;
                    state.ticketNumberGlobal = latestData.number;
                    await showNotification(latestData.number, latestData, latestData.severity);
                    shouldNotify = true;
                }
            }
        }

        // Update badge
        if (urls.length === 2 && items.splitcount === "true") {
            const badgeText = `${results[0].quantity} |${results[1].quantity}`;
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

        // Handle audio notifications
        console.log('Audio check - disableAlarm:', items.disableAlarm, 'alarmCondition:', items.alarmCondition, 'totalCount:', totalCount);
        console.log('Old list:', state.oldList, 'New list:', state.newList);
        
        if (items.disableAlarm !== "on") {
            if (items.alarmCondition === "nonZeroCount" && totalCount > 0) {
                console.log('Triggering audio - nonZeroCount condition met');
                await audioNotification();
            } else if (items.alarmCondition !== "nonZeroCount") {
                const difference = state.newList.filter(x => !state.oldList.includes(x));
                console.log('New tickets detected:', difference);
                if (difference.length > 0) {
                    console.log('Triggering audio - new tickets condition met');
                    await audioNotification();
                }
            } else {
                console.log('No audio trigger - conditions not met');
            }
        } else {
            console.log('Audio disabled');
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

async function showNotification(ticketNumber, ticketData, severity) {
    if (!ticketNumber) return;

    let imageName = "ITSM128.png";
    const severityMap = {
        "1": "Sev1.png",
        "2": "Sev2.png", 
        "3": "Sev3.png",
        "4": "Sev4.png",
        "10": "ServiceRequest.png",
        "15": "change.png"
    };

    if (severityMap[severity]) {
        imageName = severityMap[severity];
    }

    // Build rich notification message
    let notificationTitle = ticketNumber;
    let notificationMessage = '';
    
    if (ticketData) {
        // Priority indicators in title
        const priorityLabel = getPriorityLabel(severity);
        notificationTitle = `${ticketNumber} - ${priorityLabel}`;
        
        // Build detailed message
        const messageParts = [];
        
        // Description
        if (ticketData.description) {
            messageParts.push(`📝 ${ticketData.description.substring(0, 100)}${ticketData.description.length > 100 ? '...' : ''}`);
        }
        
        // Assignment info
        if (ticketData.assigned_to && ticketData.assigned_to.display_value) {
            messageParts.push(`👤 Assigned to: ${ticketData.assigned_to.display_value}`);
        } else if (ticketData.assignment_group) {
            messageParts.push(`👥 Group: ${ticketData.assignment_group}`);
        }
        
        // State/Status
        if (ticketData.state) {
            messageParts.push(`📊 Status: ${ticketData.state}`);
        }
        
        // Impact
        if (ticketData.impact) {
            messageParts.push(`⚡ Impact: ${ticketData.impact}`);
        }
        
        // Category
        if (ticketData.category) {
            messageParts.push(`📂 Category: ${ticketData.category}`);
        }
        
        // Next step deadline (SLA)
        if (ticketData.u_next_step_date_and_time) {
            const nextStep = new Date(ticketData.u_next_step_date_and_time);
            const now = new Date();
            const isOverdue = nextStep < now;
            const timeDiff = Math.abs(nextStep - now);
            const hoursDiff = Math.floor(timeDiff / (1000 * 60 * 60));
            
            if (isOverdue) {
                messageParts.push(`⏰ OVERDUE by ${hoursDiff}h`);
            } else {
                messageParts.push(`⏰ Due in ${hoursDiff}h`);
            }
        }
        
        // Service downtime info
        if (ticketData.u_service_downtime_started && ticketData.u_service_downtime_end) {
            const startTime = new Date(ticketData.u_service_downtime_started);
            const endTime = new Date(ticketData.u_service_downtime_end);
            const duration = Math.floor((endTime - startTime) / (1000 * 60 * 60));
            messageParts.push(`🔧 Downtime: ${duration}h`);
        }
        
        // Resolution info for updated tickets
        if (ticketData.resolved_by && ticketData.resolved_by.display_value) {
            messageParts.push(`✅ Resolved by: ${ticketData.resolved_by.display_value}`);
        }
        
        // Account/customer info
        if (ticketData.account && ticketData.account.display_value) {
            messageParts.push(`🏢 Account: ${ticketData.account.display_value}`);
        }
        
        // Modification count (for subsequent updates)
        if (ticketData.sys_mod_count > 1) {
            messageParts.push(`🔄 Updated ${ticketData.sys_mod_count} times`);
        }
        
        notificationMessage = messageParts.join('\n');
    } else {
        notificationMessage = 'New ServiceNow item';
    }

    try {
        await chrome.notifications.create('reminder', {
            type: 'basic',
            iconUrl: chrome.runtime.getURL(`images/${imageName}`),
            title: notificationTitle,
            message: notificationMessage
        });

        // Auto-clear notification after 8 seconds (longer for detailed info)
        setTimeout(async () => {
            await chrome.notifications.clear('reminder');
        }, 8000);
    } catch (error) {
        console.error('Error creating notification:', error);
    }
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
        restURL += `${separator}JSONv2&sysparm_fields=number,severity,short_description,priority,sys_id,sys_updated_on`;
        
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
        // Get ticket details from storage or current state
        const tickets = state.newList.slice(0, 5).map(ticketNum => ({
            number: ticketNum,
            description: 'ServiceNow ticket' // Could be enhanced with real descriptions
        }));
        
        // Send message to all tabs (options page)
        const tabs = await chrome.tabs.query({});
        for (const tab of tabs) {
            if (tab.url && tab.url.includes('options.html')) {
                chrome.tabs.sendMessage(tab.id, {
                    type: 'TICKET_UPDATE',
                    queueACount: state.currentNumberTickets,
                    queueBCount: state.currentNumberTask,
                    totalCount: state.currentNumberTotal,
                    tickets: tickets
                }).catch(() => {
                    // Ignore errors if tab is closed or not ready
                });
            }
        }
    } catch (error) {
        console.log('Could not send ticket update to options:', error);
    }
}
