// First Acknowledgement - isolated JSONv2 fetch (does not use existing alert modules)

var SNFirstAck = SNFirstAck || {};

SNFirstAck.fetchRecords = async function (origin, tableDo, sysparmQuery, options) {
    const displayValue = options && options.displayValue === false ? false : true;
    const limit = (options && options.limit) || 1000;

    const url =
        origin.replace(/\/$/, '') +
        '/' + tableDo +
        '?sysparm_query=' + encodeURIComponent(sysparmQuery) +
        '&JSONv2' +
        (displayValue ? '&sysparm_display_value=true' : '') +
        '&sysparm_limit=' + limit;

    console.log('[First Ack] GET', url);

    const response = await fetch(url, {
        method: 'GET',
        credentials: 'include',
        headers: {
            'Accept': 'application/json'
        }
    });

    if (!response.ok) {
        throw new Error('HTTP ' + response.status + ' for ' + tableDo + ': ' + response.statusText);
    }

    const data = await response.json();
    const records = data.records || [];
    console.log('[First Ack] ' + tableDo + ' records:', records.length, records);
    return records;
};

SNFirstAck.firstRecord = function (records) {
    return records && records.length ? records[0] : null;
};

SNFirstAck.isSysId = function (value) {
    return typeof value === 'string' && /^[a-f0-9]{32}$/i.test(value.trim());
};
