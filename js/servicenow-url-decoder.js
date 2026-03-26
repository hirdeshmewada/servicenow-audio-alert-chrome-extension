/**
 * ServiceNow URL Decoder - Based on Official Documentation
 * Handles encoded queries, sys_id references, and complex filters
 * 
 * Key Resources:
 * - https://docs.servicenow.com/bundle/sandiego-platform-user-interface/page/use/using-lists/concept/c_EncodedQueryStrings.html
 * - https://sn-nerd.com/2019/05/04/decoding-encoded-queries/
 * - ServiceNow Community Forums
 */

class ServiceNowURLDecoder {
    constructor() {
        this.choiceMappings = {
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
            '5': 'Planning',
            
            // Common field types
            'active': 'true',
            'inactive': 'false'
        };
        
        this.operators = {
            '^': 'AND',
            '^OR': 'OR',
            '^NQ': 'NEW QUERY',
            '=': 'EQUALS',
            '!=': 'NOT EQUALS',
            'LIKE': 'CONTAINS',
            'STARTSWITH': 'STARTS WITH',
            'ENDSWITH': 'ENDS WITH'
        };
    }

    /**
     * Main decoder function - handles all ServiceNow URL formats
     */
    decodeServiceNowURL(url) {
        console.log('=== SERVICENOW URL DECODER ===');
        console.log('Input URL:', url);
        
        try {
            // Handle new UI URLs with multiple encoding
            let processedUrl = url;
            if (url.includes('/now/nav/ui/classic/params/target/')) {
                processedUrl = this.extractFromNewUI(url);
            }
            
            // Extract and decode query
            const query = this.extractServiceNowQuery(processedUrl);
            console.log('Extracted query:', query);
            
            // Parse the encoded query
            const parsedQuery = this.parseEncodedQuery(query);
            console.log('Parsed query:', parsedQuery);
            
            // Build readable summary
            const summary = this.buildQuerySummary(parsedQuery);
            console.log('Query summary:', summary);
            
            return {
                originalUrl: url,
                extractedQuery: query,
                parsedConditions: parsedQuery,
                readableSummary: summary,
                restAPIUrl: this.buildRESTAPIUrl(processedUrl, query)
            };
            
        } catch (error) {
            console.error('Error decoding ServiceNow URL:', error);
            return null;
        }
    }

    /**
     * Extract target URL from new ServiceNow UI format
     */
    extractFromNewUI(url) {
        console.log('Extracting from new UI format...');
        
        const targetMatch = url.match(/params\/target\/(.+)$/);
        if (!targetMatch) {
            throw new Error('Invalid new UI URL format');
        }
        
        let targetUrl = targetMatch[1];
        
        // Progressive decoding - handle multiple levels
        let decoded = targetUrl;
        let decodeCount = 0;
        const maxDecodes = 5;
        
        do {
            const previous = decoded;
            try {
                decoded = decodeURIComponent(decoded);
                decodeCount++;
            } catch (e) {
                console.log(`Decoding failed at iteration ${decodeCount}:`, e.message);
                break;
            }
        } while (decoded !== previous && decodeCount < maxDecodes);
        
        console.log(`Decoded in ${decodeCount} iterations`);
        
        // Rebuild full URL
        const urlMatch = url.match(/(https:\/\/[^\/]+)/);
        if (!urlMatch) {
            throw new Error('Cannot extract base URL');
        }
        
        return urlMatch[1] + '/' + decoded;
    }

    /**
     * Extract sysparm_query from various URL formats
     */
    extractServiceNowQuery(url) {
        const patterns = [
            /sysparm_query=([^&]*)/,
            /sysparm_query%3D([^&]*)/,
            /sysparm_query%253D([^&]*)/,
            /[?&]sysparm_query=([^&]*)/
        ];
        
        for (const pattern of patterns) {
            const match = url.match(pattern);
            if (match) {
                let query = match[1];
                
                // Additional decode if needed
                if (query.includes('%')) {
                    query = this.progressiveDecode(query);
                }
                
                return query;
            }
        }
        
        throw new Error('sysparm_query not found in URL');
    }

    /**
     * Parse encoded query into individual conditions
     */
    parseEncodedQuery(query) {
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
                    operator: this.operators[operator] || operator,
                    value: this.decodeValue(value),
                    displayValue: this.getDisplayValue(field, value)
                };
            }
        }
        
        // Add last condition if exists
        if (Object.keys(currentCondition).length > 0) {
            conditions.push(currentCondition);
        }
        
        return conditions;
    }

    /**
     * Decode URL-encoded values
     */
    decodeValue(value) {
        try {
            return decodeURIComponent(value);
        } catch (e) {
            return value; // Return original if decode fails
        }
    }

    /**
     * Get display value for choice fields
     */
    getDisplayValue(field, value) {
        // Handle choice fields (state, priority, etc.)
        if (this.choiceMappings[value]) {
            return this.choiceMappings[value];
        }
        
        // Handle sys_id references
        if (field.includes('_id') && value.length === 32) {
            return `[Sys ID: ${value}]`;
        }
        
        return value;
    }

    /**
     * Build human-readable summary
     */
    buildQuerySummary(conditions) {
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

    /**
     * Build REST API URL with proper encoding
     */
    buildRESTAPIUrl(originalUrl, query) {
        try {
            const urlObj = new URL(originalUrl);
            
            // Build base REST URL
            let restUrl = `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`;
            
            // Add encoded query
            restUrl += '?sysparm_query=' + encodeURIComponent(query);
            
            // Add display values and fields
            restUrl += '&sysparm_display_value=true';
            restUrl += '&sysparm_fields=number,severity,short_description,priority,sys_id,sys_updated_on,account,assigned_to,state,u_next_step_date_and_time,impact,category,opened_by,assignment_group,u_first_assignment_group,u_service_downtime_started,u_service_downtime_end,u_fault_cause,resolved_by,resolved_at,u_resolved,u_resolved_by,sys_mod_count';
            
            return restUrl;
            
        } catch (error) {
            console.error('Error building REST API URL:', error);
            return null;
        }
    }

    /**
     * Progressive decoding with safety checks
     */
    progressiveDecode(encodedString) {
        let decoded = encodedString;
        let previous;
        let count = 0;
        const maxIterations = 5;
        
        do {
            previous = decoded;
            try {
                decoded = decodeURIComponent(decoded);
                count++;
            } catch (e) {
                console.log(`Decode iteration ${count} failed:`, e.message);
                break;
            }
        } while (decoded !== previous && count < maxIterations);
        
        return decoded;
    }

    /**
     * Validate ServiceNow URL format
     */
    validateServiceNowURL(url) {
        try {
            const urlObj = new URL(url);
            return urlObj.hostname.includes('service-now.com');
        } catch {
            return false;
        }
    }
}

// Export for use in background.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ServiceNowURLDecoder;
} else if (typeof window !== 'undefined') {
    window.ServiceNowURLDecoder = ServiceNowURLDecoder;
}
