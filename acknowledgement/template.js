var InitialAcknowledgement = InitialAcknowledgement || {};

InitialAcknowledgement._hasValue = function (value) {
    if (value === undefined || value === null) return false;
    const text = String(value).trim();
    return text !== '' && text.toLowerCase() !== 'undefined' && text.toLowerCase() !== 'null';
};

InitialAcknowledgement._line = function (label, value) {
    if (!InitialAcknowledgement._hasValue(value)) return '';
    return label + ': ' + String(value).trim();
};

InitialAcknowledgement._joinNonEmpty = function (parts, separator) {
    return parts.filter(InitialAcknowledgement._hasValue).join(separator);
};

InitialAcknowledgement.buildAcknowledgement = function (data) {
    const siteBits = InitialAcknowledgement._joinNonEmpty(
        [data.customerName, data.location],
        ', '
    );

    const serviceLines = [
        InitialAcknowledgement._line('Service Type', data.serviceType),
        InitialAcknowledgement._line('Last Mile Provider', data.lastMileProvider),
        InitialAcknowledgement._line('Management Type', data.managementType),
        InitialAcknowledgement._line('Scope', data.scope),
        InitialAcknowledgement._line('CPE Managed', data.cpeManaged)
    ].filter(Boolean);
    
    // Only add Circuit Type if it has a value
    if (InitialAcknowledgement._hasValue(data.circuitType)) {
        serviceLines.push('Circuit Type: ' + data.circuitType);
    }

    const observation = ['The service is currently UP.'];
    if (InitialAcknowledgement._hasValue(data.bgpText)) observation.push(data.bgpText);
    if (InitialAcknowledgement._hasValue(data.pingText)) observation.push(data.pingText);

    const blocks = [];
    blocks.push('Dear Customer,');
    blocks.push('');

    if (InitialAcknowledgement._hasValue(data.circuitId)) {
        blocks.push('Regarding the reported issue for Circuit ID: ' + String(data.circuitId).trim() + ',');
    } else {
        blocks.push('Regarding the reported issue,');
    }

    blocks.push('');

    if (InitialAcknowledgement._hasValue(siteBits)) {
        blocks.push('Customer Site:');
        blocks.push(siteBits);
        blocks.push('');
    }

    if (serviceLines.length) {
        blocks.push('Service Details:');
        blocks.push('');
        serviceLines.forEach(function (line) { blocks.push(line); });
        blocks.push('');
    }

    blocks.push('Observation:');
    blocks.push('');
    observation.forEach(function (line) { blocks.push(line); });
    blocks.push('');

    // Add Logs section if diagnostic logs are available
    const logSections = [];
    if (InitialAcknowledgement._hasValue(data.bgpLogs)) {
        logSections.push('BGP Verification:');
        logSections.push('');
        logSections.push(data.bgpLogs.trim());
        logSections.push('');
    }
    if (InitialAcknowledgement._hasValue(data.pingLogs)) {
        logSections.push('Ping Verification:');
        logSections.push('');
        logSections.push(data.pingLogs.trim());
        logSections.push('');
    }
    
    if (logSections.length > 0) {
        blocks.push('Logs:');
        blocks.push('');
        logSections.forEach(function (logSection) {
            blocks.push(logSection);
        });
    }

    blocks.push('Further monitoring is in progress.');

    return blocks.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
};
