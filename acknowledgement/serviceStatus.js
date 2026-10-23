var ServiceStatus = ServiceStatus || {};

ServiceStatus._SYS_ID = /^[a-f0-9]{32}$/i;

ServiceStatus._parseSysIdFromUrl = function (url) {
    if (!url) return '';
    let decoded = url;
    try { decoded = decodeURIComponent(url); } catch (e) {}
    const patterns = [
        /sn_customerservice_case\/([a-f0-9]{32})/i,
        /[?&]sys_id=([a-f0-9]{32})/i,
        /sysparm_sys_id=([a-f0-9]{32})/i
    ];
    for (let i = 0; i < patterns.length; i++) {
        const match = decoded.match(patterns[i]);
        if (match) return match[1];
    }
    return '';
};

ServiceStatus._readPageContext = function () {
    const params = new URLSearchParams(location.search);
    const fromQuery = params.get('sys_id') || params.get('sysparm_sys_id');
    if (fromQuery && /^[a-f0-9]{32}$/i.test(fromQuery)) {
        return { origin: location.origin, sysId: fromQuery };
    }
    const href = location.href;
    const nextUi = href.match(/sn_customerservice_case\/([a-f0-9]{32})/i);
    if (nextUi) return { origin: location.origin, sysId: nextUi[1] };
    const unique = document.getElementById('sys_uniqueValue');
    const table = document.getElementById('sys_target');
    if (unique && /^[a-f0-9]{32}$/i.test(unique.value) &&
        (!table || !table.value || table.value === 'sn_customerservice_case')) {
        return { origin: location.origin, sysId: unique.value };
    }
    return null;
};

ServiceStatus.getCaseContext = async function () {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) throw new Error('No active tab found.');

    let origin = '';
    try {
        origin = new URL(tab.url).origin;
    } catch (e) {}

    let sysId = ServiceStatus._parseSysIdFromUrl(tab.url);

    if (!sysId && tab.id && chrome.scripting) {
        try {
            const injected = await chrome.scripting.executeScript({
                target: { tabId: tab.id, allFrames: true },
                func: ServiceStatus._readPageContext
            });
            for (let i = 0; i < (injected || []).length; i++) {
                const result = injected[i] && injected[i].result;
                if (result && result.sysId) {
                    sysId = result.sysId;
                    origin = result.origin || origin;
                    break;
                }
            }
        } catch (error) {
            console.log('[SERVICE STATUS] Could not inspect page for sys_id:', error.message);
        }
    }

    if (!origin || origin.indexOf('service-now.com') === -1) {
        const stored = await chrome.storage.sync.get(['rooturl']);
        if (stored.rooturl) origin = String(stored.rooturl).replace(/\/$/, '');
    }

    if (!sysId) {
        throw new Error('Open a ServiceNow case tab, then click Service Status.');
    }
    if (!origin) {
        throw new Error('Could not determine ServiceNow instance URL.');
    }

    return { origin: origin.replace(/\/$/, ''), sysId: sysId };
};

ServiceStatus._fetchJson = async function (url) {
    const response = await fetch(url, {
        method: 'GET',
        credentials: 'include',
        headers: { 'Accept': 'application/json' }
    });
    if (!response.ok) {
        throw new Error('HTTP ' + response.status + ' for ' + url);
    }
    return response.json();
};

ServiceStatus._fetchText = async function (url) {
    const response = await fetch(url, {
        method: 'GET',
        credentials: 'include',
        headers: { 'Accept': 'text/plain' }
    });
    if (!response.ok) {
        throw new Error('HTTP ' + response.status + ' for ' + url);
    }
    return response.text();
};

ServiceStatus._injectBridgeScript = async function (tabId) {
    console.log('[SERVICE STATUS] Injecting bridge script into tab:', tabId);
    
    // Read the bridge script
    const bridgeScriptContent = await ServiceStatus._readBridgeScript();
    
    // Inject the script into the page
    await chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: ServiceStatus._executeBridgeScript,
        args: [bridgeScriptContent]
    });
    
    console.log('[SERVICE STATUS] Bridge script injected');
};

ServiceStatus._readBridgeScript = async function () {
    // Read the bridge script file using fetch from extension
    const url = chrome.runtime.getURL('acknowledgement/serviceNowBridge.js');
    const response = await fetch(url);
    return await response.text();
};

ServiceStatus._executeBridgeScript = function (scriptContent) {
    // Execute the bridge script in page context
    try {
        eval(scriptContent);
    } catch (error) {
        console.error('[SERVICE STATUS BRIDGE] Script execution error:', error);
    }
};

