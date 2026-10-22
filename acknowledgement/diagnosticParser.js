var InitialAcknowledgement = InitialAcknowledgement || {};

InitialAcknowledgement.DIAGNOSTIC_MARKER = 'Insights: Diagnostic Update';
InitialAcknowledgement.BGP_MESSAGE_HINT = 'No Issue On LM. PE-CPE protocol is UP';

InitialAcknowledgement._decodeHtml = function (html) {
    const template = document.createElement('textarea');
    template.innerHTML = html || '';
    return template.value;
};

InitialAcknowledgement._textFromHtml = function (html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html || '', 'text/html');
    return (doc.body && doc.body.textContent) ? doc.body.textContent : (html || '');
};

InitialAcknowledgement.parseDiagnosticEntry = function (rawValue) {
    const html = InitialAcknowledgement._decodeHtml(rawValue || '');
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    let message = '';
    let logs = '';

    const rows = doc.querySelectorAll('tr');
    
    // Find header row to identify column indices
    let messageColIndex = -1;
    let logsColIndex = -1;
    
    rows.forEach(function (row) {
        const cells = row.querySelectorAll('td, th');
        if (!cells.length) return;
        
        // Check if this is a header row
        const firstCellText = (cells[0].textContent || '').trim().toLowerCase();
        if (firstCellText === 'message' || firstCellText === 'logs') {
            // This is a header row, find column indices
            for (let i = 0; i < cells.length; i++) {
                const cellText = (cells[i].textContent || '').trim().toLowerCase();
                if (cellText === 'message') messageColIndex = i;
                if (cellText === 'logs') logsColIndex = i;
            }
        }
    });
    
    // Now extract data from data rows
    if (messageColIndex >= 0 || logsColIndex >= 0) {
        rows.forEach(function (row) {
            const cells = row.querySelectorAll('td, th');
            if (!cells.length) return;
            
            // Skip header rows (cells with <b> tags or just labels)
            const firstCell = cells[0];
            if (firstCell.querySelector('b')) return;
            
            const firstCellText = (cells[0].textContent || '').trim().toLowerCase();
            if (firstCellText === 'message' || firstCellText === 'logs') return;
            
            // This is a data row
            if (messageColIndex >= 0 && cells[messageColIndex]) {
                // Convert <br/> to newlines before getting text
                const msgCell = cells[messageColIndex];
                const brTags = msgCell.querySelectorAll('br');
                brTags.forEach(br => br.replaceWith('\n'));
                const msgValue = (msgCell.textContent || '').trim();
                if (msgValue && msgValue !== 'Message' && msgValue !== 'Logs') {
                    message = msgValue;
                }
            }
            if (logsColIndex >= 0 && cells[logsColIndex]) {
                // Convert <br/> to newlines before getting text
                const logCell = cells[logsColIndex];
                const brTags = logCell.querySelectorAll('br');
                brTags.forEach(br => br.replaceWith('\n'));
                const logValue = (logCell.textContent || '').trim();
                if (logValue && logValue !== 'Message' && logValue !== 'Logs') {
                    logs = logValue;
                }
            }
        });
    } else {
        // Fallback to old parsing logic
        rows.forEach(function (row) {
            const cells = row.querySelectorAll('td, th');
            if (!cells.length) return;
            const label = (cells[0].textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
            const valueCell = cells.length > 1 ? cells[1] : cells[0];
            const value = (valueCell.innerText || valueCell.textContent || '').trim();
            if (label.indexOf('message') !== -1) message = value;
            if (label.indexOf('log') !== -1) logs = value;
        });
    }

    const plain = InitialAcknowledgement._textFromHtml(html).replace(/\r/g, '');
    
    // If still no message/logs from HTML table, try plain text parsing
    if (!message && !logs) {
        // Remove "Logs [code]FLT ID: ...[/code]" prefix
        let cleaned = plain.replace(/Logs\s*\[code\]FLT ID:\s*[\w\d]+\s*\[\/code\]\s*/gi, '');
        
        // Remove "[code] Insights: Diagnostic Update Message Logs" prefix
        cleaned = cleaned.replace(/\[code\]\s*Insights:\s*Diagnostic Update Message Logs\s*/gi, '');
        
        // Extract message (first line before the command)
        const lines = cleaned.split('\n').filter(l => l.trim());
        if (lines.length > 0) {
            message = lines[0].trim();
            // Logs is everything after the message line
            logs = lines.slice(1).join('\n').trim();
        } else {
            message = cleaned;
            logs = cleaned;
        }
    } else {
        // Fallback to section parsing if needed
        if (!message) message = InitialAcknowledgement._section(plain, 'Message', ['Logs']);
        if (!logs) logs = InitialAcknowledgement._section(plain, 'Logs', ['Message']);
    }

    return {
        message: (message || '').trim(),
        logs: (logs || '').trim(),
        plain: plain
    };
};

InitialAcknowledgement._section = function (text, label, stopLabels) {
    const start = new RegExp(label + '\\s*:\\s*', 'i').exec(text);
    if (!start) return '';
    let rest = text.slice(start.index + start[0].length);
    for (let i = 0; i < stopLabels.length; i++) {
        const stop = new RegExp('\\n\\s*' + stopLabels[i] + '\\s*:', 'i').exec(rest);
        if (stop) {
            rest = rest.slice(0, stop.index);
            break;
        }
    }
    return rest.trim();
};

InitialAcknowledgement.filterDiagnosticWorkNotes = function (records) {
    return (records || []).filter(function (record) {
        return record.element === 'work_notes' &&
            typeof record.value === 'string' &&
            record.value.indexOf('Insights: Diagnostic Update') !== -1;
    });
};

InitialAcknowledgement._isInterfaceVprn = function (entry) {
    const text = ((entry.message || '') + '\n' + (entry.logs || '') + '\n' + (entry.plain || '')).toLowerCase();
    return /interface\s*\/\s*vprn/.test(text) || /interface\/vprn/.test(text);
};

InitialAcknowledgement._isBgpEntry = function (entry) {
    const message = entry.message || '';
    const blob = (message + '\n' + (entry.logs || '')).toLowerCase();
    return message.indexOf(InitialAcknowledgement.BGP_MESSAGE_HINT) !== -1 || /\bbgp\b/.test(blob);
};

InitialAcknowledgement._isPingEntry = function (entry) {
    const message = (entry.message || '').toLowerCase();
    const logs = (entry.logs || '').toLowerCase();
    return message.indexOf('ping') !== -1 || logs.indexOf('ping') !== -1;
};

InitialAcknowledgement._ipv4List = function (text) {
    return (text.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g) || []);
};

