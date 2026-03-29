/**
 * Home Page Script - Professional ServiceNow Extension
 * Refactored with modular architecture for maintainability
 */

import { NavigationManager } from './components/index.js';
import { Logger } from '../modules/logger.js';

export class HomeUI {
    constructor() {
        this.navigationManager = null;
        this.headerManager = null;
        this.dashboardManager = null;
        this.configurationManager = null;
        this.audioManager = null;
        this.monitoringManager = null;
        this.uiManager = null;
        this.currentPage = 'dashboard';
        this.init();
    }

    async init() {
        this.initializeComponents();
        this.setupEventListeners();
        await this.loadInitialData();
        this.startRealTimeUpdates();
        this.updateUI();
    }

    initializeComponents() {
        // Initialize all component managers
        this.navigationManager = new NavigationManager();
        this.headerManager = new HeaderManager();
        this.dashboardManager = new DashboardManager();
        this.configurationManager = new ConfigurationManager();
        this.audioManager = new AudioManager();
        this.monitoringManager = new MonitoringManager();
        this.uiManager = new UIManager();
    }

    setupEventListeners() {
        // Listen for component events
        this.setupComponentEventListeners();
    }

    setupComponentEventListeners() {
        // Navigation events
        document.addEventListener('pageChange', (e) => {
            this.handlePageChange(e.detail.page);
        });

        // Header events
        document.addEventListener('toggleMonitoring', (e) => {
            this.handleToggleMonitoring(e.detail.isMonitoring);
        });

        // Dashboard events
        document.addEventListener('refreshQueues', (e) => {
            this.handleRefreshQueues();
        });

        document.addEventListener('ticketUpdate', (e) => {
            this.handleTicketUpdate(e.detail);
        });

        // Configuration events
        document.addEventListener('configUpdate', (e) => {
            this.handleConfigUpdate(e.detail);
        });

        // Audio events
        document.addEventListener('audioUpdate', (e) => {
            this.handleAudioUpdate(e.detail);
        });

        // Monitoring events
        document.addEventListener('monitoringUpdate', (e) => {
            this.handleMonitoringUpdate(e.detail);
        });

        // Global UI events
        document.addEventListener('showLoading', (e) => {
            this.uiManager.showLoading(e.detail.show);
        });

        document.addEventListener('showToast', (e) => {
            this.uiManager.showToast(e.detail.message, e.detail.type);
        });
    }

    async loadInitialData() {
        try {
            // Load all configuration data
            await Promise.all([
                this.configurationManager.loadConfiguration(),
                this.monitoringManager.loadMonitoringSettings(),
                this.audioManager.loadAudioSettings(),
                this.audioManager.loadCustomAudioFiles()
            ]);
            
            // Load monitoring state
            const result = await chrome.storage.local.get(['isMonitoring', 'lastTicketCounts', 'lastPollAt']);
            const isMonitoring = result.isMonitoring || false;
            
            // Update UI
            this.headerManager.setMonitoringState(isMonitoring);
            this.dashboardManager.updateTicketCounts(
                result.lastTicketCounts?.queueACount || 0,
                result.lastTicketCounts?.queueBCount || 0,
                result.lastTicketCounts?.totalCount || 0
            );
            this.dashboardManager.updateRecentTickets([]);
            this.updateLastPollTime();
            
        } catch (error) {
            Logger.error(`Failed to load initial data: ${error.message}`);
            this.uiManager.showToast('Failed to load initial data', 'error');
        }
    }

    async handlePageChange(pageName) {
        this.currentPage = pageName;
        
        // Load page-specific data
        switch (pageName) {
            case 'sound':
                await Promise.all([
                    this.audioManager.loadAudioSettings(),
                    this.audioManager.loadCustomAudioFiles()
                ]);
                break;
            case 'monitoring':
                await this.monitoringManager.loadMonitoringSettings();
                break;
            case 'configuration':
                await this.configurationManager.loadConfiguration();
                break;
        }
    }

    handleToggleMonitoring(isMonitoring) {
        this.monitoringManager.setMonitoringState(isMonitoring);
    }

    handleRefreshQueues() {
        this.uiManager.showToast('Refreshing queue data...', 'info');
        chrome.runtime.sendMessage({ type: 'REQUEST_TICKET_DATA' });
    }