ServiceStatus._waitForBridgeReady = function (timeout = 5000) {
    return new Promise((resolve, reject) => {
        const listener = function(request, sender) {
            if (request && request.type === 'SERVICE_STATUS_BRIDGE_READY') {
                chrome.runtime.onMessage.removeListener(listener);
                resolve();
            }
        };
        
        chrome.runtime.onMessage.addListener(listener);
        
        setTimeout(() => {
            chrome.runtime.onMessage.removeListener(listener);
            reject(new Error('Bridge script not ready within timeout'));
        }, timeout);
    });
};

ServiceStatus.triggerFLT = async function (origin, caseSysId) {
    console.log('[SERVICE STATUS] Triggering FLT for case:', caseSysId);
    
    // Get active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
        throw new Error('No active tab found');
    }
    
    // Inject bridge script
    await ServiceStatus._injectBridgeScript(tab.id);
    
    // Wait for bridge to be ready
    await ServiceStatus._waitForBridgeReady();
    
    // Send trigger request to bridge via content script
    return new Promise((resolve, reject) => {
        const listener = function(request, sender) {
            if (request && request.type === 'FLT_TRIGGER_RESPONSE') {
                chrome.runtime.onMessage.removeListener(listener);
                
                if (request.success) {
                    console.log('[SERVICE STATUS] FLT trigger successful:', request.data);
                    resolve(request.data);
                } else {
                    console.error('[SERVICE STATUS] FLT trigger failed:', request.error);
                    reject(new Error(request.error || 'FLT trigger failed'));
                }
            }
        };
        
        chrome.runtime.onMessage.addListener(listener);
        
        // Send trigger request to the content script in the tab
        chrome.tabs.sendMessage(tab.id, {
            type: 'TRIGGER_FLT',
            sys_id: caseSysId
        });
        
        // Timeout after 30 seconds
        setTimeout(() => {
            chrome.runtime.onMessage.removeListener(listener);
            reject(new Error('FLT trigger timeout'));
        }, 30000);
    });
};

ServiceStatus.pollListHistory = async function (origin, caseSysId, maxAttempts = 15, intervalMs = 2000) {
    console.log('[SERVICE STATUS] Polling list_history for case:', caseSysId);
    
    const timestamp = Date.now();
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        console.log(`[SERVICE STATUS] Poll attempt ${attempt + 1}/${maxAttempts}`);
        
        const url = origin + '/list_history.do?' + new URLSearchParams({
            sysparm_type: 'list_history',
            table: 'sn_customerservice_case',
            action: 'get_new_entries',
            sysparm_silent_request: 'true',
            sysparm_auto_request: 'true',
            sysparm_timestamp: timestamp,
            include_attachments: '',
            sys_id: caseSysId
        });

        try {
            // Try JSON first
            let data;
            try {
                data = await ServiceStatus._fetchJson(url);
                console.log('[SERVICE STATUS] List history JSON response:', data);
                
                if (data && data.entries && data.entries.length > 0) {
                    const entries = ServiceStatus.parseListHistoryFromJSON(data);
                    console.log('[SERVICE STATUS] Found entries from JSON:', entries.length);
                    
                    if (entries.length > 0) {
                        return entries;
                    }
                }
            } catch (jsonError) {
                // If JSON fails, try text/HTML
                console.log('[SERVICE STATUS] JSON parse failed, trying text:', jsonError.message);
                const text = await ServiceStatus._fetchText(url);
                console.log('[SERVICE STATUS] List history text response length:', text.length);
                
                if (text && text.length > 100) {
                    const entries = ServiceStatus.parseListHistory(text);
                    console.log('[SERVICE STATUS] Found entries from text:', entries.length);
                    
                    if (entries.length > 0) {
                        return entries;
                    }
                }
            }
        } catch (error) {
            console.log('[SERVICE STATUS] Poll attempt failed:', error.message);
        }

        await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
    
    throw new Error('No new entries found after ' + maxAttempts + ' attempts');
};

