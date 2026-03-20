// ServiceNow Audio Alerts - Modern Options Script (Manifest V3)
// Redesigned for clean 3-tab UI

// Global state
let currentTab = 'tickets';
let isMonitoring = false;
let isMuted = false;
let ticketData = {
    queueA: { count: 0, url: '', tickets: [], previousCount: 0 },
    queueB: { count: 0, url: '', tickets: [], previousCount: 0 },
    total: 0,
    previousTotal: 0,
    lastPoll: 'Never'
};

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
    await initializeOptions();
    setupEventListeners();
    await restoreOptions();
    updateLastPollTime();
    startRealTimeUpdates();
});

async function initializeOptions() {
    try {
        // Hide status message initially
        const status = document.getElementById('status');
        if (status) status.style.display = 'none';
    } catch (error) {
        console.error('Error initializing options:', error);
    }
}

function setupEventListeners() {
    // Tab switching
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', (e) => switchTab(e.target.dataset.tab));
    });

    // Header controls
    const startStopBtn = document.getElementById('startStopBtn');
    const stopAlarmBtn = document.getElementById('stopAlarmBtn');
    
    if (startStopBtn) startStopBtn.addEventListener('click', toggleMonitoring);
    if (stopAlarmBtn) stopAlarmBtn.addEventListener('click', stopCurrentAlarm);

    // Button listeners
    const saveBtn = document.getElementById('save');
    const testAudioBtn = document.getElementById('testAudio');
    
    if (saveBtn) saveBtn.addEventListener('click', saveOptions);
    if (testAudioBtn) testAudioBtn.addEventListener('click', testAudioNotification);
    
    // Input field listeners for auto-save
    const autoSaveFields = ['idprimaryq', 'idrooturl', 'idsecondaryq', 'pollInterval'];
    autoSaveFields.forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (field) {
            field.addEventListener('focusout', () => saveOptions());
            field.addEventListener('keyup', (event) => {
                if (event.key === 'Enter') {
                    saveOptions();
                }
            });
        }
    });

    // Toggle listeners for immediate feedback
    const toggleFields = ['disableAlarm', 'disablePoll'];
    toggleFields.forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (field) {
            field.addEventListener('change', () => {
                saveOptions();
                updateMonitoringStatus();
            });
        }
    });

    // Radio button listeners
    const radioButtons = document.querySelectorAll('input[name="alarmCondition"]');
    radioButtons.forEach(radio => {
        radio.addEventListener('change', saveOptions);
    });

    // Select dropdown listener
    const splitCountSelect = document.getElementById('splitcount');
    if (splitCountSelect) {
        splitCountSelect.addEventListener('change', saveOptions);
    }
}

function switchTab(tabName) {
    // Update tab buttons
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(tab => {
        tab.classList.remove('active');
        if (tab.dataset.tab === tabName) {
            tab.classList.add('active');
        }
    });

    // Update tab content
    const tabContents = document.querySelectorAll('.tab-content');
    tabContents.forEach(content => {
        content.classList.remove('active');
    });
    
    const activeContent = document.getElementById(tabName);
    if (activeContent) {
        activeContent.classList.add('active');
    }

    currentTab = tabName;
}

async function stopCurrentAlarm() {
    try {
        // Send message to offscreen document to stop audio
        await chrome.runtime.sendMessage({ type: "STOP_AUDIO" });
        showSuccessMessage('⏹️ Current alarm stopped');
    } catch (error) {
        console.error('Error stopping alarm:', error);
        showErrorMessage('❌ Could not stop alarm');
    }
}

async function toggleMonitoring() {
    isMonitoring = !isMonitoring;
    updateMonitoringButton();
    updateMonitoringStatus();
    
    if (isMonitoring) {
        showSuccessMessage('🟢 Monitoring started');
        // Trigger background script to start polling
        chrome.runtime.sendMessage({ type: 'SNOW_AUDIO_ALERT_OPTIONS_UPDATED' });
    } else {
        showSuccessMessage('🔴 Monitoring stopped');
    }
    
    // Save monitoring state
    await chrome.storage.local.set({ isMonitoring });
}

function updateMonitoringButton() {
    const startStopIcon = document.getElementById('startStopIcon');
    const startStopBtn = document.getElementById('startStopBtn');
    
    if (startStopIcon && startStopBtn) {
        if (isMonitoring) {
            startStopIcon.textContent = '⏸️';
            startStopBtn.classList.add('active');
            startStopBtn.title = 'Stop Monitoring';
        } else {
            startStopIcon.textContent = '▶️';
            startStopBtn.classList.remove('active');
            startStopBtn.title = 'Start Monitoring';
        }
    }
}

