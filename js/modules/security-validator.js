/**
 * Security Validator Module
 * Provides input sanitization and validation for ServiceNow extension
 * Critical security component to prevent malicious inputs
 */

export class SecurityValidator {
    
    /**
     * Validates and sanitizes ServiceNow instance URLs
     * @param {string} url - Raw ServiceNow URL from user input
     * @returns {string} - Sanitized and validated URL
     * @throws {Error} - If URL is invalid or unauthorized
     */
    static sanitizeServiceNowURL(url) {
        // Input validation
        if (!url || typeof url !== 'string') {
            throw new Error('Invalid URL input: URL must be a non-empty string');
        }
        
        // Remove dangerous characters and whitespace
        const cleanUrl = url.trim().replace(/[<>'"&]/g, '');
        
        // Validate ServiceNow domain pattern
        const servicenowRegex = /^https:\/\/[a-zA-Z0-9.-]+\.service-now\.com/;
        const servicenowChinaRegex = /^https:\/\/[a-zA-Z0-9.-]+\.service-now\.com\.cn/;
        
        if (!servicenowRegex.test(cleanUrl) && !servicenowChinaRegex.test(cleanUrl)) {
            throw new Error('Unauthorized ServiceNow instance: Only *.service-now.com domains are allowed');
        }
        
        // Ensure HTTPS
        if (!cleanUrl.startsWith('https://')) {
            throw new Error('Security requirement: Only HTTPS connections are allowed');
        }
        
        return cleanUrl;
    }
    
    /**
     * Sanitizes ticket numbers to prevent injection
     * @param {string} ticketNumber - Raw ticket number
     * @returns {string} - Sanitized ticket number
     */
    static sanitizeTicketNumber(ticketNumber) {
        if (!ticketNumber || typeof ticketNumber !== 'string') {
            return '';
        }
        
        // Allow only alphanumeric characters, hyphen, and underscore
        return ticketNumber.replace(/[^a-zA-Z0-9\-_]/g, '').substring(0, 50);
    }
    
    /**
     * Sanitizes notification text to prevent XSS attacks
     * @param {string} text - Raw notification text
     * @returns {string} - Sanitized safe text
     */
    static sanitizeNotificationText(text) {
        if (!text || typeof text !== 'string') {
            return '';
        }
        
        // Remove HTML tags and dangerous content
        let cleanText = text
            .replace(/<script[^>]*>.*?<\/script>/gi, '') // Remove scripts
            .replace(/<[^>]*>/g, '') // Remove HTML tags
            .replace(/javascript:/gi, '') // Remove javascript protocol
            .replace(/on\w+\s*=/gi, ''); // Remove event handlers
        
        // Limit length to prevent abuse
        return cleanText.substring(0, 200);
    }
    
    /**
     * Validates queue URLs for safe navigation
     * @param {string} queueUrl - Queue URL to validate
     * @returns {boolean} - True if URL is safe
     */
    static isSafeQueueURL(queueUrl) {
        if (!queueUrl || typeof queueUrl !== 'string') {
            return false;
        }
        
        try {
            const url = new URL(queueUrl);
            
            // Only allow ServiceNow domains
            const allowedDomains = ['service-now.com', 'service-now.com.cn'];
            return allowedDomains.some(domain => url.hostname.includes(domain));
            
        } catch (error) {
            return false;
        }
    }
    
    /**
     * Validates file uploads for audio files
     * @param {File} file - File object from upload
     * @returns {boolean} - True if file is safe
     */
    static isValidAudioFile(file) {
        if (!file || !(file instanceof File)) {
            return false;
        }
        
        // Check file type
        const allowedTypes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/wave'];
        if (!allowedTypes.includes(file.type)) {
            return false;
        }
        
        // Check file size (5MB limit)
        const maxSize = 5 * 1024 * 1024;
        if (file.size > maxSize) {
            return false;
        }
        
        return true;
    }
}
