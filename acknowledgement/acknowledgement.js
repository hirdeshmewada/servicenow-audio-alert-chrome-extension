var InitialAcknowledgement = InitialAcknowledgement || {};

InitialAcknowledgement._SYS_ID = /^[a-f0-9]{32}$/i;

InitialAcknowledgement._field = function (record, name) {
    if (!record) return '';
    const value = record[name];
    if (value === undefined || value === null) return '';
    if (typeof value === 'object') {
        const display = value.display_value !== undefined ? value.display_value : value.value;
        return display === undefined || display === null ? '' : String(display).trim();
    }
    return String(value).trim();
};

InitialAcknowledgement._sysIdField = function (record, name) {
    if (!record) return '';
    const value = record[name];
    if (!value) return '';
    if (typeof value === 'object' && value.value && InitialAcknowledgement._SYS_ID.test(value.value)) {
        return value.value;
    }
    if (typeof value === 'string' && InitialAcknowledgement._SYS_ID.test(value)) return value;
    return '';
};

InitialAcknowledgement._firstFilled = function (record, names) {
    for (let i = 0; i < names.length; i++) {
        const value = InitialAcknowledgement._field(record, names[i]);
        if (value && value.toLowerCase() !== 'undefined') return value;
    }
    return '';
};

InitialAcknowledgement._toYesNo = function (value) {
    if (!value) return '';
    const lower = String(value).trim().toLowerCase();
    if (['true', 'yes', 'y', '1', 'managed'].indexOf(lower) !== -1) return 'YES';
    if (['false', 'no', 'n', '0', 'unmanaged', 'not managed'].indexOf(lower) !== -1) return 'NO';
    if (lower === 'yes') return 'YES';
    if (lower === 'no') return 'NO';
    return String(value).trim();
};

InitialAcknowledgement._circuitType = function (record) {
    const direct = InitialAcknowledgement._firstFilled(record, [
        'u_circuit_type',
        'u_redundancy',
        'u_redundancy_type',
        'u_link_type',
        'u_link_role',
        'u_ha_type',
        'u_primary_secondary',
        'u_path'
    ]);
    if (!direct) return '';
    const lower = direct.toLowerCase();
    if (lower.indexOf('primary') !== -1) return 'Primary';
    if (lower.indexOf('secondary') !== -1) return 'Secondary';
    if (lower.indexOf('single') !== -1) return 'Single';
    return direct;
};

