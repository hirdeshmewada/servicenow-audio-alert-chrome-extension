// First Acknowledgement - Asset / Telecom Business Service extraction

var SNFirstAck = SNFirstAck || {};

SNFirstAck.ASSET_TABLE = 'u_telecom_business_service.do';

SNFirstAck.ASSET_HINTS = {
    circuitId: ['circuit_id', 'u_circuit_id', 'circuitid', 'u_circuit', 'name', 'u_name', 'u_service_id'],
    customerName: ['customer_name', 'u_customer_name', 'customer', 'u_customer', 'account', 'u_account', 'site', 'u_site', 'u_customer_site', 'u_site_name', 'company'],
    lastMileProvider: ['last_mile', 'lastmile', 'lm_provider', 'u_last_mile', 'u_lm_provider', 'u_last_mile_provider', 'u_access_provider'],
    managementType: ['management_type', 'u_management_type', 'u_mgmt_type'],
    scopeOfManagement: ['scope_of_management', 'u_scope_of_management', 'u_management_scope', 'scope'],
    cpeManaged: ['cpe_managed', 'u_cpe_managed', 'u_cpe', 'cpe'],
    circuitRole: ['circuit_type', 'u_circuit_type', 'u_circuit_role', 'redundancy', 'u_redundancy', 'u_ha', 'primary_secondary', 'u_primary_secondary', 'u_link_type', 'u_path']
};

SNFirstAck.fetchAssetRecord = async function (origin, assetSysId) {
    const records = await SNFirstAck.fetchRecords(
        origin,
        SNFirstAck.ASSET_TABLE,
        'sys_id=' + assetSysId,
        { displayValue: true }
    );
    return SNFirstAck.firstRecord(records);
};

SNFirstAck._fieldLooksLike = function (fieldName, hints) {
    const lower = fieldName.toLowerCase();
    for (let i = 0; i < hints.length; i++) {
        if (lower === hints[i] || lower.indexOf(hints[i]) !== -1) return true;
    }
    return false;
};

SNFirstAck._firstMatchingField = function (record, hints) {
    if (!record) return { field: '', value: '' };

    for (let i = 0; i < hints.length; i++) {
        const hint = hints[i];
        for (const field in record) {
            if (!Object.prototype.hasOwnProperty.call(record, field)) continue;
            if (field.toLowerCase() !== hint) continue;
            if (record[field] === undefined || record[field] === null || String(record[field]).trim() === '') continue;
            return { field: field, value: String(record[field]).trim() };
        }
    }

    for (const field in record) {
        if (!Object.prototype.hasOwnProperty.call(record, field)) continue;
        if (SNFirstAck._fieldLooksLike(field, hints) && record[field] !== undefined && record[field] !== null && String(record[field]).trim() !== '') {
            return { field: field, value: String(record[field]).trim() };
        }
    }

    return { field: '', value: '' };
};

SNFirstAck._detectCircuitRole = function (matchedValue) {
    return matchedValue || '';
};

SNFirstAck.extractAssetData = function (assetRecord) {
    if (!assetRecord) {
        return {
            circuitId: '',
            customerSiteOrName: '',
            lastMileProvider: '',
            managementType: '',
            scopeOfManagement: '',
            cpeManaged: '',
            circuitRole: '',
            matchedFields: {},
            rawRecord: null
        };
    }

    const circuit = SNFirstAck._firstMatchingField(assetRecord, SNFirstAck.ASSET_HINTS.circuitId);
    const customer = SNFirstAck._firstMatchingField(assetRecord, SNFirstAck.ASSET_HINTS.customerName);
    const lastMile = SNFirstAck._firstMatchingField(assetRecord, SNFirstAck.ASSET_HINTS.lastMileProvider);
    const mgmt = SNFirstAck._firstMatchingField(assetRecord, SNFirstAck.ASSET_HINTS.managementType);
    const scope = SNFirstAck._firstMatchingField(assetRecord, SNFirstAck.ASSET_HINTS.scopeOfManagement);
    const cpe = SNFirstAck._firstMatchingField(assetRecord, SNFirstAck.ASSET_HINTS.cpeManaged);
    const roleMatch = SNFirstAck._firstMatchingField(assetRecord, SNFirstAck.ASSET_HINTS.circuitRole);

    return {
        circuitId: circuit.value,
        customerSiteOrName: customer.value,
        lastMileProvider: lastMile.value,
        managementType: mgmt.value,
        scopeOfManagement: scope.value,
        cpeManaged: cpe.value,
        circuitRole: SNFirstAck._detectCircuitRole(roleMatch.value),
        matchedFields: {
            circuitId: circuit.field,
            customerSiteOrName: customer.field,
            lastMileProvider: lastMile.field,
            managementType: mgmt.field,
            scopeOfManagement: scope.field,
            cpeManaged: cpe.field,
            circuitRole: roleMatch.field
        },
        rawRecord: assetRecord
    };
};