InitialAcknowledgement.extractBgp = function (entry) {
    const logs = entry.logs || '';
    const quoted = logs.match(/"((?:\d{1,3}\.){3}\d{1,3})"/);
    const standalone = logs.match(/(?:^|\n)\s*((?:\d{1,3}\.){3}\d{1,3})\s*(?:\n|$)/);
    const ips = InitialAcknowledgement._ipv4List(logs);
    const peerIp = (quoted && quoted[1]) || (standalone && standalone[1]) || ips[0] || '';

    const uptimeMatch = logs.match(/\b\d{1,2}w\d{1,2}d\d{1,2}h\d{1,2}m\d{1,2}s\b/i) ||
        logs.match(/\b\d{1,2}d\d{1,2}h\d{1,2}m\d{1,2}s\b/i) ||
        logs.match(/\b\d{1,2}h\d{1,2}m\d{1,2}s\b/i) ||
        logs.match(/\b\d{2}:\d{2}:\d{2}\b/);
    const uptime = uptimeMatch ? uptimeMatch[0] : '';

    const lines = [];
    if (peerIp) {
        lines.push('BGP session is established with peer ' + peerIp + '.');
    }
    if (uptime) {
        lines.push('BGP uptime observed: ' + uptime + '.');
    }

    // Also include the message for context
    const message = entry.message || '';
    
    return {
        peerIp: peerIp,
        uptime: uptime,
        fullOutput: logs,
        text: lines.join('\n')
    };
};