InitialAcknowledgement._parseSysIdFromUrl = function (url) {
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

InitialAcknowledgement._readPageContext = function () {
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

InitialAcknowledgement.getCaseContext = async function () {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) throw new Error('No active tab found.');

    let origin = '';
    try {
        origin = new URL(tab.url).origin;
    } catch (e) {}

    let sysId = InitialAcknowledgement._parseSysIdFromUrl(tab.url);

    if (!sysId && tab.id && chrome.scripting) {
        try {
            const injected = await chrome.scripting.executeScript({
                target: { tabId: tab.id, allFrames: true },
                func: InitialAcknowledgement._readPageContext
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
            console.log('[ACK] Could not inspect page for sys_id:', error.message);
        }
    }

    if (!origin || origin.indexOf('service-now.com') === -1) {
        const stored = await chrome.storage.sync.get(['rooturl']);
        if (stored.rooturl) origin = String(stored.rooturl).replace(/\/$/, '');
    }

    if (!sysId) {
        throw new Error('Open a ServiceNow case tab, then click Generate Initial Acknowledgement.');
    }
    if (!origin) {
        throw new Error('Could not determine ServiceNow instance URL.');
    }

    return { origin: origin.replace(/\/$/, ''), sysId: sysId };
};

InitialAcknowledgement._fetchJson = async function (url) {
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

InitialAcknowledgement.fetchTableRecord = async function (origin, table, sysId) {
    try {
        const url = origin + '/api/now/table/' + table + '/' + sysId + '?sysparm_display_value=all';
        const data = await InitialAcknowledgement._fetchJson(url);
        return data.result || null;
    } catch (error) {
        console.log('[ACK] Table API unavailable for', table, '-', error.message, '; using JSONv2');
        const displayUrl = origin + '/' + table + '.do?sysparm_query=' +
            encodeURIComponent('sys_id=' + sysId) + '&JSONv2&sysparm_display_value=true';
        const rawUrl = origin + '/' + table + '.do?sysparm_query=' +
            encodeURIComponent('sys_id=' + sysId) + '&JSONv2';
        const displayData = await InitialAcknowledgement._fetchJson(displayUrl);
        const rawData = await InitialAcknowledgement._fetchJson(rawUrl);
        const display = (displayData.records && displayData.records[0]) || null;
        const raw = (rawData.records && rawData.records[0]) || null;
        if (!display) return raw;
        if (!raw) return display;
        Object.keys(raw).forEach(function (field) {
            if (InitialAcknowledgement._SYS_ID.test(raw[field])) {
                display[field] = {
                    value: raw[field],
                    display_value: display[field]
                };
            }
        });
        return display;
    }
};

InitialAcknowledgement.fetchJournal = async function (origin, caseSysId) {
    const url = origin + '/sys_journal_field.do?sysparm_query=' +
        encodeURIComponent('element_id=' + caseSysId) +
        '&JSONv2&sysparm_display_value=true&sysparm_limit=1000';
    const data = await InitialAcknowledgement._fetchJson(url);
    return data.records || [];
};

InitialAcknowledgement._assetSysIdFromCase = function (caseRecord) {
    const names = [
        'asset',
        'cmdb_ci',
        'configuration_item',
        'u_asset',
        'u_cmdb_ci',
        'u_telecom_business_service',
        'u_business_service',
        'business_service'
    ];
    for (let i = 0; i < names.length; i++) {
        const sysId = InitialAcknowledgement._sysIdField(caseRecord, names[i]);
        if (sysId) return { field: names[i], sysId: sysId };
    }
    return { field: '', sysId: '' };
};

InitialAcknowledgement._extractServiceType = function (disposalReason) {
    if (!disposalReason) return '';
    const match = disposalReason.match(/Product Flavour\s*:\s*(.+?)(?:\s*Source Type|$)/i);
    return match ? match[1].trim() : '';
};

InitialAcknowledgement._extractLogs = function (diagnostics) {
    const logs = [];
    const bgpLogs = diagnostics.bgp.fullOutput || '';
    const pingLogs = diagnostics.ping.fullOutput || '';
    
    if (bgpLogs) {
        const cleaned = InitialAcknowledgement._cleanLogOutput(bgpLogs);
        if (cleaned) logs.push(cleaned);
    }
    if (pingLogs) {
        const cleaned = InitialAcknowledgement._cleanLogOutput(pingLogs);
        if (cleaned) logs.push(cleaned);
    }
    
    return logs;
};

InitialAcknowledgement._cleanLogOutput = function (logText) {
    if (!logText) return '';
    
    // Remove "Logs [code]FLT ID: ...[/code]" prefix
    let cleaned = logText.replace(/Logs\s*\[code\]FLT ID:\s*[\w\d]+\s*\[\/code\]\s*/gi, '');
    
    // Remove "[code] Insights: Diagnostic Update Message Logs" prefix
    cleaned = cleaned.replace(/\[code\]\s*Insights:\s*Diagnostic Update Message Logs\s*/gi, '');
    
    // Remove message text before the actual command (everything before the PE name pattern)
    // PE name pattern: starts with lowercase letters, numbers, hyphens, followed by space and command
    cleaned = cleaned.replace(/^[^a-z0-9]*([a-z0-9\-]+\s+show|[a-z0-9\-]+\s+ping)/i, '$1');
    
    // Remove "[/code]" and "by INSIGHTS" suffix
    cleaned = cleaned.replace(/\s*\[\/code\]\s*by\s*INSIGHTS\s*/gi, '');
    
    // Remove any remaining [code] tags
    cleaned = cleaned.replace(/\[code\]|\[\/code\]/gi, '');
    
    // Remove duplicate commands (sometimes the command appears twice in the log)
    const lines = cleaned.split('\n').filter(l => l.trim());
    if (lines.length > 0) {
        const firstLine = lines[0].trim();
        // Check if the command repeats later in the text
        const secondOccurrence = cleaned.indexOf(firstLine, firstLine.length + 1);
        if (secondOccurrence > -1) {
            // Remove the first occurrence (keep the second one with the output)
            cleaned = cleaned.substring(secondOccurrence).trim();
        }
    }
    
    return cleaned.trim();
};

InitialAcknowledgement._extractServiceData = function (caseRecord, assetRecord) {
    const combined = Object.assign({}, caseRecord || {}, assetRecord || {});
    const disposalReason = InitialAcknowledgement._field(assetRecord, 'disposal_reason') ||
        InitialAcknowledgement._field(caseRecord, 'disposal_reason');
    
    return {
        circuitId: InitialAcknowledgement._firstFilled(combined, [
            'u_circuit_id', 'circuit_id', 'u_circuit', 'name', 'u_name', 'u_service_id'
        ]),
        customerName: InitialAcknowledgement._firstFilled(combined, [
            'u_customer_site_name', 'u_customer_name', 'u_customer', 'customer', 'account', 'u_account', 'company', 'u_site_name'
        ]),
        location: InitialAcknowledgement._firstFilled(combined, [
            'u_a_end_site_address', 'u_location', 'location', 'u_site', 'u_city', 'city', 'u_address', 'u_site_location', 'u_customer_site'
        ]),
        serviceType: InitialAcknowledgement._extractServiceType(disposalReason) ||
            InitialAcknowledgement._firstFilled(combined, [
                'u_service_type', 'service_type', 'u_product_type', 'product', 'u_product', 'type', 'u_type'
            ]),
        lastMileProvider: InitialAcknowledgement._field(assetRecord, 'u_a_end_ll_provider') ||
            InitialAcknowledgement._field(caseRecord, 'u_a_end_ll_provider'),
        managementType: InitialAcknowledgement._field(assetRecord, 'u_management_type') ||
            InitialAcknowledgement._field(caseRecord, 'u_management_type'),
        scope: InitialAcknowledgement._field(assetRecord, 'u_scope_of_management') ||
            InitialAcknowledgement._field(caseRecord, 'u_scope_of_management'),
        cpeManaged: InitialAcknowledgement._toYesNo(
            InitialAcknowledgement._field(assetRecord, 'u_cpe_managed') ||
            InitialAcknowledgement._field(caseRecord, 'u_cpe_managed')
        ),
        circuitType: InitialAcknowledgement._circuitType(assetRecord) ||
            InitialAcknowledgement._circuitType(caseRecord),
        prisec: InitialAcknowledgement._field(assetRecord, 'u_prisec') ||
            InitialAcknowledgement._field(caseRecord, 'u_prisec'),
        bandwidth: InitialAcknowledgement._field(assetRecord, 'u_bandwidth') ||
            InitialAcknowledgement._field(caseRecord, 'u_bandwidth')
    };
};

InitialAcknowledgement.generate = async function () {
    const context = await InitialAcknowledgement.getCaseContext();
    console.log('[ACK] Case sys_id:', context.sysId);

    const caseRecord = await InitialAcknowledgement.fetchTableRecord(
        context.origin,
        'sn_customerservice_case',
        context.sysId
    );
    if (!caseRecord) throw new Error('Case API returned no record.');

    const assetRef = InitialAcknowledgement._assetSysIdFromCase(caseRecord);
    console.log('[ACK] Asset:', assetRef);

    let assetRecord = null;
    if (assetRef.sysId) {
        assetRecord = await InitialAcknowledgement.fetchTableRecord(
            context.origin,
            'u_telecom_business_service',
            assetRef.sysId
        );
    }

    const service = InitialAcknowledgement._extractServiceData(caseRecord, assetRecord);
    console.log('[ACK] Circuit:', service.circuitId);

    const journal = await InitialAcknowledgement.fetchJournal(context.origin, context.sysId);
    const diagnostics = InitialAcknowledgement.parseDiagnostics(journal);
    const logs = InitialAcknowledgement._extractLogs(diagnostics);

    const acknowledgement = InitialAcknowledgement.buildAcknowledgement({
        circuitId: service.circuitId,
        customerName: service.customerName,
        location: service.location,
        serviceType: service.serviceType,
        lastMileProvider: service.lastMileProvider,
        managementType: service.managementType,
        scope: service.scope,
        cpeManaged: service.cpeManaged,
        circuitType: service.circuitType,
        prisec: service.prisec,
        bandwidth: service.bandwidth,
        bgpText: diagnostics.bgp.text,
        pingText: diagnostics.ping.text,
        rawLogs: logs
    });

    console.log('[ACK] Final acknowledgement:\n' + acknowledgement);
    await InitialAcknowledgement.copyText(acknowledgement);
    return acknowledgement;
};