    handleTicketUpdate(updateData) {
        switch (updateData.type) {
            case 'counts':
                this.dashboardManager.updateTicketCounts(
                    updateData.data.queueACount,
                    updateData.data.queueBCount,
                    updateData.data.totalCount
                );
                break;
            case 'tickets':
                this.dashboardManager.updateRecentTickets(updateData.data);
                break;
        }
    }

    handleConfigUpdate(updateData) {
        switch (updateData.type) {
            case 'saved':
                this.uiManager.showToast('Configuration saved successfully!', 'success');
                chrome.runtime.sendMessage({ type: 'SNOW_AUDIO_ALERT_OPTIONS_UPDATED' });
                break;
            case 'testing':
                this.uiManager.showToast('Testing configuration...', 'info');
                setTimeout(() => {
                    this.uiManager.showToast('Configuration test completed', 'success');
                }, 2000);
                break;
            case 'tested':
                this.uiManager.showToast('Configuration test completed', 'success');
                break;
            case 'error':
                this.uiManager.showToast(updateData.message || 'Configuration error', 'error');
                break;
        }
    }

    handleAudioUpdate(updateData) {
        switch (updateData.type) {
            case 'uploading':
                this.uiManager.showLoading(true);
                break;
            case 'upload-success':
                this.uiManager.showToast(`Audio uploaded successfully: ${updateData.audio.name}`, 'success');
                this.audioManager.loadCustomAudioFiles();
                break;
            case 'testing':
                this.uiManager.showLoading(true);
                break;
            case 'test-success':
                this.uiManager.showToast('Audio test completed', 'success');
                break;
            case 'deleting':
                this.uiManager.showLoading(true);
                break;
            case 'delete-success':
                this.uiManager.showToast('Audio file deleted successfully', 'success');
                this.audioManager.loadCustomAudioFiles();
                break;
            case 'selected':
                this.uiManager.showToast('Custom audio selected', 'success');
                break;
            case 'saving':
                this.uiManager.showLoading(true);
                break;
            case 'save-success':
                this.uiManager.showToast('Audio settings saved successfully!', 'success');
                break;
            case 'reset-success':
                this.uiManager.showToast('Settings reset to defaults', 'success');
                break;
            case 'error':
                this.uiManager.showToast(updateData.message || 'Audio operation failed', 'error');
                break;
        }

        if (['uploading', 'testing', 'deleting', 'saving'].includes(updateData.type)) {
            this.uiManager.showLoading(false);
        }
    }

    handleMonitoringUpdate(updateData) {
        switch (updateData.type) {
            case 'saved':
                this.uiManager.showToast('Monitoring settings saved successfully!', 'success');
                this.headerManager.setMonitoringState(updateData.settings.disablePoll !== 'on');
                chrome.runtime.sendMessage({ type: 'SNOW_AUDIO_ALERT_OPTIONS_UPDATED' });
                break;
            case 'error':
                this.uiManager.showToast(updateData.message || 'Monitoring settings error', 'error');
                break;
            case 'status-change':
                this.headerManager.setMonitoringState(updateData.isActive);
                break;
        }
    }

    startRealTimeUpdates() {
        // Listen for updates from background script
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message && message.type === 'TICKET_UPDATE') {
                this.handleTicketUpdate({
                    type: 'counts',
                    data: {
                        queueACount: message.queueACount || 0,
                        queueBCount: message.queueBCount || 0,
                        totalCount: message.totalCount || 0
                    }
                });
                this.handleTicketUpdate({
                    type: 'tickets',
                    data: message.tickets || []
                });
                this.updateLastPollTime();
                this.startCountdownTimer(); // Reset countdown
            }
        });
        
        // Request initial data
        chrome.runtime.sendMessage({ type: 'REQUEST_TICKET_DATA' });
    }

    updateLastPollTime() {
        chrome.storage.local.get(['lastPollAt'], (result) => {
            const lastPollElements = ['lastPollTime', 'lastPollAt'];
            lastPollElements.forEach(elementId => {
                const element = document.getElementById(elementId);
                if (element) {
                    if (result.lastPollAt) {
                        const pollDate = new Date(result.lastPollAt);
                        element.textContent = pollDate.toLocaleString();
                    } else {
                        element.textContent = 'Never';
                    }
                }
            });
        });
    }

    startCountdownTimer() {
        // This would be implemented based on monitoring state
        // For now, let the monitoring manager handle this
        this.monitoringManager.getMonitoringState();
    }

    updateUI() {
        // Initial UI updates
        this.headerManager.setMonitoringState(false);
    }
}

// Initialize home UI when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new HomeUI();
});
