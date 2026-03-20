// ServiceNow Audio Alerts - Modern Options Script (Manifest V3)
// Upgraded from legacy options.js for better security and performance

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
    await initializeOptions();
    setupEventListeners();
    await restoreOptions();
    updateLastPollTime();
});

async function initializeOptions() {
    try {
        // Set popup window size
        const currentWindow = await chrome.windows.getCurrent();
        const htmlStyle = document.querySelector('html').style;
        htmlStyle.width = (currentWindow.width * 0.25) + 'px';
        
        // Hide status message initially
        const status = document.getElementById('status');
        if (status) status.style.display = 'none';
        
        // Hide url field if it exists
        const urlField = document.getElementById('urlfield');
        if (urlField) urlField.style.display = 'none';
    } catch (error) {
        console.error('Error initializing options:', error);
    }
}

function setupEventListeners() {
    // Button listeners
    const saveBtn = document.getElementById('save');
    const clearBtn = document.getElementById('clear');
    
    if (saveBtn) saveBtn.addEventListener('click', saveOptions);
    if (clearBtn) clearBtn.addEventListener('click', clearOptions);
    
    // Input field listeners for auto-save
    const autoSaveFields = ['idprimaryq', 'idrooturl', 'idsecondaryq'];
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
    
    // Clicker functionality for toggle views
    const clickers = document.querySelectorAll('.clicker');
    clickers.forEach(clicker => {
        clicker.addEventListener('click', (event) => {
            const classes = event.currentTarget.className.split(/\s+/);
            const lastClass = classes[classes.length - 1];
            toggleView(lastClass);
        });
    });
}

function toggleView(className) {
    const prefix = className.charAt(0);
    let selector;
    
    if (prefix === 'q') {
        selector = `.queue${className.slice(-1)}`;
    } else if (prefix === 'l') {
        selector = `.list${className.slice(-1)}`;
    } else {
        selector = `.myHide${className.slice(-1)}`;
    }
    
    const element = document.querySelector(selector);
    if (element) {
        element.style.display = element.style.display === 'none' ? 'block' : 'none';
    }
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
            splitcount: document.querySelector("input[name='splitcount']:checked")?.value || 'false',
            disableAlarm: document.getElementById('disableAlarm')?.checked ? 'on' : 'off',
            disablePoll: document.getElementById('disablePoll')?.checked ? 'on' : 'off',
            alarmCondition: document.querySelector("input[name='alarmCondition']:checked")?.value || 'nonZeroCount'
        };
        
        await chrome.storage.sync.set(saveData);
        
        showSuccessMessage('Options saved successfully!');
        
        // Notify background script to update
        chrome.runtime.sendMessage({ type: 'SNOW_AUDIO_ALERT_OPTIONS_UPDATED' });
        
        window.scrollTo(0, 0);
        
    } catch (error) {
        console.error('Error saving options:', error);
        showErrorMessage('Error saving options. Please try again.');
    }
}

// Get last poll time from storage
async function updateLastPollTime() {
    try {
        const result = await chrome.storage.local.get(['lastPollAt']);
        const lastPollElement = document.getElementById('lastPollAt');
        if (lastPollElement) {
            lastPollElement.textContent = result.lastPollAt || 'Never';
        }
    } catch (error) {
        console.error('Error getting last poll time:', error);
    }
}

// Utility function to check if value is empty
function isEmpty(value) {
    return value === undefined || value === null || value === '' || value === NaN;
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
    status.className = type;
    status.style.display = 'block';
    
    setTimeout(() => {
        status.style.display = 'none';
        status.textContent = '';
        status.className = '';
    }, 3000);
}

// Clear all options
async function clearOptions() {
    try {
        await chrome.storage.sync.clear();
        
        // Reset UI
        const textInputs = document.querySelectorAll('input[type="text"]');
        textInputs.forEach(input => input.value = '');
        
        // Reset checkboxes
        const checkboxes = ['disableAlarm', 'disablePoll'];
        checkboxes.forEach(id => {
            const checkbox = document.getElementById(id);
            if (checkbox) checkbox.checked = false;
        });
        
        // Set default values
        const splitcountFalse = document.getElementById('splitcountfalse');
        if (splitcountFalse) splitcountFalse.checked = true;
        
        const nonZeroCount = document.getElementById('nonZeroCount');
        if (nonZeroCount) nonZeroCount.checked = true;
        
        // Reset poll interval
        const pollInterval = document.getElementById('pollInterval');
        if (pollInterval) pollInterval.value = '5';
        
        showSuccessMessage('All options cleared!');
        
        // Notify background script
        chrome.runtime.sendMessage({ type: 'SNOW_AUDIO_ALERT_OPTIONS_UPDATED' });
        
    } catch (error) {
        console.error('Error clearing options:', error);
        showErrorMessage('Error clearing options. Please try again.');
    }
}




// Restore options from storage
async function restoreOptions() {
    try {
        const items = await chrome.storage.sync.get([
            'rooturl', 'primary', 'secondary', 'disableAlarm', 
            'disablePoll', 'pollInterval', 'alarmCondition', 'splitcount'
        ]);
        
        // Restore split count setting
        const splitcountTrue = document.getElementById('splitcounttrue');
        const splitcountFalse = document.getElementById('splitcountfalse');
        if (items.splitcount === 'true' && splitcountTrue) {
            splitcountTrue.checked = true;
        } else if (splitcountFalse) {
            splitcountFalse.checked = true;
        }
        
        // Restore alarm condition
        const nonZeroCount = document.getElementById('nonZeroCount');
        const alarmOnNewEntry = document.getElementById('alarmOnNewEntry');
        if (items.alarmCondition === 'nonZeroCount' && nonZeroCount) {
            nonZeroCount.checked = true;
        } else if (alarmOnNewEntry) {
            alarmOnNewEntry.checked = true;
        }
        
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
        
    } catch (error) {
        console.error('Error restoring options:', error);
        showErrorMessage('Error loading saved options.');
    }
}



