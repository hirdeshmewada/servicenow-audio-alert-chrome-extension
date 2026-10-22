var InitialAcknowledgement = InitialAcknowledgement || {};

InitialAcknowledgement.DIAGNOSTIC_MARKER = 'Insights: Diagnostic Update';
InitialAcknowledgement.BGP_MESSAGE_HINT = 'No Issue On LM. PE-CPE protocol is UP';

InitialAcknowledgement._decodeHtml = function (html) {
    const template = document.createElement('textarea');
    template.innerHTML = html || '';
    return template.value;
};

InitialAcknowledgement._htmlToPlainText = function (html) {
    if (!html) return '';
    let text = html;
    // Replace <br> and <br/> with newlines
    text = text.replace(/<br\s*\/?>/gi, '\n');
    // Replace </p> and </div> with newlines
    text = text.replace(/<\/p>/gi, '\n');
    text = text.replace(/<\/div>/gi, '\n');
    // Remove all HTML tags
    text = text.replace(/<[^>]+>/g, '');
    // Decode HTML entities
    text = InitialAcknowledgement._decodeHtml(text);
    // Clean up excessive whitespace
    text = text.replace(/\s+/g, ' ');
    text = text.replace(/\n\s+/g, '\n');
    return text.trim();
};

InitialAcknowledgement._textFromHtml = function (html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html || '', 'text/html');
    return (doc.body && doc.body.textContent) ? doc.body.textContent : (html || '');
};

InitialAcknowledgement.parseDiagnosticEntry = function (rawValue) {
    // Convert HTML to plain text first
    const plainText = InitialAcknowledgement._htmlToPlainText(rawValue || '');
    
    const html = InitialAcknowledgement._decodeHtml(rawValue || '');
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    let message = '';
    let logs = '';

    const rows = doc.querySelectorAll('tr');
    rows.forEach(function (row) {
        const cells = row.querySelectorAll('td, th');
        if (!cells.length) return;
        const label = (cells[0].textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
        const valueCell = cells.length > 1 ? cells[1] : cells[0];
        const value = (valueCell.innerText || valueCell.textContent || '').trim();
        if (label.indexOf('message') !== -1) message = value;
        if (label.indexOf('log') !== -1) logs = value;
    });

    const plain = InitialAcknowledgement._textFromHtml(html).replace(/\r/g, '');
    if (!message) message = InitialAcknowledgement._section(plain, 'Message', ['Logs']);
    if (!logs) logs = InitialAcknowledgement._section(plain, 'Logs', ['Message']);

    return {
        message: (message || '').trim(),
        logs: (logs || '').trim(),
        plain: plainText // Use the pre-converted plain text
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
            record.value.indexOf(InitialAcknowledgement.DIAGNOSTIC_MARKER) !== -1;
    });
};

InitialAcknowledgement._isInterfaceVprn = function (entry) {
    const text = ((entry.message || '') + '\n' + (entry.logs || '') + '\n' + (entry.plain || '')).toLowerCase();
    return /interface\s*\/\s*vprn/.test(text) || /interface\/vprn/.test(text);
};

InitialAcknowledgement._isBgpEntry = function (entry) {
    const fullText = ((entry.message || '') + '\n' + (entry.logs || '') + '\n' + (entry.plain || '')).toLowerCase();
    return /\bbgp\b/.test(fullText);
};

InitialAcknowledgement._isPingEntry = function (entry) {
    const fullText = ((entry.message || '') + '\n' + (entry.logs || '') + '\n' + (entry.plain || '')).toLowerCase();
    return /\bping\b/.test(fullText) && /\bpacket loss\b/.test(fullText);
};

InitialAcknowledgement._ipv4List = function (text) {
    return (text.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g) || []);
};