function updateMonitoringStatus() {
    const statusElement = document.getElementById('monitoringStatus');
    const disablePollCheckbox = document.getElementById('disablePoll');
    
    if (statusElement) {
        if (disablePollCheckbox && disablePollCheckbox.checked) {
            statusElement.textContent = 'Stopped';
            statusElement.className = 'status-badge status-stopped';
            isMonitoring = false;
        } else if (isMonitoring) {
            statusElement.textContent = 'Active';
            statusElement.className = 'status-badge status-active';
        } else {
            statusElement.textContent = 'Stopped';
            statusElement.className = 'status-badge status-stopped';
        }
    }
    
    updateMonitoringButton();
}

// URL validation function
function validateServiceNowURL(url) {
    if (!url || typeof url !== 'string') return false;
    try {
        const urlObj = new URL(url);
        return urlObj.protocol === 'https:' && urlObj.hostname.includes('service-now.com');
    } catch {
        return false;
    }
}

// Save options with validation
async function saveOptions() {
    try {
        const primary = document.getElementById('idprimaryq')?.value || '';
        const rooturl = document.getElementById('idrooturl')?.value || '';
        const secondary = document.getElementById('idsecondaryq')?.value || '';
        
        // Validate URLs
        if (primary && !validateServiceNowURL(primary)) {
            showErrorMessage('Primary URL must be a valid ServiceNow HTTPS URL');
            return;
        }
        
        if (secondary && !validateServiceNowURL(secondary)) {
            showErrorMessage('Secondary URL must be a valid ServiceNow HTTPS URL');
            return;
        }
        
        if (rooturl && !validateServiceNowURL(rooturl)) {
            showErrorMessage('Base URL must be a valid ServiceNow HTTPS URL');
            return;
        }
        
        // Parse and validate poll interval
        let pollInterval = parseInt(document.getElementById('pollInterval')?.value || '5', 10);
        if (isNaN(pollInterval) || pollInterval < 1) {
            pollInterval = 5;
        }
        
        const saveData = {
            primary: primary.trim(),
            rooturl: rooturl.trim(),
            secondary: secondary.trim(),
            pollInterval: pollInterval,
            splitcount: document.getElementById('splitcount')?.value || 'false',
            disableAlarm: document.getElementById('disableAlarm')?.checked ? 'on' : 'off',
            disablePoll: document.getElementById('disablePoll')?.checked ? 'on' : 'off',
            alarmCondition: document.querySelector("input[name='alarmCondition']:checked")?.value || 'nonZeroCount'
        };
        
        await chrome.storage.sync.set(saveData);
        
        // Update queue URLs in the UI
        updateQueueUrls(saveData);
        
        // Notify background script to update
        chrome.runtime.sendMessage({ type: 'SNOW_AUDIO_ALERT_OPTIONS_UPDATED' });
        
        console.log('Options saved successfully');
        
    } catch (error) {
        console.error('Error saving options:', error);
        showErrorMessage('Error saving options. Please try again.');
    }
}

function updateQueueUrls(data) {
    // Update Queue A URL
    const queueAUrlElement = document.getElementById('queueAUrl');
    if (queueAUrlElement) {
        if (data.primary) {
            const url = new URL(data.primary);
            queueAUrlElement.textContent = `${url.hostname}${url.pathname}`;
            queueAUrlElement.title = data.primary;
        } else {
            queueAUrlElement.textContent = 'Not configured';
            queueAUrlElement.title = '';
        }
    }

    // Update Queue B URL
    const queueBUrlElement = document.getElementById('queueBUrl');
    if (queueBUrlElement) {
        if (data.secondary) {
            const url = new URL(data.secondary);
            queueBUrlElement.textContent = `${url.hostname}${url.pathname}`;
            queueBUrlElement.title = data.secondary;
        } else {
            queueBUrlElement.textContent = 'Not configured';
            queueBUrlElement.title = '';
        }
    }
}

