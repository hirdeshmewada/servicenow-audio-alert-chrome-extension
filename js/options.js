// ServiceNow Audio Alerts - Modern Options Script (Manifest V3)
// Redesigned for clean 3-tab UI

// Global state
let currentTab = 'tickets';
let isMonitoring = false;
let isMuted = false;
let countdownTimer = null;
let currentPollInterval = 5; // Default 5 minutes
let lastPollTime = null;
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
    
    // Start timer if monitoring is active
    const disablePollCheckbox = document.getElementById('disablePoll');
    if (!disablePollCheckbox || !disablePollCheckbox.checked) {
        // Check if we have recent data to determine if monitoring should be active
        const result = await chrome.storage.local.get(['lastTicketCounts', 'lastPollAt']);
        const hasRecentData = result.lastTicketCounts && 
                            (Date.now() - result.lastTicketCounts.timestamp < 10 * 60 * 1000);
        const hasRecentPoll = result.lastPollAt && 
                            (Date.now() - new Date(result.lastPollAt).getTime() < 15 * 60 * 1000);
        
        if (hasRecentData || hasRecentPoll) {
            isMonitoring = true;
            startCountdownTimer();
        }
    }
    
    updateMonitoringStatus();
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
    const testNotificationBtn = document.getElementById('testNotification');
    
    if (saveBtn) saveBtn.addEventListener('click', saveOptions);
    if (testAudioBtn) testAudioBtn.addEventListener('click', testAudioNotification);
    if (testNotificationBtn) testNotificationBtn.addEventListener('click', testNotification);
    
    // Input field listeners for auto-save
    const autoSaveFields = ['idprimaryq', 'idrooturl', 'idsecondaryq', 'primaryNotificationText', 'secondaryNotificationText'];
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
    
    // Special handling for poll interval - immediate timer update
    const pollIntervalField = document.getElementById('pollInterval');
    if (pollIntervalField) {
        pollIntervalField.addEventListener('focusout', () => {
            saveOptions();
            updateMonitoringStatus(); // Force timer restart with new interval
        });
        pollIntervalField.addEventListener('keyup', (event) => {
            if (event.key === 'Enter') {
                saveOptions();
                updateMonitoringStatus(); // Force timer restart with new interval
            }
        });
    }

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
    const pollIntervalInput = document.getElementById('pollInterval');
    
    // Update poll interval with validation
    const oldPollInterval = currentPollInterval;
    if (pollIntervalInput) {
        const interval = parseInt(pollIntervalInput.value, 10);
        if (!isNaN(interval) && interval > 0 && interval !== currentPollInterval) {
            currentPollInterval = interval;
            console.log('=== POLL INTERVAL UPDATED ===');
            console.log('Old interval:', oldPollInterval, 'minutes');
            console.log('New interval:', currentPollInterval, 'minutes');
            
            // Force restart countdown timer with new interval
            if (isMonitoring && (!disablePollCheckbox || !disablePollCheckbox.checked)) {
                console.log('Restarting countdown timer with new interval');
                startCountdownTimer();
            }
        }
    }
    
    if (statusElement) {
        if (disablePollCheckbox && disablePollCheckbox.checked) {
            statusElement.textContent = 'Stopped';
            statusElement.className = 'status-badge status-stopped';
            isMonitoring = false;
            stopCountdownTimer();
        } else if (isMonitoring) {
            statusElement.textContent = 'Active';
            statusElement.className = 'status-badge status-active';
            startCountdownTimer();
        } else {
            statusElement.textContent = 'Stopped';
            statusElement.className = 'status-badge status-stopped';
            stopCountdownTimer();
        }
    }
    
    updateMonitoringButton();
}

