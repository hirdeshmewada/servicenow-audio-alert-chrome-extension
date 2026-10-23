// Content script for Service Status - forwards messages between extension and injected bridge script
console.log('[SERVICE STATUS CONTENT] Content script loaded');

// Listen for messages from extension popup
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.type === 'TRIGGER_FLT') {
        console.log('[SERVICE STATUS CONTENT] Forwarding FLT trigger to page');
        
        // Forward to injected bridge script via window.postMessage
        window.postMessage({
            type: 'TRIGGER_FLT',
            sys_id: request.sys_id
        }, '*');
        
        return true; // Keep message channel open for async response
    }
});

// Listen for messages from injected bridge script
window.addEventListener('message', function(event) {
    if (event.data && event.data.type === 'FLT_TRIGGER_RESPONSE') {
        console.log('[SERVICE STATUS CONTENT] Received FLT response from bridge');
        
        // Forward back to extension
        chrome.runtime.sendMessage(event.data);
    }
    
    if (event.data && event.data.type === 'SERVICE_STATUS_BRIDGE_READY') {
        console.log('[SERVICE STATUS CONTENT] Bridge is ready');
        
        // Forward to extension
        chrome.runtime.sendMessage({
            type: 'SERVICE_STATUS_BRIDGE_READY'
        });
    }
});
