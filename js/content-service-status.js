// Content script for Service Status - runs in ServiceNow page context
console.log('[SERVICE STATUS CONTENT] Content script loaded');
console.log('[SERVICE STATUS CONTENT] Current URL:', window.location.href);
console.log('[SERVICE STATUS CONTENT] GlideAjax available:', typeof GlideAjax !== 'undefined');

// Function to wait for GlideAjax to be available
function waitForGlideAjax(callback, timeout = 10000) {
    var startTime = Date.now();
    
    function check() {
        if (typeof GlideAjax !== 'undefined') {
            console.log('[SERVICE STATUS CONTENT] GlideAjax is available');
            callback();
        } else if (Date.now() - startTime < timeout) {
            console.log('[SERVICE STATUS CONTENT] Waiting for GlideAjax... (attempt ' + Math.floor((Date.now() - startTime) / 1000) + 's)');
            setTimeout(check, 500);
        } else {
            console.error('[SERVICE STATUS CONTENT] GlideAjax not available within timeout');
            console.error('[SERVICE STATUS CONTENT] Window object keys:', Object.keys(window).slice(0, 20).join(', '));
            callback(new Error('GlideAjax not available. Make sure you are on a ServiceNow page.'));
        }
    }
    
    check();
}

// Listen for messages from extension popup
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.type === 'TRIGGER_FLT') {
        console.log('[SERVICE STATUS CONTENT] Received FLT trigger request');
        console.log('[SERVICE STATUS CONTENT] Case sys_id:', request.sys_id);
        console.log('[SERVICE STATUS CONTENT] Current GlideAjax status:', typeof GlideAjax);
        
        // Check if we're on a ServiceNow page
        if (!window.location.href.includes('service-now.com')) {
            console.error('[SERVICE STATUS CONTENT] Not on a ServiceNow page');
            sendResponse({
                success: false,
                error: 'Please navigate to a ServiceNow case page first.'
            });
            return true;
        }
        
        // Wait for GlideAjax to be available, then execute FLT trigger
        waitForGlideAjax(function(error) {
            if (error) {
                console.error('[SERVICE STATUS CONTENT] GlideAjax check failed:', error);
                sendResponse({
                    success: false,
                    error: error.message
                });
                return;
            }
            
            console.log('[SERVICE STATUS CONTENT] Proceeding with FLT trigger');
            
            // Execute FLT trigger using GlideAjax directly in ServiceNow context
            try {
                var ga = new GlideAjax('global.CSNPH2_FLT_Trigger');
                ga.addParam('sysparm_name', 'fltTrigger');
                ga.addParam('sysparm_id', request.sys_id);

                ga.getXML(function(response) {
                    console.log('[SERVICE STATUS CONTENT] FLT trigger response received');
                    
                    var answer = null;
                    if (response && response.responseXML && response.responseXML.documentElement) {
                        answer = response.responseXML.documentElement.getAttribute('answer');
                    }

                    sendResponse({
                        success: true,
                        data: answer
                    });
                });
            } catch (error) {
                console.error('[SERVICE STATUS CONTENT] FLT trigger error:', error);
                sendResponse({
                    success: false,
                    error: error.message
                });
            }
        });
        
        return true; // Keep message channel open for async response
    }
});
