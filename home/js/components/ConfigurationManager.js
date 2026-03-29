/**
 * Configuration Manager Component
 * Handles configuration page functionality
 */

export class ConfigurationManager {
    constructor() {
        this.fields = {};
        this.saveBtn = null;
        this.testBtn = null;
        this.init();
    }

    init() {
        this.setupElements();
        this.setupEventListeners();
    }

    setupElements() {
        this.fields = {
            rootUrl: document.getElementById('rootUrl'),
            primaryQueue: document.getElementById('primaryQueue'),
            secondaryQueue: document.getElementById('secondaryQueue'),
            primaryNotificationText: document.getElementById('primaryNotificationText'),
            secondaryNotificationText: document.getElementById('secondaryNotificationText'),
            badgeDisplay: document.getElementById('badgeDisplay')
        };
        
        this.saveBtn = document.getElementById('saveConfig');
        this.testBtn = document.getElementById('testConfig');
    }

    setupEventListeners() {
        // Auto-save on field change
        Object.values(this.fields).forEach(field => {
            if (field) {
                field.addEventListener('change', () => this.saveConfiguration());
            }
        });

        if (this.saveBtn) {
            this.saveBtn.addEventListener('click', () => this.saveConfiguration());
        }

        if (this.testBtn) {
            this.testBtn.addEventListener('click', () => this.testConfiguration());
        }
    }

    loadConfiguration(config) {
        Object.entries(config).forEach(([fieldId, value]) => {
            const field = this.fields[fieldId];
            if (field) field.value = value;
        });
    }

    getConfiguration() {
        return {
            rooturl: this.fields.rootUrl?.value?.trim() || '',
            primary: this.fields.primaryQueue?.value?.trim() || '',
            secondary: this.fields.secondaryQueue?.value?.trim() || '',
            primaryNotificationText: this.fields.primaryNotificationText?.value?.trim() || 'New tickets in Queue 1',
            secondaryNotificationText: this.fields.secondaryNotificationText?.value?.trim() || 'New tickets in Queue 2',
            splitcount: this.fields.badgeDisplay?.value || 'false'
        };
    }

    validateConfiguration() {
        const config = this.getConfiguration();
        const errors = [];

        // Validate URLs
        if (config.primary && !this.validateServiceNowURL(config.primary)) {
            errors.push('Primary URL must be a valid ServiceNow HTTPS URL');
        }
        
        if (config.secondary && !this.validateServiceNowURL(config.secondary)) {
            errors.push('Secondary URL must be a valid ServiceNow HTTPS URL');
        }
        
        if (config.rooturl && !this.validateServiceNowURL(config.rooturl)) {
            errors.push('Base URL must be a valid ServiceNow HTTPS URL');
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    validateServiceNowURL(url) {
        if (!url || typeof url !== 'string') return false;
        try {
            const urlObj = new URL(url);
            return urlObj.protocol === 'https:' && urlObj.hostname.includes('service-now.com');
        } catch (error) {
            return false;
        }
    }

    async saveConfiguration() {
        const validation = this.validateConfiguration();
        if (!validation.isValid) {
            this.dispatchConfigUpdate({
                type: 'error',
                errors: validation.errors
            });
            return false;
        }

        try {
            const config = this.getConfiguration();
            await chrome.storage.sync.set(config);
            
            this.dispatchConfigUpdate({
                type: 'saved',
                config: config
            });
            
            return true;
        } catch (error) {
            this.dispatchConfigUpdate({
                type: 'error',
                errors: ['Failed to save configuration']
            });
            return false;
        }
    }

    async testConfiguration() {
        this.dispatchConfigUpdate({
            type: 'testing'
        });
        
        // Simulate testing
        setTimeout(() => {
            this.dispatchConfigUpdate({
                type: 'tested'
            });
        }, 2000);
    }

    dispatchConfigUpdate(updateData) {
        const event = new CustomEvent('configUpdate', {
            detail: updateData
        });
        document.dispatchEvent(event);
    }
}