InitialAcknowledgement.extractBgp = function (entry) {
    const fullText = (entry.message || '') + '\n' + (entry.logs || '') + '\n' + (entry.plain || '');
    const logs = entry.logs || '';
    
    // Extract peer IP - search complete text
    const ips = InitialAcknowledgement._ipv4List(fullText);
    let peerIp = '';
    
    // Look for IP in context of BGP output
    const bgpContextMatch = fullText.match(/(?:peer|neighbor)\s*[=:]?\s*((?:\d{1,3}\.){3}\d{1,3})/i) ||
                          fullText.match(/((?:\d{1,3}\.){3}\d{1,3})[^\n]*\n[^\n]*\d+\s+\d+\s+\d+\s+[\dhms]+/i);
    if (bgpContextMatch) {
        peerIp = bgpContextMatch[1];
    } else if (ips.length > 0) {
        peerIp = ips[0];
    }
    
    // Extract uptime - search complete text
    const uptimeMatch = fullText.match(/\b(\d{1,2}w)?(\d{1,2}d)?(\d{1,2}h)?(\d{1,2}m)?(\d{1,2}s)?\b/i) ||
                        fullText.match(/uptime[^\n]*([\dhms]+)/i) ||
                        fullText.match(/(\d{1,2}h\d{1,2}m\d{1,2}s)/i);
    let uptime = '';
    if (uptimeMatch) {
        // Reconstruct uptime from captured groups
        const parts = [];
        if (uptimeMatch[1]) parts.push(uptimeMatch[1]);
        if (uptimeMatch[2]) parts.push(uptimeMatch[2]);
        if (uptimeMatch[3]) parts.push(uptimeMatch[3]);
        if (uptimeMatch[4]) parts.push(uptimeMatch[4]);
        if (uptimeMatch[5]) parts.push(uptimeMatch[5]);
        if (parts.length > 0) {
            uptime = parts.join('');
        } else {
            uptime = uptimeMatch[0];
        }
    }

    const lines = [];
    if (peerIp) {
        lines.push('BGP session is currently established with peer ' + peerIp + '.');
    }
    if (uptime) {
        lines.push('BGP uptime observed: ' + uptime + '.');
    }

    // Store complete BGP logs (plain text version)
    const fullOutput = InitialAcknowledgement._htmlToPlainText(logs) || InitialAcknowledgement._htmlToPlainText(fullText);

    return {
        peerIp: peerIp,
        uptime: uptime,
        fullOutput: fullOutput,
        text: lines.join('\n')
    };
};

InitialAcknowledgement.extractPing = function (entry) {
    const fullText = (entry.message || '') + '\n' + (entry.logs || '') + '\n' + (entry.plain || '');
    const logs = entry.logs || '';
    
    // Extract packet loss - search complete text
    const lossMatch = fullText.match(/(\d+(?:\.\d+)?)\s*%\s*packet loss/i);
    const loss = lossMatch ? parseFloat(lossMatch[1]) : null;
    
    // Extract average latency - search complete text
    const avgMatch = fullText.match(/avg(?:erage)?\s*=\s*(\d+(?:\.\d+)?)\s*ms/i) ||
                     fullText.match(/average(?: latency)?[^0-9]*(\d+(?:\.\d+)?)\s*ms/i) ||
                     fullText.match(/round-trip[^\n]*avg[^\n]*=\s*(\d+(?:\.\d+)?)\s*ms/i);
    const avg = avgMatch ? avgMatch[1] : '';
    
    const txMatch = fullText.match(/(\d+)\s+packets transmitted/i);
    const rxMatch = fullText.match(/(\d+)\s+packets received/i);
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
        text = 'Ping verification to customer endpoint was successful with 0.00% packet loss.';
        if (avg) {
            text += '\nAverage latency observed: ' + avg + ' ms.';
        }
    }

    // Store complete Ping logs (plain text version)
    const fullOutput = InitialAcknowledgement._htmlToPlainText(logs) || InitialAcknowledgement._htmlToPlainText(fullText);

    return {
        packetLoss: loss,
        averageLatency: avg,
        fullOutput: fullOutput,
        text: text
    };
};

InitialAcknowledgement.parseDiagnostics = function (journalRecords) {
    const notes = InitialAcknowledgement.filterDiagnosticWorkNotes(journalRecords);
    console.log('[ACK] Diagnostic entries found:', notes.length);

    let bgp = { peerIp: '', uptime: '', fullOutput: '', text: '' };
    let ping = { packetLoss: null, averageLatency: '', text: '' };

    notes.forEach(function (note) {
        const entry = InitialAcknowledgement.parseDiagnosticEntry(note.value || '');
        if (InitialAcknowledgement._isInterfaceVprn(entry)) return;

        if (!bgp.text && InitialAcknowledgement._isBgpEntry(entry)) {
            bgp = InitialAcknowledgement.extractBgp(entry);
        }
        if (!ping.text && InitialAcknowledgement._isPingEntry(entry)) {
            ping = InitialAcknowledgement.extractPing(entry);
        }
    });

    console.log('[ACK] BGP extracted:', bgp);
    console.log('[ACK] Ping extracted:', ping);

    return { bgp: bgp, ping: ping };
};
