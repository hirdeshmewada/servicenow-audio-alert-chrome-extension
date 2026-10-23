// ServiceNow Bridge Script - Injected into ServiceNow page context
// This script runs in the ServiceNow page where GlideAjax is available

(function() {
    console.log('[SERVICE STATUS BRIDGE] Script injected');

    // Signal that bridge is ready
    window.postMessage({
        type: 'SERVICE_STATUS_BRIDGE_READY'
    }, '*');

    // Listen for messages from content script
    window.addEventListener('message', function(event) {
        if (event.data && event.data.type === 'TRIGGER_FLT') {
            console.log('[SERVICE STATUS BRIDGE] Received FLT trigger request');
            console.log('[SERVICE STATUS BRIDGE] Case sys_id:', event.data.sys_id);

            try {
                // Use GlideAjax to trigger FLT (same as FLT Re-Trigger button)
                var ga = new GlideAjax('global.CSNPH2_FLT_Trigger');
                ga.addParam('sysparm_name', 'fltTrigger');
                ga.addParam('sysparm_id', event.data.sys_id);

                ga.getXML(function(response) {
                    console.log('[SERVICE STATUS BRIDGE] FLT trigger response received');
                    
                    var answer = null;
                    if (response && response.responseXML && response.responseXML.documentElement) {
                        answer = response.responseXML.documentElement.getAttribute('answer');
                    }

                    window.postMessage({
                        type: 'FLT_TRIGGER_RESPONSE',
                        success: true,
                        data: answer,
                        sys_id: event.data.sys_id
                    }, '*');
                });
            } catch (error) {
                console.error('[SERVICE STATUS BRIDGE] FLT trigger error:', error);
                window.postMessage({
                    type: 'FLT_TRIGGER_RESPONSE',
                    success: false,
                    error: error.message,
                    sys_id: event.data.sys_id
                }, '*');
            }
        }
    });

    console.log('[SERVICE STATUS BRIDGE] Message listener setup complete');
})();
