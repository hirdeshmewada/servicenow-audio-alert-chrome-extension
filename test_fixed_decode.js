// Test the fixed URL processing
console.log("=== TESTING FIXED URL PROCESSING ===");

const originalUrl = "https://tatain.service-now.com/now/nav/ui/classic/params/target/sn_customerservice_case_list.do%3Fsysparm_query%3DstateIN6%255EimpactIN4%252C5%252C6%255EparentISEMPTY%255Eu_acknowledgement%253Dtrue%255Eu_status_reasonNOT%2520IN20%252C68%255EORu_status_reason%253D%255Eactive%253Dtrue%255Eu_first_assignment_group%253D6b28bf5cdbc4d1946f316a9ed3961932%255EORassignment_group%253D6b28bf5cdbc4d1946f316a9ed3961932%255Eproduct.type%253DIP%255EORproduct.type%253DSDWAN%255EORproduct.type%253DTX%255Eu_status_reason!%253D100%255EORu_status_reason%253D%255Eu_status_reason!%253D20%255EORu_status_reason%253D%255Eu_rfo_ready%253Dfalse%255Eassignment_groupNOT%2520LIKEIPSOC_%2520Eco%2526IZOInternet%255Eshort_descriptionNOT%2520LIKEBB%255EORshort_descriptionISEMPTY%255Eassignment_group!%253D0eb19a1047acca10b97e4497436d4374%255EORassignment_group%253D";

console.log("Original URL:");
console.log(originalUrl);

// Simulate the fixed processing
let processedUrl = originalUrl;

if (originalUrl.includes('/now/nav/ui/classic/params/target/')) {
    console.log('\nDetected new ServiceNow UI URL, processing...');
    
    const targetMatch = originalUrl.match(/params\/target\/(.+)$/);
    if (targetMatch) {
        let targetUrl = targetMatch[1];
        
        // First decode
        targetUrl = decodeURIComponent(targetUrl);
        
        // Second decode  
        targetUrl = decodeURIComponent(targetUrl);
        
        console.log('Extracted target URL:', targetUrl);
        
        const urlMatch = originalUrl.match(/(https:\/\/[^\/]+)/);
        if (urlMatch) {
            processedUrl = urlMatch[1] + '/' + targetUrl;
            console.log('Processed URL:', processedUrl);
        }
    }
}

// Manual query string handling to preserve special characters
const queryString = processedUrl.includes('?') ? processedUrl.split('?')[1] : '';
console.log('\nExtracted query string:');
console.log(queryString);

// Simulate the final REST API URL construction
const urlObj = new URL(processedUrl);
let restURL = `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}?${queryString}&JSONv2&sysparm_fields=number,severity,short_description,priority,sys_id,sys_updated_on,account,assigned_to,state,u_next_step_date_and_time,impact,category,opened_by,assignment_group,u_first_assignment_group,u_service_downtime_started,u_service_downtime_end,u_fault_cause,resolved_by,resolved_at,u_resolved,u_resolved_by,sys_mod_count`;

console.log('\nFinal REST API URL:');
console.log(restURL);

// Verify the query is complete
const finalQuery = restURL.split('?')[1].split('&JSONv2')[0];
console.log('\nFinal sysparm_query (should be complete):');
console.log(finalQuery);

// Count conditions to verify completeness
const conditions = finalQuery.split('^');
console.log('\nNumber of conditions:', conditions.length);
console.log('Last condition:', conditions[conditions.length - 1]);
