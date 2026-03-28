/**
 * Logger Module
 * Provides production-ready logging with environment detection
 * Reduces console noise in production while maintaining debug capabilities
 */

export class Logger {
    
    /**
     * Determines if extension is running in production mode
     * @returns {boolean} - True if in production environment
     */
    static isProduction() {
        // Check manifest for debug flag or environment
        const manifest = chrome.runtime.getManifest();
        return !manifest.debug_mode && !manifest.name.includes('(Dev)');
    }
    
    /**
     * Main logging function with environment-based filtering
     * @param {string} message - Log message
     * @param {string} level - Log level (debug, info, warn, error, critical)
     */
    static log(message, level = 'info') {
        const timestamp = new Date().toISOString();
        const formattedMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
        
        if (this.isProduction()) {
            // Production: Only log warnings and errors
            if (level === 'error' || level === 'critical' || level === 'warn') {
                console.error(formattedMessage);
                
                // Store critical errors for debugging
                if (level === 'critical') {
                    this.storeError(message, level);
                }
            }
        } else {
            // Development: Full logging with all levels
            switch (level) {
                case 'debug':
                    console.debug(formattedMessage);
                    break;
                case 'info':
                    console.info(formattedMessage);
                    break;
                case 'warn':
                    console.warn(formattedMessage);
                    break;
                case 'error':
                case 'critical':
                    console.error(formattedMessage);
                    break;
                default:
                    console.log(formattedMessage);
            }
        }
    }
    
    /**
     * Stores critical errors for debugging purposes
     * @param {string} message - Error message
     * @param {string} level - Error level
     */
    static async storeError(message, level) {
        try {
            const errorLog = {
                message: message,
                level: level,
                timestamp: new Date().toISOString(),
                userAgent: navigator.userAgent,
                extensionVersion: chrome.runtime.getManifest().version
            };
            
            // Store last 10 errors only
            const { errorLogs = [] } = await chrome.storage.local.get('errorLogs');
            errorLogs.push(errorLog);
            
            if (errorLogs.length > 10) {
                errorLogs.shift(); // Remove oldest error
            }
            
            await chrome.storage.local.set({ errorLogs });
            
        } catch (error) {
            console.error('Failed to store error log:', error);
        }
    }
    
    /**
     * Convenience methods for different log levels
     */
    static debug(message) {
        this.log(message, 'debug');
    }
    
    static info(message) {
        this.log(message, 'info');
    }
    
    static warn(message) {
        this.log(message, 'warn');
    }
    
    static error(message) {
        this.log(message, 'error');
    }
    
    static critical(message) {
        this.log(message, 'critical');
    }
    
    /**
     * Logs API calls with performance tracking
     * @param {string} apiCall - API endpoint
     * @param {number} duration - Call duration in milliseconds
     * @param {boolean} success - Whether call was successful
     */
    static apiCall(apiCall, duration, success) {
        const status = success ? 'SUCCESS' : 'FAILED';
        const message = `API Call: ${apiCall} (${duration}ms) - ${status}`;
        
        if (success) {
            this.info(message);
        } else {
            this.error(message);
        }
    }
    
    /**
     * Logs user interactions for analytics
     * @param {string} action - User action
     * @param {object} context - Additional context
     */
    static userAction(action, context = {}) {
        const message = `User Action: ${action} - ${JSON.stringify(context)}`;
        this.debug(message);
    }
    
    /**
     * Gets stored error logs for debugging
     * @returns {Promise<Array>} - Array of error logs
     */
    static async getErrorLogs() {
        try {
            const { errorLogs = [] } = await chrome.storage.local.get('errorLogs');
            return errorLogs;
        } catch (error) {
            this.error('Failed to retrieve error logs:', error);
            return [];
        }
    }
    
    /**
     * Clears stored error logs
     */
    static async clearErrorLogs() {
        try {
            await chrome.storage.local.remove('errorLogs');
            this.info('Error logs cleared');
        } catch (error) {
            this.error('Failed to clear error logs:', error);
        }
    }
}
