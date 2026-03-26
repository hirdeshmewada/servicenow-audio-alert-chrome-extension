// Test the final fix
console.log("=== TESTING FINAL FIX ===");

const serviceNowQuery = "stateIN6^impactIN4,5,6^parentISEMPTY^u_acknowledgement=true^u_status_reasonNOT IN20,68^ORu_status_reason=^active=true^u_first_assignment_group=6b28bf5cdbc4d1946f316a9ed3961932^ORassignment_group=6b28bf5cdbc4d1946f316a9ed3961932^product.type=IP^ORproduct.type=SDWAN^ORproduct.type=TX^u_status_reason!=100^ORu_status_reason=^u_status_reason!=20^ORu_status_reason=^u_rfo_ready=false^assignment_groupNOT LIKEIPSOC_ Eco&IZOInternet^short_descriptionNOT LIKEBB^ORshort_descriptionISEMPTY^assignment_group!=0eb19a1047acca10b97e4497436d4374^ORassignment_group=";

console.log("Original query length:", serviceNowQuery.length);

// Test proper encoding
const encodedQuery = encodeURIComponent(serviceNowQuery);
console.log("Encoded query:", encodedQuery);

// Build final REST URL
const restURL = `https://tatain.service-now.com/sn_customerservice_case_list.do?sysparm_query=${encodedQuery}&JSONv2&sysparm_fields=number,severity,short_description,priority,sys_id,sys_updated_on,account,assigned_to,state,u_next_step_date_and_time,impact,category,opened_by,assignment_group,u_first_assignment_group,u_service_downtime_started,u_service_downtime_end,u_fault_cause,resolved_by,resolved_at,u_resolved,u_resolved_by,sys_mod_count`;

console.log("Final REST URL length:", restURL.length);
console.log("Final REST URL:", restURL);

// Test if the & character is properly encoded
const ampersandCount = (serviceNowQuery.match(/&/g) || []).length;
console.log("Number of & characters in original query:", ampersandCount);

const encodedAmpersandCount = (encodedQuery.match(/%26/g) || []).length;
console.log("Number of encoded & characters:", encodedAmpersandCount);

// Verify the critical part is preserved
const criticalPart = "assignment_groupNOT LIKEIPSOC_ Eco&IZOInternet";
const encodedCriticalPart = encodeURIComponent(criticalPart);
console.log("Critical part:", criticalPart);
console.log("Encoded critical part:", encodedCriticalPart);