// Enhanced ServiceNow URL validation function
function validateServiceNowURL(url) {
    if (!url || typeof url !== 'string') return false;
    try {
        // Handle new ServiceNow UI URLs with multiple encoding
        let processedUrl = url;
        if (url.includes('/now/nav/ui/classic/params/target/')) {
            console.log('Detected new ServiceNow UI URL in validation, processing...');
            
            const targetMatch = url.match(/params\/target\/(.+)$/);
            if (targetMatch) {
                let targetUrl = targetMatch[1];
                
                // Progressive decoding - handle multiple encoding levels
                let decodedUrl = progressiveDecode(targetUrl);
                console.log('Progressively decoded URL for validation:', decodedUrl);
                
                // Rebuild full URL
                const urlMatch = url.match(/(https:\/\/[^\/]+)/);
                if (urlMatch) {
                    processedUrl = urlMatch[1] + '/' + decodedUrl;
                    console.log('Rebuilt URL for validation:', processedUrl);
                }
            }
        }
        
        const urlObj = new URL(processedUrl);
        return urlObj.protocol === 'https:' && urlObj.hostname.includes('service-now.com');
    } catch (error) {
        console.error('URL validation error:', error);
        return false;
    }
}

// Progressive decoding for multiple encoding levels (copied from background.js)
function progressiveDecode(encodedString) {
    let decoded = encodedString;
    let previousDecoded;
    let decodeCount = 0;
    const maxDecodes = 5; // Prevent infinite loops
    
    do {
        previousDecoded = decoded;
        try {
            decoded = decodeURIComponent(decoded);
            decodeCount++;
        } catch (e) {
            console.log('Decoding failed at iteration', decodeCount + 1, ':', e.message);
            break;
        }
    } while (decoded !== previousDecoded && decodeCount < maxDecodes);
    
    return decoded;
}

