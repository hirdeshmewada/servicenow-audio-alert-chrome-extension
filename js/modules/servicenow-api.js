// ServiceNow Audio Alerts - ServiceNow API Module
// Handles all ServiceNow REST API interactions

import { updateTicketLists } from './state-manager.js';

// Main API data fetching function
export async function getDataREST(url) {
    try {
        const response = await fetch(url + '&sysparm_limit=1000', {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        const records = data.records || [];
        
        // Console logging for URL data - print the main table records
        console.log(`=== URL DATA DEBUG ===`);
        console.log(`URL: ${url}`);
        console.log(`Full response data:`, data);
        console.log(`Records array (main table):`, records);
        console.log(`Number of records: ${records.length}`);
        console.log(`=====================`);

        if (records.length === 0) {
            return createEmptyResult();
        }

        return processRecords(records);

    } catch (error) {
        console.error('Error fetching data:', error);
        // Return empty result on error to prevent breaking the UI
        return createEmptyResult();
    }
}

// Create empty result object
function createEmptyResult() {
    return {
        quantity: 0,
        number: null,
        severity: null,
        description: null,
        timestamp: 0,
        account: null,
        assigned_to: null,
        state: null,
        u_next_step_date_and_time: null,
        impact: null,
        category: null,
        opened_by: null,
        assignment_group: null,
        u_first_assignment_group: null,
        u_service_downtime_started: null,
        u_service_downtime_end: null,
        u_fault_cause: null,
        resolved_by: null,
        resolved_at: null,
        u_resolved: null,
        u_resolved_by: null,
        sys_updated_on: 0,
        sys_mod_count: 0
    };
}

// Process records and extract ticket information
function processRecords(records) {
    let maxTimestamp = 0;
    let latestRecord = null;
    const ticketNumbers = [];

    records.forEach(record => {
        const ticketNumber = record.number;
        ticketNumbers.push(ticketNumber);

        let severity = record.priority || "5";
        if (ticketNumber.includes("TASK")) {
            severity = "10";
        } else if (ticketNumber.includes("CHG")) {
            severity = "15";
        }

        const timestamp = record.sys_updated_on ? new Date(record.sys_updated_on).getTime() : 0;
        
        if (timestamp > maxTimestamp) {
            maxTimestamp = timestamp;
            latestRecord = {
                number: ticketNumber,
                severity: severity,
                description: record.short_description || record.description,
                timestamp: timestamp,
                account: record.account,
                assigned_to: record.assigned_to,
                state: record.state,
                u_next_step_date_and_time: record.u_next_step_date_and_time,
                impact: record.impact,
                category: record.category,
                opened_by: record.opened_by,
                assignment_group: record.assignment_group,
                u_first_assignment_group: record.u_first_assignment_group,
                u_service_downtime_started: record.u_service_downtime_started,
                u_service_downtime_end: record.u_service_downtime_end,
                u_fault_cause: record.u_fault_cause,
                resolved_by: record.resolved_by,
                resolved_at: record.resolved_at,
                u_resolved: record.u_resolved,
                u_resolved_by: record.u_resolved_by,
                sys_updated_on: record.sys_updated_on,
                sys_mod_count: record.sys_mod_count
            };
        }
    });

    // Update the global ticket list
    updateTicketLists(ticketNumbers);

    return {
        quantity: records.length,
        ...latestRecord
    };
}

// Queue processing function
export async function processQueues(items) {
    console.log('Starting queue processing...');
    
    if (items.disablePoll === "on") {
        console.log('Polling disabled, clearing state');
        return {
            totalCount: 0,
            results: [],
            shouldStop: true
        };
    }

    const primaryURL = changeURLforRESTAPI(items.primary);
    const secondaryURL = changeURLforRESTAPI(items.secondary);
    
    const urls = [];
    if (primaryURL) urls.push(primaryURL);
    if (secondaryURL) urls.push(secondaryURL);

    if (urls.length === 0) {
        console.log('No URLs configured');
        return {
            totalCount: 0,
            results: [],
            shouldStop: true
        };
    }

    try {
        console.log('Fetching data from', urls.length, 'URL(s)');
        
        const results = await Promise.all(urls.map(url => getDataREST(url)));
        
        // Console logging for URL-specific data objects
        console.log(`=== URL-SPECIFIC DATA OBJECTS ===`);
        results.forEach((result, index) => {
            console.log(`URL ${index + 1} object:`, result);
        });
        console.log(`================================`);
        
        let totalCount = 0;
        let latestData = null;

        if (urls.length === 1) {
            const data = results[0];
            totalCount = data.quantity;
            console.log('Single queue - Current total:', totalCount);
            latestData = data;
        } else {
            const [data1, data2] = results;
            totalCount = data1.quantity + data2.quantity;
            console.log('Dual queue - Current total:', totalCount);
            console.log('Dual queue - Data1 count:', data1.quantity, 'Data2 count:', data2.quantity);
            
            if (data1.quantity > 0 || data2.quantity > 0) {
                latestData = data1.timestamp > data2.timestamp ? data1 : data2;
                console.log('Dual queue - Latest data:', latestData.number, 'Timestamp:', latestData.timestamp);
            }
        }

        return {
            totalCount,
            results,
            latestData,
            urls: urls.length
        };

    } catch (error) {
        console.error('Error processing queues:', error);
        return {
            totalCount: 0,
            results: [],
            error: error.message
        };
    }
}

// Import URL processing functions (will be created in next module)
// These are placeholders that will be replaced when the URL module is created
function changeURLforRESTAPI(url) {
    if (!url || url === "") return undefined;
    
    // This function will be replaced by the URL processing module
    // For now, return the URL as-is to avoid breaking functionality
    console.log('URL processing (placeholder):', url);
    return url;
}

// Export the URL processing function setter for module integration
export function setURLProcessor(processorFunction) {
    changeURLforRESTAPI = processorFunction;
}
