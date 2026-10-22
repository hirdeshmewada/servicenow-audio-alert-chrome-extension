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
        InitialAcknowledgement._line('CPE Managed', data.cpeManaged),
        InitialAcknowledgement._line('Circuit Type', data.circuitType),
        InitialAcknowledgement._line('Primary/Secondary', data.prisec),
        InitialAcknowledgement._line('Bandwidth', data.bandwidth)
    ].filter(Boolean);

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

    blocks.push('Issue Reported:');
    blocks.push('Customer reported link flapping / service instability.');
    blocks.push('');

    if (serviceLines.length) {
        blocks.push('Service Details:');
        blocks.push('');
        serviceLines.forEach(function (line) { blocks.push(line); });
        blocks.push('');
    }

    blocks.push('Observation:');
    blocks.push('');
    blocks.push('The service is currently UP.');
    blocks.push('');

    // Protocol Status section
    if (InitialAcknowledgement._hasValue(data.bgpText)) {
        blocks.push('Protocol Status:');
        blocks.push(data.bgpText);
        blocks.push('');
    }

    // Endpoint Reachability section
    if (InitialAcknowledgement._hasValue(data.pingText)) {
        blocks.push('Endpoint Reachability:');
        blocks.push(data.pingText);
        blocks.push('');
    }

    // Traffic Status section
    blocks.push('Traffic Status:');
    blocks.push('Traffic flow verification completed and service is currently carrying traffic.');
    blocks.push('');
    
    // Add logs section if available
    if (data.rawLogs && data.rawLogs.length > 0) {
        blocks.push('Logs:');
        blocks.push('');
        data.rawLogs.forEach(function (log) {
            blocks.push(log);
            blocks.push('');
        });
    }
    
    blocks.push('Next Action:');
    blocks.push('');
    blocks.push('Further monitoring and validation of service stability is in progress.');

    return blocks.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
};
