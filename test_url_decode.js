// Test URL decoding analysis
console.log("=== ANALYZING URL PARAMETERS ===");

const originalUrl = "https://tatain.service-now.com/now/nav/ui/classic/params/target/sn_customerservice_case_list.do%3Fsysparm_query%3DstateIN6%255EimpactIN4%252C5%252C6%255EparentISEMPTY%255Eu_acknowledgement%253Dtrue%255Eu_status_reasonNOT%2520IN20%252C68%255EORu_status_reason%253D%255Eactive%253Dtrue%255Eu_first_assignment_group%253D6b28bf5cdbc4d1946f316a9ed3961932%255EORassignment_group%253D6b28bf5cdbc4d1946f316a9ed3961932%255Eproduct.type%253DIP%255EORproduct.type%253DSDWAN%255EORproduct.type%253DTX%255Eu_status_reason!%253D100%255EORu_status_reason%253D%255Eu_status_reason!%253D20%255EORu_status_reason%253D%255Eu_rfo_ready%253Dfalse%255Eassignment_groupNOT%2520LIKEIPSOC_%2520Eco%2526IZOInternet%255Eshort_descriptionNOT%2520LIKEBB%255EORshort_descriptionISEMPTY%255Eassignment_group!%253D0eb19a1047acca10b97e4497436d4374%255EORassignment_group%253D";

console.log("Original URL:");
console.log(originalUrl);

// Extract the target part
const targetMatch = originalUrl.match(/params\/target\/(.+)$/);
if (targetMatch) {
    let targetUrl = targetMatch[1];
    console.log("\nExtracted target URL:");
    console.log(targetUrl);
    
    // First decode
    let firstDecode = decodeURIComponent(targetUrl);
    console.log("\nAfter first decode:");
    console.log(firstDecode);
    
    // Second decode  
    let secondDecode = decodeURIComponent(firstDecode);
    console.log("\nAfter second decode:");
    console.log(secondDecode);
    
    // Parse the query parameters
    const urlObj = new URL("https://tatain.service-now.com/" + secondDecode);
    console.log("\nFinal parsed parameters:");
    console.log("Query:", urlObj.search);
    console.log("sysparm_query:", urlObj.searchParams.get("sysparm_query"));
    
    // Break down the sysparm_query
    const query = urlObj.searchParams.get("sysparm_query");
    console.log("\nQuery breakdown:");
    console.log("Full query:", query);
    
    // Split by ^ to see individual conditions
    const conditions = query.split('^');
    console.log("\nIndividual conditions:");
    conditions.forEach((condition, index) => {
        console.log(`${index + 1}: ${condition}`);
    });
}
