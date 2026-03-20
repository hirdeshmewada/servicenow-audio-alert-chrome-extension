// ServiceNow Audio Alerts - Modern Service Worker (Manifest V3)
// Upgraded from legacy background.js for better security and performance

// Global state management
const state = {
    currentNumberTickets: 0,
    currentNumberTask: 0,
    currentNumberTotal: 0,
    ticketNumberGlobal: null,
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
                await showNotification(data.number, data.description, data.severity);
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
                    await showNotification(latestData.number, latestData.description, latestData.severity);
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
                timestamp: 0
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
                    quantity: records.length,
                    number: ticketNumber,
                    severity: severity,
                    description: record.short_description || 'No description',
                    timestamp: timestamp
                };
            }
        });

        return latestRecord || {
            quantity: records.length,
            number: records[0]?.number || null,
            severity: records[0]?.priority || "5",
            description: records[0]?.short_description || 'No description',
            timestamp: maxTimestamp
        };

    } catch (error) {
        console.error('Error fetching data from ServiceNow:', error);
        chrome.action.setBadgeText({ text: "Err" });
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

async function showNotification(ticketNumber, ticketDescription, severity) {
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

    try {
        await chrome.notifications.create('reminder', {
            type: 'basic',
            iconUrl: chrome.runtime.getURL(`images/${imageName}`),
            title: ticketNumber,
            message: ticketDescription || 'New ServiceNow item'
        });

        // Auto-clear notification after 5 seconds
        setTimeout(async () => {
            await chrome.notifications.clear('reminder');
        }, 5000);
    } catch (error) {
        console.error('Error creating notification:', error);
    }
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