// Get last poll time from storage and convert to Indian time
async function updateLastPollTime() {
    try {
        const result = await chrome.storage.local.get(['lastPollAt']);
        const lastPollElement = document.getElementById('lastPollAt');
        if (lastPollElement) {
            if (result.lastPollAt) {
                // Convert to Indian time (IST = UTC+5:30)
                const pollDate = new Date(result.lastPollAt);
                const istTime = new Date(pollDate.getTime() + (5.5 * 60 * 60 * 1000) + (pollDate.getTimezoneOffset() * 60 * 1000));
                const formattedTime = istTime.toLocaleString('en-IN', {
                    timeZone: 'Asia/Kolkata',
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: false
                });
                lastPollElement.textContent = formattedTime;
                ticketData.lastPoll = formattedTime;
            } else {
                lastPollElement.textContent = 'Never';
                ticketData.lastPoll = 'Never';
            }
        }
    } catch (error) {
        console.error('Error getting last poll time:', error);
    }
}

// Show success message
function showSuccessMessage(message) {
    showMessage(message, 'success');
}

// Show error message
function showErrorMessage(message) {
    showMessage(message, 'error');
}

// Show message with auto-hide
function showMessage(message, type = 'success') {
    const status = document.getElementById('status');
    if (!status) return;
    
    status.textContent = message;
    status.className = `alert alert-${type}`;
    status.style.display = 'block';
    
    setTimeout(() => {
        status.style.display = 'none';
        status.textContent = '';
        status.className = 'alert';
    }, 3000);
}

// Restore options from storage
async function restoreOptions() {
    try {
        const items = await chrome.storage.sync.get([
            'rooturl', 'primary', 'secondary', 'disableAlarm', 
            'disablePoll', 'pollInterval', 'alarmCondition', 'splitcount'
        ]);
        
        // Restore URLs
        const urlFields = {
            'idrooturl': items.rooturl || '',
            'idsecondaryq': items.secondary || '',
            'idprimaryq': items.primary || ''
        };
        
        Object.entries(urlFields).forEach(([fieldId, value]) => {
            const field = document.getElementById(fieldId);
            if (field) field.value = value;
        });

        // Restore split count setting
        const splitcountSelect = document.getElementById('splitcount');
        if (splitcountSelect) {
            splitcountSelect.value = items.splitcount || 'false';
        }
        
        // Restore alarm condition
        const alarmCondition = items.alarmCondition || 'nonZeroCount';
        const radio = document.querySelector(`input[name="alarmCondition"][value="${alarmCondition}"]`);
        if (radio) radio.checked = true;
        
        // Restore checkboxes
        const disableAlarm = document.getElementById('disableAlarm');
        const disablePoll = document.getElementById('disablePoll');
        if (disableAlarm) disableAlarm.checked = items.disableAlarm === 'on';
        if (disablePoll) disablePoll.checked = items.disablePoll === 'on';
        
        // Restore poll interval
        let pollInterval = parseInt(items.pollInterval, 10);
        if (isNaN(pollInterval) || pollInterval < 1) {
            pollInterval = 5;
        }
        const pollIntervalInput = document.getElementById('pollInterval');
        if (pollIntervalInput) pollIntervalInput.value = pollInterval.toString();
        
        // Update queue URLs in UI
        updateQueueUrls(items);
        
        // Update monitoring status
        updateMonitoringStatus();
        
        // Restore monitoring state
        const monitoringState = await chrome.storage.local.get(['isMonitoring']);
        isMonitoring = monitoringState.isMonitoring || false;
        updateMonitoringButton();
        
    } catch (error) {
        console.error('Error restoring options:', error);
        showErrorMessage('Error loading saved options.');
    }
}

// Test audio notification function
async function testAudioNotification() {
    try {
        // Create offscreen document if it doesn't exist (same logic as background)
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

        // Send message to offscreen document to play audio (same as background)
        await chrome.runtime.sendMessage({ type: "PLAY_AUDIO" });
        
        // Show feedback message
        showSuccessMessage('🔊 Playing test audio via offscreen document...');
        
        // Show success message after a short delay
        setTimeout(() => {
            showSuccessMessage('✅ Audio test completed successfully!');
        }, 1000);
        
    } catch (error) {
        console.error('Error playing test audio:', error);
        showErrorMessage('❌ Could not play audio. Check browser permissions.');
    }
}

