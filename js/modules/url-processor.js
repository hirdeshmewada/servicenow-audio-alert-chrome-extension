// ServiceNow Audio Alerts - URL Processing Module
// Handles ServiceNow URL parsing, decoding, and REST API conversion

// Progressive decoding for multiple encoding levels
export function progressiveDecode(encodedString) {
    let decoded = encodedString;
    let previousDecoded;
    let decodeCount = 0;
    const maxDecodes = 5; // Prevent infinite loops
    
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

// Main URL processing function
export function changeURLforRESTAPI(url) {
    if (!url || url === "") return undefined;

    try {
        console.log('=== ENHANCED SERVICENOW URL PROCESSING ===');
        console.log('Input URL:', url);
        
        // Handle new ServiceNow UI URLs with multiple encoding
        let processedUrl = url;
        if (url.includes('/now/nav/ui/classic/params/target/')) {
            console.log('Detected new ServiceNow UI URL, processing...');
            
            const targetMatch = url.match(/params\/target\/(.+)$/);
            if (targetMatch) {
                let targetUrl = targetMatch[1];
                
                // Progressive decoding - handle multiple encoding levels
                let decodedUrl = progressiveDecode(targetUrl);
                console.log('Progressively decoded URL:', decodedUrl);
                
                // Rebuild full URL
                const urlMatch = url.match(/(https:\/\/[^\/]+)/);
                if (urlMatch) {
                    processedUrl = urlMatch[1] + '/' + decodedUrl;
                    console.log('Rebuilt URL:', processedUrl);
                }
            }
        }
        
        // Validate it's a ServiceNow URL
        const urlObj = new URL(processedUrl);
        if (!urlObj.hostname.includes('service-now.com')) {
            console.warn('URL does not appear to be a ServiceNow instance:', processedUrl);
            return undefined;
        }

        // Extract ServiceNow query parameters safely
        const serviceNowQuery = extractServiceNowQuery(processedUrl);
        console.log('Extracted ServiceNow query:', serviceNowQuery);
        
        // Parse and analyze the query
        const parsedQuery = parseEncodedQuery(serviceNowQuery);
        console.log('Parsed conditions:', parsedQuery);
        
        // Build human-readable summary for debugging
        const summary = buildQuerySummary(parsedQuery);
        console.log('Query Analysis:');
        console.log(`- Total conditions: ${summary.totalConditions}`);
        console.log(`- Active tickets: ${summary.activeConditions}`);
        console.log(`- Resolved tickets: ${summary.resolvedConditions}`);
        console.log(`- Priority level: ${summary.priority || 'Not specified'}`);
        console.log(`- States: ${summary.states.join(', ')}`);
        console.log(`- Fields used: ${summary.fields.join(', ')}`);
        
        // Build REST API URL with proper encoding
        let restURL = `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`;
        
        // Add ServiceNow query with proper encoding to preserve & characters
        if (serviceNowQuery) {
            // Use encodeURIComponent to properly encode the entire query
            // This preserves internal & characters while making it URL-safe
            restURL += '?sysparm_query=' + encodeURIComponent(serviceNowQuery);
        }
        
        // Add REST API parameters
        const separator = serviceNowQuery ? '&' : '?';
        restURL += `${separator}JSONv2&sysparm_fields=number,severity,short_description,priority,sys_id,sys_updated_on,account,assigned_to,state,u_next_step_date_and_time,impact,category,opened_by,assignment_group,u_first_assignment_group,u_service_downtime_started,u_service_downtime_end,u_fault_cause,resolved_by,resolved_at,u_resolved,u_resolved_by,sys_mod_count`;
        
        console.log('Final REST API URL:', restURL);
        console.log('Query length:', serviceNowQuery.length, 'characters');
        return restURL;
    } catch (error) {
        console.error('Error processing URL:', error);
        return undefined;
    }
}

// Extract ServiceNow query from URL
export function extractServiceNowQuery(url) {
    try {
        // Handle both encoded and non-encoded URLs
        let workingUrl = url;
        
        // Decode URL first if it's encoded
        if (url.includes('%')) {
            workingUrl = progressiveDecode(url);
        }
        
        // Extract sysparm_query using multiple patterns
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
                // Additional decode if needed
                if (query.includes('%')) {
                    query = progressiveDecode(query);
                }
                return query;
            }
        }
        
        console.warn('Could not extract sysparm_query from URL');
        return '';
    } catch (error) {
        console.error('Error extracting ServiceNow query:', error);
        return '';
    }
}

// Parse encoded query into individual conditions
export function parseEncodedQuery(query) {
    const conditions = [];
    
    // Split by ^ operators (ServiceNow encoded query format)
    const parts = query.split('^');
    let currentCondition = {};
    
    for (let i = 0; i < parts.length; i++) {
        const part = parts[i].trim();
        
        if (part === '') continue;
        
        // Handle operator prefixes
        if (part.startsWith('OR') || part.startsWith('NQ')) {
            // New query block
            if (Object.keys(currentCondition).length > 0) {
                conditions.push({...currentCondition});
                currentCondition = {};
            }
            continue;
        }
        
        // Parse field=value pairs
        const fieldMatch = part.match(/^([^=!=!]+)(=|!=|!|LIKE|STARTSWITH|ENDSWITH)(.+)$/);
        if (fieldMatch) {
            const [, field, operator, value] = fieldMatch;
            
            currentCondition[field] = {
                operator: operator,
                value: decodeValue(value),
                displayValue: getDisplayValue(field, value)
            };
        }
    }
    
    // Add last condition if exists
    if (Object.keys(currentCondition).length > 0) {
        conditions.push(currentCondition);
    }
    
    return conditions;
}

// Decode URL-encoded values
function decodeValue(value) {
    try {
        return decodeURIComponent(value);
    } catch (e) {
        return value; // Return original if decode fails
    }
}

// Get display value for choice fields
function getDisplayValue(field, value) {
    // Handle choice fields (state, priority, etc.)
    const choiceMappings = {
        // Incident states
        '1': 'New',
        '2': 'In Progress', 
        '3': 'On Hold',
        '6': 'Resolved',
        '7': 'Closed',
        '8': 'Canceled',
        
        // Priority levels
        '1': 'Critical',
        '2': 'High',
        '3': 'Medium',
        '4': 'Low',
        '5': 'Planning'
    };
    
    if (choiceMappings[value]) {
        return choiceMappings[value];
    }
    
    // Handle sys_id references
    if (field.includes('_id') && value.length === 32) {
        return `[Sys ID: ${value}]`;
    }
    
    return value;
}

// Build human-readable summary
export function buildQuerySummary(conditions) {
    const summary = {
        totalConditions: conditions.length,
        activeConditions: 0,
        resolvedConditions: 0,
        priority: null,
        states: [],
        fields: []
    };
    
    conditions.forEach(condition => {
        Object.entries(condition).forEach(([field, config]) => {
            summary.fields.push(field);
            
            // Count active vs resolved
            if (field === 'state' && config.displayValue === 'Resolved') {
                summary.resolvedConditions++;
            } else if (field === 'state' && config.displayValue !== 'Resolved') {
                summary.activeConditions++;
            }
            
            // Extract priority
            if (field === 'priority') {
                summary.priority = config.displayValue;
            }
            
            // Extract states
            if (field === 'state') {
                summary.states.push(config.displayValue);
            }
        });
    });
    
    return summary;
}

// URL validation function
export function validateURL(url) {
    if (!url || typeof url !== 'string') return false;
    try {
        const urlObj = new URL(url);
        return urlObj.protocol === 'https:' && urlObj.hostname.includes('service-now.com');
    } catch {
        return false;
    }
}
