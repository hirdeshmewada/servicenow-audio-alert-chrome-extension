// ServiceNow Audio Alerts - Notification System Module
// Handles all browser notifications and notification queue management

// Notification queue system to prevent flooding
let notificationQueue = [];
let isProcessingNotifications = false;

// Process notifications one by one
async function processNotificationQueue() {
    if (isProcessingNotifications || notificationQueue.length === 0) {
        return;
    }
    
    isProcessingNotifications = true;
    
    while (notificationQueue.length > 0) {
        const notification = notificationQueue.shift();
        await createNotificationWithDelay(notification);
        // Wait 2 seconds between notifications to prevent flooding
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    isProcessingNotifications = false;
}

// Create notification with proper delay management
async function createNotificationWithDelay(notificationData) {
    const { ticketNumber, ticketDescription, severity, customTitle, queueUrl } = notificationData;
    
    console.log('Creating notification:', { ticketNumber, ticketDescription, severity, customTitle, queueUrl });
    
    // Use custom title if provided, otherwise use default
    const notificationTitle = customTitle || `${getPriorityLabel(parseInt(severity) || 5)} | ${ticketNumber}`;
    
    // Determine icon based on priority/severity
    let iconUrl;
    const priority = parseInt(severity) || 5; // Default to 5 if invalid
    
    switch(priority) {
        case 1:
            iconUrl = chrome.runtime.getURL('images/Sev1.gif');
            break;
        case 2:
            iconUrl = chrome.runtime.getURL('images/Sev2.png');
            break;
        case 3:
            iconUrl = chrome.runtime.getURL('images/Sev3.png');
            break;
        default:
            // Fallback to default icon for priorities 4, 5, or invalid
            iconUrl = chrome.runtime.getURL('images/ITSM128.png');
    }
    
    const notificationOptions = {
        type: 'basic',
        iconUrl: iconUrl,
        title: notificationTitle,
        message: ticketDescription,
        requireInteraction: true, // Require interaction to ensure Windows shows notifications
        isClickable: true, // Allow clicking on notification
        buttons: [
            {
                title: "❌ Close"
            }
        ]
    };
    
    console.log('Notification options:', notificationOptions);
    console.log('Icon URL:', iconUrl);
    console.log('Priority:', priority, 'Label:', getPriorityLabel(priority));
    
    // Create notification with unique ID based on ticket number
    const notificationId = `ticket_${ticketNumber}_${Date.now()}`;
    
    chrome.notifications.create(notificationId, notificationOptions, function(notificationId) {
        if (chrome.runtime.lastError) {
            console.error('Notification creation error:', chrome.runtime.lastError);
            // Try fallback without icon if image fails
            const fallbackOptions = {
                type: 'basic',
                title: notificationTitle,
                message: ticketDescription,
                requireInteraction: false,
                isClickable: true,
                buttons: [
                    {
                        title: "❌ Close",
                        iconUrl: chrome.runtime.getURL('images/ITSM128.png')
                    }
                ]
            };
            chrome.notifications.create(`fallback_${notificationId}`, fallbackOptions, function(fallbackId) {
                if (chrome.runtime.lastError) {
                    console.error('Fallback notification also failed:', chrome.runtime.lastError);
                } else {
                    console.log('Fallback notification created with ID:', fallbackId);
                    // Store queue URL for fallback
                    if (queueUrl) {
                        chrome.storage.local.set({
                            [`notification_${fallbackId}`]: queueUrl
                        }).catch(err => console.log('Could not store notification URL:', err));
                    }
                }
            });
        } else {
            console.log('Notification created with ID:', notificationId);
            
            // Store queue URL for this notification ID
            if (queueUrl) {
                chrome.storage.local.set({
                    [`notification_${notificationId}`]: queueUrl
                }).catch(err => console.log('Could not store notification URL:', err));
            }
        }
    });
    
    // Auto-clear popup after 8 seconds but keep in notification center
    // This ensures Windows notifications appear while still auto-dismissing
    setTimeout(function(){
        chrome.notifications.clear(notificationId, function(wasCleared) {
            if (wasCleared) {
                console.log('Notification popup cleared after 8 seconds:', notificationId);
                // Clean up stored URL
                chrome.storage.local.remove(`notification_${notificationId}`);
                console.log('Notification popup dismissed, but remains in notification center');
            }
        });
    }, 8000); // 8 seconds
}

// Main notification function
export function showNotification(ticketNumber, ticketDescription, severity, customTitle = null, queueUrl = null) {
    // Add to queue instead of creating immediately
    notificationQueue.push({
        ticketNumber,
        ticketDescription,
        severity,
        customTitle,
        queueUrl
    });
    
    // Start processing queue
    processNotificationQueue();
}

// Notification button click handler - handles Close button
export function setupNotificationButtonHandler() {
    chrome.notifications.onButtonClicked.addListener(async (notificationId, buttonIndex) => {
        console.log('Notification button clicked:', notificationId, 'Button index:', buttonIndex);
        
        try {
            if (buttonIndex === 0) {
                // Close button clicked
                console.log('Close button clicked - stopping audio and dismissing notification');
                await chrome.runtime.sendMessage({ type: "STOP_AUDIO" });
                console.log('Audio stopped via Close button');
                
                // Clear the notification after stopping audio
                chrome.notifications.clear(notificationId);
                chrome.storage.local.remove(`notification_${notificationId}`);
                console.log('Notification dismissed via Close button');
            }
        } catch (error) {
            console.error('Error handling notification button click:', error);
        }
    });
}

// Notification click handler - opens the specific queue URL and stops audio
export function setupNotificationClickHandler() {
    chrome.notifications.onClicked.addListener(async (notificationId) => {
        console.log('Notification body clicked:', notificationId);
        
        try {
            // Stop audio when opening queue
            await chrome.runtime.sendMessage({ type: "STOP_AUDIO" });
            console.log('Audio stopped when opening queue');
            
            // Get the stored queue URL for this notification
            const result = await chrome.storage.local.get([`notification_${notificationId}`]);
            const queueUrl = result[`notification_${notificationId}`];
            
            if (queueUrl) {
                console.log('Opening queue URL:', queueUrl);
                // Create new tab with the queue URL
                await chrome.tabs.create({ url: queueUrl });
                
                // Clear the notification after clicking
                chrome.notifications.clear(notificationId);
                chrome.storage.local.remove(`notification_${notificationId}`);
            } else {
                console.log('No queue URL found for notification:', notificationId);
                // Fallback to root URL if available
                const rootResult = await chrome.storage.sync.get(['rooturl']);
                if (rootResult.rooturl) {
                    await chrome.tabs.create({ url: rootResult.rooturl });
                }
            }
        } catch (error) {
            console.error('Error handling notification click:', error);
        }
    });
}

// Notification close handler - stops audio when user manually closes notification
export function setupNotificationCloseHandler() {
    chrome.notifications.onClosed.addListener(async (notificationId) => {
        console.log('Notification closed:', notificationId);
        
        try {
            // Stop any playing audio when user manually closes
            // (Auto-clear doesn't stop audio anymore since requireInteraction = false)
            console.log('Notification closed by user or auto-clear - stopping audio');
            await chrome.runtime.sendMessage({ type: "STOP_AUDIO" });
            console.log('Audio stopped due to notification close');
            
            // Always clean up stored URL
            chrome.storage.local.remove(`notification_${notificationId}`);
        } catch (error) {
            console.error('Error handling notification close:', error);
        }
    });
}

// Setup all notification handlers
export function setupNotificationHandlers() {
    setupNotificationButtonHandler();
    setupNotificationClickHandler();
    setupNotificationCloseHandler();
}

// Helper function to get priority label
function getPriorityLabel(severity) {
    const priorityMap = {
        "1": "CRITICAL",
        "2": "HIGH", 
        "3": "MEDIUM",
        "4": "LOW",
        "5": "PLANNED",
        "10": "SERVICE REQUEST",
        "15": "CHANGE"
    };
    return priorityMap[severity] || "TASK";
}

// Export for testing purposes
export function getNotificationQueue() {
    return [...notificationQueue];
}

export function clearNotificationQueue() {
    notificationQueue = [];
}
