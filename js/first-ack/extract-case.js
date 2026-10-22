// First Acknowledgement - Case API extraction

var SNFirstAck = SNFirstAck || {};

SNFirstAck.CASE_TABLE = 'sn_customerservice_case.do';

SNFirstAck.CASE_RELATED_FIELD_HINT = /account|customer|circuit|asset|cmdb|product|location|site|service|contact|company|u_ci|configuration_item/i;

SNFirstAck.ASSET_FIELD_CANDIDATES = [
    'asset',
    'cmdb_ci',
    'configuration_item',
    'u_asset',
    'u_cmdb_ci',
    'u_telecom_business_service',
    'u_business_service',
    'business_service',
    'u_circuit',
    'u_service'
];

SNFirstAck.fetchCaseRecord = async function (origin, caseSysId) {
    const displayRecords = await SNFirstAck.fetchRecords(
        origin,
        SNFirstAck.CASE_TABLE,
        'sys_id=' + caseSysId,
        { displayValue: true }
    );

    const rawRecords = await SNFirstAck.fetchRecords(
        origin,
        SNFirstAck.CASE_TABLE,
        'sys_id=' + caseSysId,
        { displayValue: false }
    );

    return {
        display: SNFirstAck.firstRecord(displayRecords),
        raw: SNFirstAck.firstRecord(rawRecords)
    };
};

SNFirstAck.pickAssetSysId = function (rawCase) {
    if (!rawCase) return '';

    for (let i = 0; i < SNFirstAck.ASSET_FIELD_CANDIDATES.length; i++) {
        const field = SNFirstAck.ASSET_FIELD_CANDIDATES[i];
        const value = rawCase[field];
        if (SNFirstAck.isSysId(value)) {
            return { field: field, sysId: value.trim() };
        }
    }

    for (const field in rawCase) {
        if (!Object.prototype.hasOwnProperty.call(rawCase, field)) continue;
        if (!SNFirstAck.CASE_RELATED_FIELD_HINT.test(field)) continue;
        const value = rawCase[field];
        if (SNFirstAck.isSysId(value)) {
            return { field: field, sysId: value.trim() };
        }
    }

    return { field: '', sysId: '' };
};

SNFirstAck.extractCaseData = function (casePair) {
    const display = casePair.display || {};
    const raw = casePair.raw || {};
    const assetRef = SNFirstAck.pickAssetSysId(raw);

    const related = {};
    for (const field in display) {
        if (!Object.prototype.hasOwnProperty.call(display, field)) continue;
        if (SNFirstAck.CASE_RELATED_FIELD_HINT.test(field) || field === 'description' || field === 'short_description' || field === 'number' || field === 'sys_id') {
            related[field] = display[field];
        }
    }

    return {
        caseSysId: display.sys_id || raw.sys_id || '',
        number: display.number || raw.number || '',
        description: display.description || display.short_description || '',
        shortDescription: display.short_description || '',
        assetField: assetRef.field,
        assetSysId: assetRef.sysId,
        assetDisplay: assetRef.field ? (display[assetRef.field] || '') : '',
        customerCircuitRelated: related,
        rawDisplayRecord: display,
        rawSysIdRecord: raw
    };
};