// Update ticket counts in real-time
function updateTicketCounts(queueACount, queueBCount, totalCount) {
    const queueACountElement = document.getElementById('queueACount');
    const queueBCountElement = document.getElementById('queueBCount');
    const totalCountElement = document.getElementById('totalCount');
    
    // Also update badge counts in queue details
    const queueACountBadge = document.getElementById('queueACountBadge');
    const queueBCountBadge = document.getElementById('queueBCountBadge');
    
    if (queueACountElement) {
        queueACountElement.textContent = queueACount;
        if (queueACountBadge) queueACountBadge.textContent = queueACount;
    }
    
    if (queueBCountElement) {
        queueBCountElement.textContent = queueBCount;
        if (queueBCountBadge) queueBCountBadge.textContent = queueBCount;
    }
    
    if (totalCountElement) totalCountElement.textContent = totalCount;
    
    // Update trends
    updateTrends(queueACount, queueBCount, totalCount);
    
    // Update ticket data
    ticketData.queueA.count = queueACount;
    ticketData.queueB.count = queueBCount;
    ticketData.total = totalCount;
}

// Update trend indicators
function updateTrends(queueACount, queueBCount, totalCount) {
    const queueATrend = document.getElementById('queueATrend');
    const queueBTrend = document.getElementById('queueBTrend');
    const totalTrend = document.getElementById('totalTrend');
    
    // Queue A trend
    if (queueATrend) {
        const prevCount = ticketData.queueA.previousCount;
        queueATrend.textContent = getTrendIcon(queueACount, prevCount);
        queueATrend.className = `analytics-trend ${getTrendClass(queueACount, prevCount)}`;
    }
    
    // Queue B trend
    if (queueBTrend) {
        const prevCount = ticketData.queueB.previousCount;
        queueBTrend.textContent = getTrendIcon(queueBCount, prevCount);
        queueBTrend.className = `analytics-trend ${getTrendClass(queueBCount, prevCount)}`;
    }
    
    // Total trend
    if (totalTrend) {
        const prevTotal = ticketData.previousTotal;
        totalTrend.textContent = getTrendIcon(totalCount, prevTotal);
        totalTrend.className = `analytics-trend ${getTrendClass(totalCount, prevTotal)}`;
    }
    
    // Update previous counts for next comparison
    ticketData.queueA.previousCount = ticketData.queueA.count;
    ticketData.queueB.previousCount = ticketData.queueB.count;
    ticketData.previousTotal = ticketData.total;
}

// Get trend icon based on count change
function getTrendIcon(current, previous) {
    if (current > previous) return '↑';
    if (current < previous) return '↓';
    return '→';
}

// Get trend class based on count change
function getTrendClass(current, previous) {
    if (current > previous) return 'up';
    if (current < previous) return 'down';
    return 'neutral';
}

// Update ticket list
function updateTicketList(tickets) {
    const ticketListElement = document.getElementById('ticketList');
    if (!ticketListElement) return;
    
    if (!tickets || tickets.length === 0) {
        ticketListElement.innerHTML = '<div class="empty-state">No tickets found</div>';
        return;
    }
    
    // Show max 5 tickets
    const displayTickets = tickets.slice(0, 5);
    const ticketHtml = displayTickets.map(ticket => `
        <div class="ticket-item">
            <div class="ticket-number">${ticket.number}</div>
            <div class="ticket-desc">${ticket.description || 'No description'}</div>
        </div>
    `).join('');
    
    ticketListElement.innerHTML = ticketHtml;
}

// Start real-time updates from background script
function startRealTimeUpdates() {
    // Listen for updates from background script via runtime
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message && message.type === 'TICKET_UPDATE') {
            console.log('Received ticket update:', message);
            updateTicketCounts(
                message.queueACount || 0,
                message.queueBCount || 0,
                message.totalCount || 0
            );
            updateTicketList(message.tickets || []);
            updateLastPollTime();
        } else if (message && message.type === 'TICKET_DATA_RESPONSE') {
            // Handle response to initial data request
            updateTicketCounts(
                message.queueACount || 0,
                message.queueBCount || 0,
                message.totalCount || 0
            );
            updateTicketList(message.tickets || []);
        }
    });
    
    // Request initial data
    chrome.runtime.sendMessage({ type: 'REQUEST_TICKET_DATA' });
    
    // Add debug function for testing
    window.testTicketUpdate = function() {
        console.log('Manual test trigger');
        updateTicketCounts(5, 3, 8);
        updateTicketList([
            { number: 'INC0012345', description: 'Test incident 1' },
            { number: 'TASK0012345', description: 'Test task 1' },
            { number: 'CHG0012345', description: 'Test change 1' }
        ]);
    };
    
    // Auto-test after 2 seconds if no data received
    setTimeout(() => {
        const queueACount = document.getElementById('queueACount');
        if (queueACount && queueACount.textContent === '0') {
            console.log('No data received, triggering test update');
            window.testTicketUpdate();
        }
    }, 2000);
}