ServiceStatus.parseListHistoryFromJSON = function (data) {
    const entries = [];
    
    console.log('[SERVICE STATUS] Parsing list_history from JSON');
    
    if (!data || !data.entries) {
        console.log('[SERVICE STATUS] No entries in JSON data');
        return entries;
    }
    
    // Navigate the nested structure: data.entries[] -> entries -> journal[]
    data.entries.forEach(topEntry => {
        if (!topEntry.entries || !topEntry.entries.journal) {
            return;
        }
        
        topEntry.entries.journal.forEach(journalEntry => {
            const parsedEntry = {
                message: '',
                logs: ''
            };
            
            // Extract from new_value field (contains HTML)
            if (journalEntry.new_value) {
                const html = journalEntry.new_value;
                
                // Extract message from first td
                const messageMatch = html.match(/<td[^>]*>([^<]*(?:<[^/][^>]*>[^<]*<\/[^>][^>]*>[^<]*)*)<\/td>/i);
                if (messageMatch && messageMatch.length > 1) {
                    // First td is usually the message
                    let message = messageMatch[1]
                        .replace(/<[^>]+>/g, ' ')
                        .replace(/&nbsp;/g, ' ')
                        .replace(/&quot;/g, '"')
                        .replace(/&#34;/g, '"')
                        .replace(/&amp;/g, '&')
                        .replace(/\s+/g, ' ')
                        .trim();
                    parsedEntry.message = message;
                }
                
                // Extract logs from second td (Logs column)
                // Look for the table structure with Message and Logs columns
                const logsMatch = html.match(/<td[^>]*>[\s\S]*?<\/td>[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>/i);
                if (logsMatch && logsMatch.length > 1) {
                    let logs = logsMatch[1];
                    // Convert HTML to text
                    logs = logs
                        .replace(/<br\s*\/?>/gi, '\n')
                        .replace(/<[^>]+>/g, ' ')
                        .replace(/&nbsp;/g, ' ')
                        .replace(/&quot;/g, '"')
                        .replace(/&#34;/g, '"')
                        .replace(/&amp;/g, '&')
                        .replace(/\n\s*\n/g, '\n')
                        .trim();
                    parsedEntry.logs = logs;
                }
            }
            
            if (parsedEntry.message || parsedEntry.logs) {
                entries.push(parsedEntry);
            }
        });
    });
    
    console.log('[SERVICE STATUS] Total entries parsed from JSON:', entries.length);
    return entries;
};

ServiceStatus.parseListHistory = function (html) {
    const entries = [];
    
    console.log('[SERVICE STATUS] Parsing list_history HTML, length:', html.length);
    
    // ServiceNow list_history returns HTML with work notes
    // Each work note is typically in a div or table structure
    // We need to extract entries that contain "Insights: Diagnostic Update"
    
    // Split by common work note separators
    const workNotePattern = /<div[^>]*class="[^"]*work_notes[^"]*"[^>]*>[\s\S]*?<\/div>/gi;
    const matches = html.match(workNotePattern);
    
    if (matches) {
        console.log('[SERVICE STATUS] Found work note divs:', matches.length);
        matches.forEach(match => {
            const entry = {
                message: '',
                logs: ''
            };
            
            // Extract message (text before "Logs" or in a message field)
            const textContent = match
                .replace(/<[^>]+>/g, ' ')
                .replace(/&nbsp;/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
            
            entry.message = textContent;
            
            // Extract logs (usually between specific markers)
            const logsMatch = match.match(/Logs[:\s]*([\s\S]*?)(?:by\s+INSIGHTS|$)/i);
            if (logsMatch) {
                let logs = logsMatch[1]
                    .replace(/<[^>]+>/g, '\n')
                    .replace(/&nbsp;/g, ' ')
                    .replace(/\n\s*\n/g, '\n')
                    .trim();
                entry.logs = logs;
            }
            
            if (entry.message || entry.logs) {
                entries.push(entry);
            }
        });
    }
    
    // Fallback: Try to find any text containing "Insights: Diagnostic Update"
    if (entries.length === 0) {
        console.log('[SERVICE STATUS] No work note divs found, trying text extraction');
        const diagnosticMatch = html.match(/Insights:\s*Diagnostic Update[\s\S]*?(?=<|$)/gi);
        if (diagnosticMatch) {
            diagnosticMatch.forEach(match => {
                const entry = {
                    message: match,
                    logs: match
                };
                entries.push(entry);
            });
        }
    }
    
    console.log('[SERVICE STATUS] Total entries parsed:', entries.length);
    return entries;
};

ServiceStatus.findDiagnosticUpdate = function (entries) {
    console.log('[SERVICE STATUS] Searching for Insights Diagnostic Update entries');
    
    const diagnosticEntries = [];
    
    for (const entry of entries) {
        const message = entry.message || '';
        const logs = entry.logs || '';
        
        // Check for Insights Diagnostic Update
        if (message.includes('Insights: Diagnostic Update') || 
            logs.includes('Insights: Diagnostic Update')) {
            console.log('[SERVICE STATUS] Found Diagnostic Update entry');
            diagnosticEntries.push(entry);
        }
    }
    
    // Return all diagnostic entries (there may be multiple - one for ping, one for BGP)
    return diagnosticEntries;
};

ServiceStatus.extractDiagnostics = function (entries) {
    const result = {
        pingLogs: null,
        bgpLogs: null
    };
    
    console.log('[SERVICE STATUS] Extracting diagnostics from', entries.length, 'entries');
    
    entries.forEach(entry => {
        const message = (entry.message || '').toLowerCase();
        const logs = entry.logs || '';
        
        console.log('[SERVICE STATUS] Message:', message);
        console.log('[SERVICE STATUS] Logs length:', logs.length);
        
        // Check for Ping diagnostic
        if (message.includes('ping response is ok') || message.includes('pe-cpe ping')) {
            console.log('[SERVICE STATUS] Extracting Ping logs');
            result.pingLogs = ServiceStatus._cleanLogOutput(logs);
        }
        
        // Check for BGP diagnostic
        if (message.includes('protocol is up') || message.includes('bgp') || message.includes('no issue on lm')) {
            console.log('[SERVICE STATUS] Extracting BGP logs');
            result.bgpLogs = ServiceStatus._cleanLogOutput(logs);
        }
    });
    
    return result;
};

ServiceStatus._cleanLogOutput = function (logText) {
    if (!logText) return '';
    
    let cleaned = logText;
    
    // Remove common prefixes
    cleaned = cleaned.replace(/Logs\s*\[code\]FLT ID:\s*[\w\d]+\s*\[\/code\]\s*/gi, '');
    cleaned = cleaned.replace(/\[code\]\s*Insights:\s*Diagnostic Update Message Logs\s*/gi, '');
    cleaned = cleaned.replace(/Message\s*:\s*.*$/gm, '');
    cleaned = cleaned.replace(/\[code\]|\[\/code\]/gi, '');
    cleaned = cleaned.replace(/by\s*INSIGHTS\s*$/gi, '');
    
    // Remove the "B:#" suffix
    cleaned = cleaned.replace(/B:#$/gm, '');
    
    // Remove duplicate commands (command appears twice in output)
    const lines = cleaned.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    const uniqueLines = [];
    const seenLines = new Set();
    
    lines.forEach(line => {
        const lineKey = line.trim();
        if (!seenLines.has(lineKey)) {
            seenLines.add(lineKey);
            uniqueLines.push(line);
        }
    });
    
    cleaned = uniqueLines.join('\n');
    
    return cleaned;
};

ServiceStatus.formatOutput = function (diagnostics) {
    const lines = [];
    
    lines.push('===== SERVICE STATUS =====');
    lines.push('');
    
    if (diagnostics.pingLogs) {
        lines.push('PING STATUS');
        lines.push('-----------');
        lines.push(diagnostics.pingLogs);
        lines.push('');
    }
    
    if (diagnostics.bgpLogs) {
        lines.push('BGP STATUS');
        lines.push('----------');
        lines.push(diagnostics.bgpLogs);
        lines.push('');
    }
    
    if (!diagnostics.pingLogs && !diagnostics.bgpLogs) {
        lines.push('No diagnostic logs found.');
    }
    
    return lines.join('\n');
};

ServiceStatus.copyText = async function (text) {
    try {
        await navigator.clipboard.writeText(text);
        console.log('[SERVICE STATUS] Copied to clipboard');
    } catch (error) {
        console.error('[SERVICE STATUS] Failed to copy to clipboard:', error);
        throw new Error('Failed to copy to clipboard. Please check browser permissions.');
    }
};

ServiceStatus.generate = async function () {
    console.log('[SERVICE STATUS] Starting Service Status generation');
    
    // Step 1: Get case context
    const context = await ServiceStatus.getCaseContext();
    console.log('[SERVICE STATUS] Case sys_id:', context.sysId);
    console.log('[SERVICE STATUS] Origin:', context.origin);
    
    // Step 2: Trigger FLT
    if (ServiceStatus.showStatusMessage) {
        ServiceStatus.showStatusMessage('Triggering FLT diagnostic...');
    }
    await ServiceStatus.triggerFLT(context.origin, context.sysId);
    
    // Step 3: Wait for FLT to complete
    if (ServiceStatus.showStatusMessage) {
        ServiceStatus.showStatusMessage('Waiting for diagnostic to complete...');
    }
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Step 4: Poll for new entries
    if (ServiceStatus.showStatusMessage) {
        ServiceStatus.showStatusMessage('Fetching diagnostic logs...');
    }
    const entries = await ServiceStatus.pollListHistory(context.origin, context.sysId);
    
    // Step 5: Find Diagnostic Update entries (may be multiple)
    const diagnosticEntries = ServiceStatus.findDiagnosticUpdate(entries);
    if (!diagnosticEntries || diagnosticEntries.length === 0) {
        throw new Error('No Insights Diagnostic Update found in recent entries.');
    }
    
    console.log('[SERVICE STATUS] Found', diagnosticEntries.length, 'diagnostic entries');
    
    // Step 6: Extract diagnostics from all entries
    const diagnostics = ServiceStatus.extractDiagnostics(diagnosticEntries);
    
    if (!diagnostics.pingLogs && !diagnostics.bgpLogs) {
        console.warn('[SERVICE STATUS] No ping or BGP logs extracted');
    }
    
    // Step 7: Format output
    const output = ServiceStatus.formatOutput(diagnostics);
    console.log('[SERVICE STATUS] Final output:\n', output);
    
    // Step 8: Copy to clipboard
    await ServiceStatus.copyText(output);
    
    return output;
};
