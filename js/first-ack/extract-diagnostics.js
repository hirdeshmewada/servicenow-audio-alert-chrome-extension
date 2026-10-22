// First Acknowledgement - Work notes / Insight Diagnostic Update extraction

var SNFirstAck = SNFirstAck || {};

SNFirstAck.JOURNAL_TABLE = 'sys_journal_field.do';
SNFirstAck.DIAGNOSTIC_MARKER = 'Insights: Diagnostic Update';

SNFirstAck.fetchJournalRecords = async function (origin, caseSysId) {
    return SNFirstAck.fetchRecords(
        origin,
        SNFirstAck.JOURNAL_TABLE,
        'element_id=' + caseSysId,
        { displayValue: true, limit: 1000 }
    );
};

SNFirstAck.filterDiagnosticWorkNotes = function (records) {
    return (records || []).filter(function (r) {
        return r.element === 'work_notes' &&
            typeof r.value === 'string' &&
            r.value.indexOf(SNFirstAck.DIAGNOSTIC_MARKER) !== -1;
    });
};

SNFirstAck._extractFltId = function (text) {
    const patterns = [
        /FLT[\s_-]?ID\s*[:\-]\s*([A-Za-z0-9._\-]+)/i,
        /\b(FLT[-_][A-Za-z0-9._\-]+)\b/i
    ];

    for (let i = 0; i < patterns.length; i++) {
        const match = text.match(patterns[i]);
        if (match) return match[1].trim();
    }

    return '';
};

SNFirstAck._sectionAfter = function (text, label, stopLabels) {
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

SNFirstAck.parseDiagnosticNote = function (noteValue) {
    const message = SNFirstAck._sectionAfter(noteValue, 'Message', ['Logs']);
    const logs = SNFirstAck._sectionAfter(noteValue, 'Logs', ['Message']);

    return {
        fltId: SNFirstAck._extractFltId(noteValue),
        message: message,
        logs: logs,
        rawNote: noteValue
    };
};

SNFirstAck._isInterfaceVprn = function (parsed) {
    const text = ((parsed.message || '') + '\n' + (parsed.logs || '')).toLowerCase();
    return /interface\s*\/\s*vprn/.test(text) || /interface\/vprn/.test(text);
};

SNFirstAck._hasBgp = function (parsed) {
    const text = ((parsed.message || '') + '\n' + (parsed.logs || '')).toLowerCase();
    return /\bbgp\b/.test(text);
};

SNFirstAck._hasPing = function (parsed) {
    const text = ((parsed.message || '') + '\n' + (parsed.logs || '')).toLowerCase();
    return /\bping\b/.test(text);
};

SNFirstAck.classifyAndFilterDiagnostics = function (parsedNotes) {
    const kept = [];
    const ignored = [];

    (parsedNotes || []).forEach(function (parsed) {
        if (SNFirstAck._isInterfaceVprn(parsed)) {
            ignored.push({ reason: 'Interface/VPRN', parsed: parsed });
            return;
        }

        const kinds = [];
        if (SNFirstAck._hasBgp(parsed)) kinds.push('BGP');
        if (SNFirstAck._hasPing(parsed)) kinds.push('Ping');

        if (kinds.length === 0) {
            ignored.push({ reason: 'Not BGP or Ping', parsed: parsed });
            return;
        }

        kept.push({
            kinds: kinds,
            fltId: parsed.fltId,
            message: parsed.message,
            logs: parsed.logs
        });
    });

    return { kept: kept, ignored: ignored };
};

SNFirstAck.extractDiagnostics = function (journalRecords) {
    const diagnosticNotes = SNFirstAck.filterDiagnosticWorkNotes(journalRecords);
    const parsed = diagnosticNotes.map(function (record) {
        return SNFirstAck.parseDiagnosticNote(record.value || '');
    });
    return SNFirstAck.classifyAndFilterDiagnostics(parsed);
};