InitialAcknowledgement.extractPing = function (entry) {
    const logs = entry.logs || '';
    const lossMatch = logs.match(/(\d+(?:\.\d+)?)\s*%\s*packet loss/i);
    const avgMatch = logs.match(/avg(?:erage)?\s*=\s*(\d+(?:\.\d+)?)\s*ms/i) ||
        logs.match(/average(?: latency)?[^0-9]*(\d+(?:\.\d+)?)\s*ms/i);
    const txMatch = logs.match(/(\d+)\s+packets transmitted/i);
    const rxMatch = logs.match(/(\d+)\s+packets received/i);

    const loss = lossMatch ? parseFloat(lossMatch[1]) : null;
    const avg = avgMatch ? avgMatch[1] : '';
    const received = rxMatch ? parseInt(rxMatch[1], 10) : null;
    const transmitted = txMatch ? parseInt(txMatch[1], 10) : null;

    let text = '';
    const failed = (loss !== null && loss > 0) || (received === 0 && transmitted !== null && transmitted > 0);

    if (failed) {
        if (loss !== null) {
            text = 'Ping verification to customer endpoint was unsuccessful. Packet loss observed: ' + loss + '%.';
        } else {
            text = 'Ping verification to customer endpoint failed. No successful replies were received.';
        }
    } else if (loss === 0 || loss === 0.0) {
        text = 'Ping verification to customer endpoint was successful with 0% packet loss.';
        if (avg) {
            text += '\nAverage latency observed: ' + avg + ' ms.';
        }
    }

    return {
        packetLoss: loss,
        averageLatency: avg,
        fullOutput: logs,
        text: text
    };
};

InitialAcknowledgement.parseDiagnostics = function (journalRecords) {
    const notes = InitialAcknowledgement.filterDiagnosticWorkNotes(journalRecords);
    console.log('[ACK] Total journal records:', journalRecords.length);
    console.log('[ACK] Diagnostic entries found:', notes.length);
    console.log('[ACK] Sample diagnostic entry:', notes[0] ? notes[0].value.substring(0, 300) : 'none');

    let bgp = { peerIp: '', uptime: '', fullOutput: '', text: '' };
    let ping = { packetLoss: null, averageLatency: '', text: '' };

    notes.forEach(function (note, index) {
        console.log('[ACK] Processing note', index);
        const entry = InitialAcknowledgement.parseDiagnosticEntry(note.value || '');
        console.log('[ACK] Parsed entry - message:', entry.message.substring(0, 150));
        console.log('[ACK] Parsed entry - logs:', entry.logs.substring(0, 150));
        
        const isVprn = InitialAcknowledgement._isInterfaceVprn(entry);
        console.log('[ACK] Is VPRN:', isVprn);
        if (isVprn) return;

        const isBgp = InitialAcknowledgement._isBgpEntry(entry);
        const isPing = InitialAcknowledgement._isPingEntry(entry);
        console.log('[ACK] Is BGP:', isBgp, 'Is Ping:', isPing);

        if (!bgp.text && isBgp) {
            console.log('[ACK] Found BGP entry, extracting...');
            bgp = InitialAcknowledgement.extractBgp(entry);
        }
        if (!ping.text && isPing) {
            console.log('[ACK] Found Ping entry, extracting...');
            ping = InitialAcknowledgement.extractPing(entry);
        }
    });

    console.log('[ACK] Final BGP extracted:', bgp);
    console.log('[ACK] Final Ping extracted:', ping);

    return { bgp: bgp, ping: ping };
};
