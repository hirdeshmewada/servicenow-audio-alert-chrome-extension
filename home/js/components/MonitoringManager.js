/**
 * Monitoring Manager Component
 * Handles monitoring controls and settings
 */

export class MonitoringManager {
    constructor() {
        this.elements = {};
        this.isMonitoring = false;
        this.currentPollInterval = 5;
        this.init();
    }

    init() {
        this.setupElements();
        this.setupEventListeners();
    }

    setupElements() {
        this.elements = {
            // Toggle controls
            disableAlarm: document.getElementById('disableAlarm'),
            disablePoll: document.getElementById('disablePoll'),
            // Radio buttons
            alertConditions: document.querySelectorAll('input[name="alertCondition"]'),
            // Poll interval
            pollInterval: document.getElementById('pollInterval'),
            // Test buttons
            testAudioBtn: document.getElementById('testAudioBtn'),
            testNotificationBtn: document.getElementById('testNotificationBtn')
        };
    }

    setupEventListeners() {
        // Toggle controls
        if (this.elements.disableAlarm) {
            this.elements.disableAlarm.addEventListener('change', () => this.saveMonitoringSettings());
        }
        
        if (this.elements.disablePoll) {
            this.elements.disablePoll.addEventListener('change', () => this.saveMonitoringSettings());
        }
        
        // Radio buttons
        this.elements.alertConditions.forEach(radio => {
            radio.addEventListener('change', () => this.saveMonitoringSettings());
        });
        
        // Poll interval
        if (this.elements.pollInterval) {
            this.elements.pollInterval.addEventListener('change', () => {
                this.saveMonitoringSettings();
                this.updatePollInterval();
            });
        }
        
        // Test buttons
        if (this.elements.testAudioBtn) {
            this.elements.testAudioBtn.addEventListener('click', () => this.dispatchTestAudio());
        }
        
        if (this.elements.testNotificationBtn) {
            this.elements.testNotificationBtn.addEventListener('click', () => this.dispatchTestNotification());
        }
    }

    async loadMonitoringSettings() {
        try {
            const items = await chrome.storage.sync.get([
                'disableAlarm', 'disablePoll', 'pollInterval', 'alarmCondition'
            ]);
            
            // Update toggles
            if (this.elements.disableAlarm) {
                this.elements.disableAlarm.checked = items.disableAlarm === 'on';
            }
            
            if (this.elements.disablePoll) {
                this.elements.disablePoll.checked = items.disablePoll === 'on';
            }
            
            // Update poll interval
            if (this.elements.pollInterval) {
                const interval = parseInt(items.pollInterval) || 5;
                this.elements.pollInterval.value = interval;
                this.currentPollInterval = interval;
            }
            
            // Update alert condition
            const alertCondition = items.alarmCondition || 'nonZeroCount';
            const radio = document.querySelector(`input[name="alertCondition"][value="${alertCondition}"]`);
            if (radio) radio.checked = true;
            
            this.isMonitoring = items.disablePoll !== 'on';
            
        } catch (error) {
            this.dispatchMonitoringUpdate({
                type: 'error',
                message: 'Failed to load monitoring settings'
            });
        }
    }

    async saveMonitoringSettings() {
        try {
            const settings = {
                disableAlarm: this.elements.disableAlarm?.checked ? 'on' : 'off',
                disablePoll: this.elements.disablePoll?.checked ? 'on' : 'off',
                pollInterval: parseInt(this.elements.pollInterval?.value) || 5,
                alarmCondition: this.elements.alertConditions?.length > 0 ? 
                    document.querySelector("input[name='alertCondition']:checked")?.value : 'nonZeroCount'
            };

            await chrome.storage.sync.set(settings);
            
            this.isMonitoring = settings.disablePoll !== 'on';
            
            this.dispatchMonitoringUpdate({
                type: 'saved',
                settings: settings
            });
            
        } catch (error) {
            this.dispatchMonitoringUpdate({
                type: 'error',
                message: 'Failed to save monitoring settings'
            });
        }
    }

    updatePollInterval() {
        if (this.elements.pollInterval) {
            this.currentPollInterval = parseInt(this.elements.pollInterval.value) || 5;
        }
    }

    dispatchTestAudio() {
        const event = new CustomEvent('testAudio', {
            detail: { timestamp: Date.now() }
        });
        document.dispatchEvent(event);
    }

    dispatchTestNotification() {
        const event = new CustomEvent('testNotification', {
            detail: { 
                ticketNumber: "INC0012345",
                ticketDescription: "This is a test notification to verify notification system is working properly.",
                severity: "3"
            }
        });
        document.dispatchEvent(event);
    }

    dispatchMonitoringUpdate(updateData) {
        const event = new CustomEvent('monitoringUpdate', {
            detail: updateData
        });
        document.dispatchEvent(event);
    }

    getMonitoringState() {
        return {
            isMonitoring: this.isMonitoring,
            currentPollInterval: this.currentPollInterval,
            settings: {
                disableAlarm: this.elements.disableAlarm?.checked,
                disablePoll: this.elements.disablePoll?.checked,
                pollInterval: parseInt(this.elements.pollInterval?.value) || 5,
                alarmCondition: this.elements.alertConditions?.length > 0 ? 
                    document.querySelector("input[name='alertCondition']:checked")?.value : 'nonZeroCount'
            }
        };
    }

    setMonitoringState(isActive) {
        this.isMonitoring = isActive;
        this.dispatchMonitoringUpdate({
            type: 'status-change',
            isActive: isActive
        });
    }
}
