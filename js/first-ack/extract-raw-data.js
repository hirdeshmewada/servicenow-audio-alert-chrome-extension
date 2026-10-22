// First Acknowledgement - orchestrate Case -> Asset -> Journal extraction
// No acknowledgement text and no final payload schema.

var SNFirstAck = SNFirstAck || {};

SNFirstAck.extractRawData = async function (origin, caseSysId) {
    if (!origin) throw new Error('Missing ServiceNow origin');
    if (!SNFirstAck.isSysId(caseSysId)) throw new Error('Missing or invalid case sys_id');

    const casePair = await SNFirstAck.fetchCaseRecord(origin, caseSysId);
    if (!casePair.display && !casePair.raw) {
        throw new Error('Case API returned no record for sys_id ' + caseSysId);
    }

    const caseData = SNFirstAck.extractCaseData(casePair);

    let assetData = SNFirstAck.extractAssetData(null);
    if (caseData.assetSysId) {
        const assetRecord = await SNFirstAck.fetchAssetRecord(origin, caseData.assetSysId);
        assetData = SNFirstAck.extractAssetData(assetRecord);
    } else {
        console.warn('[First Ack] No asset sys_id found on case. Check raw case fields.');
    }

    const journalRecords = await SNFirstAck.fetchJournalRecords(origin, caseSysId);
    const diagnostics = SNFirstAck.extractDiagnostics(journalRecords);

    return {
        origin: origin,
        case: caseData,
        asset: assetData,
        diagnostics: diagnostics
    };
};

SNFirstAck.formatRawExtraction = function (extracted) {
    const lines = [];
    const caseData = extracted.case || {};
    const asset = extracted.asset || {};
    const diagnostics = extracted.diagnostics || { kept: [], ignored: [] };

    lines.push('=== CASE API ===');
    lines.push('sys_id: ' + (caseData.caseSysId || ''));
    lines.push('number: ' + (caseData.number || ''));
    lines.push('description: ' + (caseData.description || ''));
    lines.push('asset field: ' + (caseData.assetField || ''));
    lines.push('asset sys_id: ' + (caseData.assetSysId || ''));
    lines.push('asset display: ' + (caseData.assetDisplay || ''));
    lines.push('customer/circuit related fields:');
    const related = caseData.customerCircuitRelated || {};
    Object.keys(related).forEach(function (field) {
        lines.push('  ' + field + ': ' + related[field]);
    });

    lines.push('');
    lines.push('=== ASSET / TELECOM BUSINESS SERVICE API ===');
    lines.push('Circuit ID: ' + (asset.circuitId || ''));
    lines.push('Customer site/customer name: ' + (asset.customerSiteOrName || ''));
    lines.push('Last mile provider: ' + (asset.lastMileProvider || ''));
    lines.push('Management type: ' + (asset.managementType || ''));
    lines.push('Scope of management: ' + (asset.scopeOfManagement || ''));
    lines.push('CPE managed: ' + (asset.cpeManaged || ''));
    lines.push('Primary / Secondary / Single: ' + (asset.circuitRole || ''));
    lines.push('Matched fields:');
    const matched = asset.matchedFields || {};
    Object.keys(matched).forEach(function (key) {
        lines.push('  ' + key + ' <- ' + (matched[key] || '(not found)'));
    });

    lines.push('');
    lines.push('=== DIAGNOSTIC UPDATES (BGP / Ping only) ===');
    if (!diagnostics.kept.length) {
        lines.push('(none kept)');
    }
    diagnostics.kept.forEach(function (item, index) {
        lines.push('');
        lines.push('--- Diagnostic ' + (index + 1) + ' [' + item.kinds.join(', ') + '] ---');
        lines.push('FLT ID: ' + (item.fltId || ''));
        lines.push('Message:');
        lines.push(item.message || '');
        lines.push('Logs:');
        lines.push(item.logs || '');
    });

    lines.push('');
    lines.push('=== IGNORED DIAGNOSTICS ===');
    if (!diagnostics.ignored.length) {
        lines.push('(none)');
    }
    diagnostics.ignored.forEach(function (item, index) {
        lines.push('');
        lines.push('--- Ignored ' + (index + 1) + ' [' + item.reason + '] ---');
        lines.push('FLT ID: ' + (item.parsed.fltId || ''));
        lines.push('Message:');
        lines.push(item.parsed.message || '');
    });

    return lines.join('\n');
};
