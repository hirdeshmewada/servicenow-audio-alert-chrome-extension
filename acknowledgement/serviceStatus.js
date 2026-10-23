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

ServiceStatus.triggerFLT = async function (origin, caseSysId) {
    console.log('[SERVICE STATUS] Triggering FLT for case:', caseSysId);
    
    // Get active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
        throw new Error('No active tab found');
    }
    
    // Inject and execute complete FLT trigger + diagnostic extraction in ServiceNow page context
    const injected = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: async function(caseId, origin) {
            console.log('[INJECTED SCRIPT] Starting FLT trigger for case:', caseId);
            console.log('[INJECTED SCRIPT] Origin:', origin);
            
            // Check if GlideAjax is available
            if (typeof GlideAjax === 'undefined') {
                return {
                    success: false,
                    error: 'GlideAjax not available. Please refresh the ServiceNow page.'
                };
            }
            
            // Step 1: Trigger FLT
            console.log('[INJECTED SCRIPT] Triggering FLT via GlideAjax');
            await new Promise((resolve, reject) => {
                var ga = new GlideAjax('global.CSNPH2_FLT_Trigger');
                ga.addParam('sysparm_name', 'fltTrigger');
                ga.addParam('sysparm_id', caseId);

                ga.getXML(function(response) {
                    console.log('[INJECTED SCRIPT] FLT trigger response received');
                    resolve();
                });
            });
            
            // Step 2: Wait for FLT to complete (10 seconds)
            console.log('[INJECTED SCRIPT] Waiting 10 seconds for FLT to complete...');
            await new Promise(resolve => setTimeout(resolve, 10000));
            
            // Step 3: Fetch latest journal entries to find Diagnostic Update
            console.log('[INJECTED SCRIPT] Fetching latest journal entries');
            const journalUrl = origin + '/sys_journal_field.do?sysparm_query=' +
                encodeURIComponent('element_id=' + caseId) +
                '&JSONv2&sysparm_display_value=true&sysparm_limit=20';
            
            const journalResponse = await fetch(journalUrl, {
                credentials: 'include'
            });
            const journalData = await journalResponse.json();
            const journalEntries = journalData.records || [];
            
            console.log('[INJECTED SCRIPT] Found', journalEntries.length, 'journal entries');
            
            // Step 4: Find Insights Diagnostic Update entries
            const diagnosticLogs = [];
            
            journalEntries.forEach(entry => {
                const value = entry.value || '';
                
                // Check for Insights: Diagnostic Update
                if (value.includes('Insights: Diagnostic Update')) {
                    console.log('[INJECTED SCRIPT] Found Diagnostic Update entry');
                    
                    // Extract type based on message
                    const type = value.toLowerCase().includes('ping') ? 'PING' : 
                               value.toLowerCase().includes('bgp') ? 'BGP' : 'UNKNOWN';
                    
                    // Extract raw logs (everything after Message/Logs structure)
                    let rawLog = value;
                    
                    // Remove common prefixes
                    rawLog = rawLog.replace(/FLT ID:\s*[\w\d]+/gi, '');
                    rawLog = rawLog.replace(/Insights:\s*Diagnostic Update/gi, '');
                    rawLog = rawLog.replace(/<[^>]+>/g, '\n');
                    rawLog = rawLog.replace(/&nbsp;/g, ' ');
                    rawLog = rawLog.replace(/&quot;/g, '"');
                    rawLog = rawLog.replace(/&#34;/g, '"');
                    rawLog = rawLog.replace(/&amp;/g, '&');
                    rawLog = rawLog.replace(/Message\s*:[^\n]*/gi, '');
                    rawLog = rawLog.replace(/Logs\s*:[^\n]*/gi, '');
                    rawLog = rawLog.replace(/by\s+INSIGHTS/gi, '');
                    rawLog = rawLog.replace(/B:#$/gm, '');
                    
                    // Clean up empty lines
                    rawLog = rawLog.split('\n')
                        .map(line => line.trim())
                        .filter(line => line.length > 0)
                        .join('\n');
                    
                    // Remove duplicate commands
                    const lines = rawLog.split('\n');
                    const uniqueLines = [];
                    const seenLines = new Set();
                    
                    lines.forEach(line => {
                        if (!seenLines.has(line)) {
                            seenLines.add(line);
                            uniqueLines.push(line);
                        }
                    });
                    
                    rawLog = uniqueLines.join('\n');
                    
                    if (type !== 'UNKNOWN' && rawLog.length > 0) {
                        diagnosticLogs.push({
                            type: type,
                            raw: rawLog
                        });
                    }
                }
            });
            
            console.log('[INJECTED SCRIPT] Extracted', diagnosticLogs.length, 'diagnostic logs');
            
            return {
                success: true,
                logs: diagnosticLogs
            };
        },
        args: [caseSysId, origin]
    });
    
    const result = injected[0].result;
    
    if (result.success) {
        console.log('[SERVICE STATUS] FLT and diagnostic extraction successful');
        console.log('[SERVICE STATUS] Found', result.logs.length, 'diagnostic logs');
        return result.logs;
    } else {
        console.error('[SERVICE STATUS] FLT trigger failed:', result.error);
        throw new Error(result.error || 'FLT trigger failed');
    }
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

ServiceStatus.formatOutputFromLogs = function (logs) {
    const lines = [];
    
    lines.push('===== SERVICE STATUS =====');
    lines.push('');
    
    let pingLog = null;
    let bgpLog = null;
    
    logs.forEach(log => {
        if (log.type === 'PING') {
            pingLog = log.raw;
        } else if (log.type === 'BGP') {
            bgpLog = log.raw;
        }
    });
    
    if (pingLog) {
        lines.push('PING STATUS');
        lines.push('-----------');
        lines.push(pingLog);
        lines.push('');
    }
    
    if (bgpLog) {
        lines.push('BGP STATUS');
        lines.push('----------');
        lines.push(bgpLog);
        lines.push('');
    }
    
    if (!pingLog && !bgpLog) {
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
    
    // Step 2: Trigger FLT and extract diagnostics (all in ServiceNow page context)
    if (ServiceStatus.showStatusMessage) {
        ServiceStatus.showStatusMessage('Triggering FLT and fetching diagnostics...');
    }
    const diagnosticLogs = await ServiceStatus.triggerFLT(context.origin, context.sysId);
    
    if (!diagnosticLogs || diagnosticLogs.length === 0) {
        throw new Error('No diagnostic logs found. Please try again.');
    }
    
    // Step 3: Format output from diagnostic logs
    const output = ServiceStatus.formatOutputFromLogs(diagnosticLogs);
    console.log('[SERVICE STATUS] Final output:\n', output);
    
    // Step 4: Copy to clipboard
    await ServiceStatus.copyText(output);
    
    return output;
};
