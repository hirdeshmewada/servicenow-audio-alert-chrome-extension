// Test the background.js URL processing functions
console.log('=== TESTING BACKGROUND.JS URL PROCESSING ===');

// Test URLs
const testUrls = [
    'https://tatain.service-now.com/now/nav/ui/classic/params/target/sn_customerservice_case_list.do%3Fsysparm_query%3Dimpact%253D4%255EORimpact%253D5%255EORimpact%253D6%255EstateIN1%252C2%252C-2%252C-3%255EimpactIN4%252C5%252C6%255EparentISEMPTY%255Eu_acknowledgement%253Dtrue',
    'https://tatain.service-now.com/sn_customerservice_case_list.do?sysparm_query=state=2^priority=1',
    'https://tatain.service-now.com/now/nav/ui/classic/params/target/sn_customerservice_case_list.do%3Fsysparm_query%3DstateIN6%255EimpactIN4%252C5%252C6'
];

// Progressive decode function (copied from background.js)
function progressiveDecode(encodedString) {
    let decoded = encodedString;
    let previousDecoded;
    let decodeCount = 0;
    const maxDecodes = 5;
    
    do {
        previousDecoded = decoded;
        try {
            decoded = decodeURIComponent(decoded);
            decodeCount++;
            console.log(`Decode iteration ${decodeCount}:`, decoded);
        } catch (e) {
            console.log('Decoding failed at iteration', decodeCount + 1, ':', e.message);
            break;
        }
    } while (decoded !== previousDecoded && decodeCount < maxDecodes);
    
    console.log(`Total decode iterations: ${decodeCount}`);
    return decoded;
}

// Extract ServiceNow query function (copied from background.js)
function extractServiceNowQuery(url) {
    try {
        let workingUrl = url;
        if (url.includes('%')) {
            workingUrl = progressiveDecode(url);
        }
        
        const patterns = [
            /sysparm_query=([^&]*)/,
            /sysparm_query%3D([^&]*)/,
            /sysparm_query%253D([^&]*)/,
            /[?&]sysparm_query=([^&]*)/
        ];
        
        for (const pattern of patterns) {
            const match = workingUrl.match(pattern);
            if (match) {
                let query = match[1];
                if (query.includes('%')) {
                    query = progressiveDecode(query);
                }
                return query;
            }
        }
        
        return '';
    } catch (error) {
        console.error('Error extracting ServiceNow query:', error);
        return '';
    }
}

// Test each URL
testUrls.forEach((url, index) => {
    console.log(`\n--- TEST URL ${index + 1} ---`);
    console.log('Original URL:', url);
    
    try {
        const query = extractServiceNowQuery(url);
        console.log('Extracted query:', query);
        
        if (query) {
            console.log('✅ SUCCESS: Query extracted successfully');
            console.log('Query length:', query.length, 'characters');
            
            // Count conditions
            const conditions = query.split('^');
            console.log('Number of conditions:', conditions.length);
            
            // Show first few conditions
            console.log('First 3 conditions:');
            conditions.slice(0, 3).forEach((condition, i) => {
                console.log(`  ${i + 1}: ${condition}`);
            });
        } else {
            console.log('❌ FAILED: No query extracted');
        }
    } catch (error) {
        console.error('❌ ERROR:', error.message);
    }
});

console.log('\n=== TEST COMPLETE ===');
