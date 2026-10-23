// Content script for Service Status - runs in ServiceNow page context
console.log('[SERVICE STATUS CONTENT] Content script loaded');

// Listen for messages from extension popup
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.type === 'TRIGGER_FLT') {
        console.log('[SERVICE STATUS CONTENT] Received FLT trigger request');
        console.log('[SERVICE STATUS CONTENT] Case sys_id:', request.sys_id);
        
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
            
            return true; // Keep message channel open for async response
        } catch (error) {
            console.error('[SERVICE STATUS CONTENT] FLT trigger error:', error);
            sendResponse({
                success: false,
                error: error.message
            });
            return true;
        }
    }
});