// Save options with validation
async function saveOptions() {
    try {
        console.log('=== SAVING OPTIONS ===');
        const primary = document.getElementById('idprimaryq')?.value || '';
        const rooturl = document.getElementById('idrooturl')?.value || '';
        const secondary = document.getElementById('idsecondaryq')?.value || '';
        
        console.log('Primary URL:', primary);
        console.log('Root URL:', rooturl);
        console.log('Secondary URL:', secondary);
        
        // Validate URLs
        if (primary && !validateServiceNowURL(primary)) {
            console.error('Primary URL validation failed:', primary);
            showErrorMessage('Primary URL must be a valid ServiceNow HTTPS URL');
            return;
        }
        
        if (secondary && !validateServiceNowURL(secondary)) {
            console.error('Secondary URL validation failed:', secondary);
            showErrorMessage('Secondary URL must be a valid ServiceNow HTTPS URL');
            return;
        }
        
        if (rooturl && !validateServiceNowURL(rooturl)) {
            console.error('Root URL validation failed:', rooturl);
            showErrorMessage('Base URL must be a valid ServiceNow HTTPS URL');
            return;
        }
        
        console.log('All URLs validated successfully!');
        
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
            alarmCondition: document.querySelector("input[name='alarmCondition']:checked")?.value || 'nonZeroCount',
            primaryNotificationText: document.getElementById('primaryNotificationText')?.value?.trim() || 'New tickets in Queue 1',
            secondaryNotificationText: document.getElementById('secondaryNotificationText')?.value?.trim() || 'New tickets in Queue 2'
        };
        
        console.log('Save data:', saveData);
        
        await chrome.storage.sync.set(saveData);
        
        // Update queue URLs in the UI
        updateQueueUrls(saveData);
        
        // Notify background script to update
        chrome.runtime.sendMessage({ type: 'SNOW_AUDIO_ALERT_OPTIONS_UPDATED' });
        
        console.log('Options saved successfully');
        showSuccessMessage('✅ Configuration saved successfully!');
        
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
            'disablePoll', 'pollInterval', 'alarmCondition', 'splitcount',
            'primaryNotificationText', 'secondaryNotificationText'
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

        // Restore notification text fields
        const notificationTextFields = {
            'primaryNotificationText': items.primaryNotificationText || 'New tickets in Queue 1',
            'secondaryNotificationText': items.secondaryNotificationText || 'New tickets in Queue 2'
        };
        
        Object.entries(notificationTextFields).forEach(([fieldId, value]) => {
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

// Test notification function
async function testNotification() {
    try {
        // Send message to background script to create test notification
        await chrome.runtime.sendMessage({ 
            type: "TEST_NOTIFICATION",
            ticketNumber: "INC0012345",
            ticketDescription: "This is a test notification to verify the notification system is working properly.",
            severity: "3"
        });
        
        showSuccessMessage('🔔 Test notification sent!');
        
    } catch (error) {
        console.error('Error sending test notification:', error);
        showErrorMessage('❌ Could not send test notification.');
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
    
    // Update ticket data and persist it
    ticketData.queueA.count = queueACount;
    ticketData.queueB.count = queueBCount;
    ticketData.total = totalCount;
    
    // Save to local storage to persist between UI updates
    chrome.storage.local.set({
        lastTicketCounts: {
            queueACount: queueACount,
            queueBCount: queueBCount,
            totalCount: totalCount,
            timestamp: Date.now()
        }
    });
}

// Countdown timer functions
function startCountdownTimer() {
    console.log('=== STARTING COUNTDOWN TIMER ===');
    console.log('Current poll interval:', currentPollInterval, 'minutes');
    
    // ALWAYS clear existing timer first to prevent multiple timers
    stopCountdownTimer();
    
    // Calculate remaining time based on last poll
    calculateAndStartCountdown();
}

function calculateAndStartCountdown() {
    chrome.storage.local.get(['lastPollAt'], function(result) {
        let secondsRemaining = currentPollInterval * 60; // Default to full interval
        
        if (result.lastPollAt) {
            const lastPollTime = new Date(result.lastPollAt).getTime();
            const timeSinceLastPoll = Date.now() - lastPollTime;
            const intervalMs = currentPollInterval * 60 * 1000;
            
            // Calculate remaining time in the current interval
            secondsRemaining = Math.max(0, Math.ceil((intervalMs - timeSinceLastPoll) / 1000));
            
            // If we're past the next poll time, reset to full interval
            if (secondsRemaining <= 0) {
                secondsRemaining = currentPollInterval * 60;
            }
        }
        
        console.log('Starting countdown with', secondsRemaining, 'seconds remaining');
        console.log('Poll interval:', currentPollInterval, 'minutes =', currentPollInterval * 60, 'seconds');
        updateCountdownDisplay(secondsRemaining);
        
        // Set the new timer
        countdownTimer = setInterval(() => {
            secondsRemaining--;
            updateCountdownDisplay(secondsRemaining);
            
            if (secondsRemaining <= 0) {
                // Reset countdown for next interval
                secondsRemaining = currentPollInterval * 60;
                console.log('Countdown reset to', secondsRemaining, 'seconds for next interval');
            }
        }, 1000);
        
        console.log('Countdown timer started with ID:', countdownTimer);
    });
}

function stopCountdownTimer() {
    console.log('=== STOPPING COUNTDOWN TIMER ===');
    
    if (countdownTimer) {
        console.log('Clearing existing timer ID:', countdownTimer);
        clearInterval(countdownTimer);
        countdownTimer = null;
    } else {
        console.log('No active timer to stop');
    }
    
    // Reset display
    const countdownElement = document.getElementById('nextPollCountdown');
    const progressBar = document.getElementById('countdownProgress');
    const countdownValue = countdownElement ? countdownElement.querySelector('.countdown-value') : null;
    
    if (countdownValue) {
        countdownValue.textContent = '--:--';
        countdownValue.className = 'countdown-value';
    }
    
    if (progressBar) {
        progressBar.style.width = '0%';
        progressBar.className = 'countdown-progress-bar';
    }
}

function updateCountdownDisplay(seconds) {
    const countdownElement = document.getElementById('nextPollCountdown');
    const progressBar = document.getElementById('countdownProgress');
    const countdownValue = countdownElement.querySelector('.countdown-value');
    
    if (!countdownElement || !progressBar || !countdownValue) return;
    
    if (seconds <= 0) {
        countdownValue.textContent = 'Polling...';
        countdownValue.className = 'countdown-value';
        progressBar.style.width = '0%';
        progressBar.className = 'countdown-progress-bar';
        return;
    }
    
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    const display = `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    countdownValue.textContent = display;
    
    // Calculate progress percentage
    const totalSeconds = currentPollInterval * 60;
    const progressPercentage = (seconds / totalSeconds) * 100;
    progressBar.style.width = progressPercentage + '%';
    
    // Update colors based on time remaining
    if (seconds <= 30) {
        // Last 30 seconds - red danger state
        countdownValue.className = 'countdown-value danger';
        progressBar.className = 'countdown-progress-bar danger';
    } else if (seconds <= 60) {
        // Last minute - orange warning state
        countdownValue.className = 'countdown-value warning';
        progressBar.className = 'countdown-progress-bar warning';
    } else {
        // Normal state - blue
        countdownValue.className = 'countdown-value';
        progressBar.className = 'countdown-progress-bar';
    }
}

function stopCountdownTimer() {
    if (countdownTimer) {
        clearInterval(countdownTimer);
        countdownTimer = null;
    }
    
    const countdownElement = document.getElementById('nextPollCountdown');
    const progressBar = document.getElementById('countdownProgress');
    const countdownValue = countdownElement ? countdownElement.querySelector('.countdown-value') : null;
    
    if (countdownValue) {
        countdownValue.textContent = '--:--';
        countdownValue.className = 'countdown-value';
    }
    
    if (progressBar) {
        progressBar.style.width = '0%';
        progressBar.className = 'countdown-progress-bar';
    }
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

// Convert state numbers to readable state names (Official ServiceNow State Mapping)
function getStateName(stateNumber) {
    const STATE_MAP = {
        "1": "New",
        "2": "In Progress", 
        "3": "On Hold",
        "4": "Resolved",
        "5": "Closed",
        "6": "Canceled",
        "7": "Awaiting Problem",
        "8": "Awaiting User Info",
        "9": "Awaiting Evidence",
        "10": "Awaiting Vendor",
        "11": "Resolved by Caller"
    };
    return STATE_MAP[stateNumber] || `State ${stateNumber}`;
}

// Convert impact numbers to readable names
function getImpactName(impactNumber) {
    const IMPACT_MAP = {
        "1": "High",
        "2": "Medium", 
        "3": "Low",
        "4": "Planning"
    };
    return IMPACT_MAP[impactNumber] || `Impact ${impactNumber}`;
}

// Convert urgency numbers to readable names
function getUrgencyName(urgencyNumber) {
    const URGENCY_MAP = {
        "1": "High",
        "2": "Medium", 
        "3": "Low"
    };
    return URGENCY_MAP[urgencyNumber] || `Urgency ${urgencyNumber}`;
}

// Convert priority numbers to readable names
function getPriorityName(priorityNumber) {
    const PRIORITY_MAP = {
        "1": "Critical",
        "2": "High", 
        "3": "Moderate",
        "4": "Low",
        "5": "Planning"
    };
    return PRIORITY_MAP[priorityNumber] || `Priority ${priorityNumber}`;
}

// Convert contact type to readable name
function getContactTypeName(contactType) {
    const CONTACT_TYPE_MAP = {
        "Phone": "Phone",
        "Email": "Email", 
        "Chat": "Chat",
        "Self-service": "Self-service",
        "IVR": "IVR",
        "Fault Management": "Fault Management",
        "Proactive": "Proactive"
    };
    return CONTACT_TYPE_MAP[contactType] || contactType;
}

// Format date/time for display
function formatDateTime(dateTimeStr) {
    if (!dateTimeStr || dateTimeStr === 'Not set') return 'Not set';
    
    try {
        const date = new Date(dateTimeStr);
        if (isNaN(date.getTime())) return dateTimeStr;
        
        // Format as local date/time
        return date.toLocaleString('en-US', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });
    } catch (error) {
        return dateTimeStr;
    }
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
    const ticketHtml = displayTickets.map(ticket => {
        // Get assigned to information
        const assignedTo = ticket.assigned_to?.display_value || 
                         ticket.assignment_group?.display_value || 
                         ticket.assignment_group || 
                         'Unassigned';
        
        // Get next step date/time (formatted)
        const nextStepDateTime = formatDateTime(
            ticket.due_date || 
            ticket.expected_start || 
            ticket.work_end || 
            'Not set'
        );
        
        // Get state name
        const stateName = getStateName(ticket.state?.toString() || '1');
        
        // Get impact/priority if available
        const impact = ticket.impact ? getImpactName(ticket.impact.toString()) : '';
        const priority = ticket.priority ? getPriorityName(ticket.priority.toString()) : '';
        
        // Build additional info string
        let additionalInfo = '';
        if (impact && priority) {
            additionalInfo = `${impact} / ${priority}`;
        } else if (impact) {
            additionalInfo = impact;
        } else if (priority) {
            additionalInfo = priority;
        }
        
        return `
            <div class="ticket-item">
                <div class="ticket-header">
                    <div class="ticket-number">${ticket.number}</div>
                    <div class="ticket-state">${stateName}</div>
                </div>
                <div class="ticket-details">
                    <div class="ticket-assigned">👤 ${assignedTo}</div>
                    <div class="ticket-next-step">📅 ${nextStepDateTime}</div>
                </div>
                ${additionalInfo ? `<div class="ticket-priority">⚡ ${additionalInfo}</div>` : ''}
            </div>
        `;
    }).join('');
    
    ticketListElement.innerHTML = ticketHtml;
}

// Start real-time updates from background script
function startRealTimeUpdates() {
    // Load persisted ticket counts on startup
    loadPersistedTicketData();
    
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
            // Reset countdown when new data arrives
            startCountdownTimer();
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
    
    // Add debug function for testing (but don't auto-trigger)
    window.testTicketUpdate = function() {
        console.log('Manual test trigger - this will override real data');
        updateTicketCounts(5, 3, 8);
        updateTicketList([
            { number: 'INC0012345', description: 'Test incident 1' },
            { number: 'TASK0012345', description: 'Test task 1' },
            { number: 'CHG0012345', description: 'Test change 1' }
        ]);
    };
    
    // Remove auto-test to prevent overriding real data
    // The extension should show real data or persisted data until actual polling occurs
}

// Load persisted ticket data from local storage
async function loadPersistedTicketData() {
    try {
        const result = await chrome.storage.local.get(['lastTicketCounts', 'lastPollAt']);
        console.log('Loading persisted data:', result);
        
        if (result.lastTicketCounts) {
            const data = result.lastTicketCounts;
            const age = Date.now() - data.timestamp;
            const maxAge = 10 * 60 * 1000; // 10 minutes max age
            
            // Only restore if data is recent (less than 10 minutes old)
            if (age < maxAge) {
                console.log('Restoring persisted ticket data:', data);
                updateTicketCounts(data.queueACount, data.queueBCount, data.totalCount);
            } else {
                console.log('Persisted data too old (' + Math.round(age/1000/60) + ' minutes), using zeros');
                // Clear old data
                updateTicketCounts(0, 0, 0);
            }
        } else {
            console.log('No persisted ticket data found');
        }
        
        // Always update last poll time if available
        if (result.lastPollAt) {
            const pollAge = Date.now() - new Date(result.lastPollAt).getTime();
            console.log('Last poll was ' + Math.round(pollAge/1000/60) + ' minutes ago');
        }
        
    } catch (error) {
        console.error('Error loading persisted ticket data:', error);
    }
}



