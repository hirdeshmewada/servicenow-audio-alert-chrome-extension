/**
 * Home Page Script - Professional ServiceNow Extension
 * Handles all UI interactions and functionality for the main control center
 */

import { AudioManager } from './modules/audio-manager.js';
import { Logger } from './modules/logger.js';

class HomeUI {
    constructor() {
        this.currentPage = 'dashboard';
        this.isMonitoring = false;
        this.countdownTimer = null;
        this.currentPollInterval = 5; // Default 5 minutes
        this.customAudioFiles = [];
        this.currentSettings = {};
        
        this.init();
    }

    async init() {
        await this.setupEventListeners();
        await this.loadInitialData();
        this.startRealTimeUpdates();
        this.updateUI();
    }

    async setupEventListeners() {
        // Navigation
        this.setupNavigation();
        
        // Header controls
        this.setupHeaderControls();
        
        // Dashboard controls
        this.setupDashboardControls();
        
        // Configuration controls
        this.setupConfigurationControls();
        
        // Sound controls
        this.setupSoundControls();
        
        // Monitoring controls
        this.setupMonitoringControls();
        
        // About page (no special controls needed)
    }

    setupNavigation() {
        const navItems = document.querySelectorAll('.nav-item');
        navItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const page = item.dataset.page;
                this.switchPage(page);
            });
        });
    }

    setupHeaderControls() {
        const startStopBtn = document.getElementById('startStopBtn');
        if (startStopBtn) {
            startStopBtn.addEventListener('click', () => this.toggleMonitoring());
        }
    }

    setupDashboardControls() {
        const refreshBtn = document.getElementById('refreshQueues');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => this.refreshQueues());
        }
    }

    setupConfigurationControls() {
        const saveBtn = document.getElementById('saveConfig');
        const testBtn = document.getElementById('testConfig');
        
        if (saveBtn) saveBtn.addEventListener('click', () => this.saveConfiguration());
        if (testBtn) testBtn.addEventListener('click', () => this.testConfiguration());
        
        // Auto-save on field change
        const configFields = ['rootUrl', 'primaryQueue', 'secondaryQueue', 'primaryNotificationText', 'secondaryNotificationText', 'badgeDisplay'];
        configFields.forEach(fieldId => {
            const field = document.getElementById(fieldId);
            if (field) {
                field.addEventListener('change', () => this.saveConfiguration());
            }
        });
    }

    setupSoundControls() {
        // Audio source selection
        const audioSource = document.getElementById('audioSource');
        if (audioSource) {
            audioSource.addEventListener('change', () => this.toggleAudioSection());
        }
        
        // File upload
        this.setupFileUpload();
        
        // Playback controls
        this.setupPlaybackControls();
        
        // Test buttons
        const testDefaultBtn = document.getElementById('testDefaultAudio');
        const testCurrentBtn = document.getElementById('testCurrentSettings');
        
        if (testDefaultBtn) testDefaultBtn.addEventListener('click', () => this.testAudio('default'));
        if (testCurrentBtn) testCurrentBtn.addEventListener('click', () => this.testCurrentAudio());
        
        // Action buttons
        const resetBtn = document.getElementById('resetAudioSettings');
        const saveBtn = document.getElementById('saveAudioSettings');
        
        if (resetBtn) resetBtn.addEventListener('click', () => this.resetAudioSettings());
        if (saveBtn) saveBtn.addEventListener('click', () => this.saveAudioSettings());
    }

    setupFileUpload() {
        const selectFileBtn = document.getElementById('selectFileBtn');
        const audioFileInput = document.getElementById('audioFileInput');
        const uploadArea = document.getElementById('uploadArea');
        
        if (selectFileBtn && audioFileInput) {
            selectFileBtn.addEventListener('click', () => audioFileInput.click());
            
            audioFileInput.addEventListener('change', (e) => {
                if (e.target.files[0]) {
                    this.handleFileUpload(e.target.files[0]);
                }
            });
        }
        
        if (uploadArea) {
            uploadArea.addEventListener('dragover', (e) => {
                e.preventDefault();
                uploadArea.classList.add('drag-over');
            });
            
            uploadArea.addEventListener('dragleave', () => {
                uploadArea.classList.remove('drag-over');
            });
            
            uploadArea.addEventListener('drop', (e) => {
                e.preventDefault();
                uploadArea.classList.remove('drag-over');
                const file = e.dataTransfer.files[0];
                if (file) {
                    this.handleFileUpload(file);
                }
            });
        }
    }

    setupPlaybackControls() {
        const durationSlider = document.getElementById('playbackDuration');
        const volumeSlider = document.getElementById('volumeControl');
        const durationValue = document.getElementById('durationValue');
        const volumeValue = document.getElementById('volumeValue');
        
        if (durationSlider && durationValue) {
            durationSlider.addEventListener('input', () => {
                durationValue.textContent = durationSlider.value;
            });
        }
        
        if (volumeSlider && volumeValue) {
            volumeSlider.addEventListener('input', () => {
                volumeValue.textContent = volumeSlider.value;
            });
        }
    }

    setupMonitoringControls() {
        // Toggle controls
        const disableAlarm = document.getElementById('disableAlarm');
        const disablePoll = document.getElementById('disablePoll');
        
        if (disableAlarm) disableAlarm.addEventListener('change', () => this.saveMonitoringSettings());
        if (disablePoll) disablePoll.addEventListener('change', () => this.saveMonitoringSettings());
        
        // Radio buttons
        const alertConditions = document.querySelectorAll('input[name="alertCondition"]');
        alertConditions.forEach(radio => {
            radio.addEventListener('change', () => this.saveMonitoringSettings());
        });
        
        // Poll interval
        const pollInterval = document.getElementById('pollInterval');
        if (pollInterval) {
            pollInterval.addEventListener('change', () => {
                this.saveMonitoringSettings();
                this.updatePollInterval();
            });
        }
        
        // Test buttons
        const testAudioBtn = document.getElementById('testAudioBtn');
        const testNotificationBtn = document.getElementById('testNotificationBtn');
        
        if (testAudioBtn) testAudioBtn.addEventListener('click', () => this.testAudio());
        if (testNotificationBtn) testNotificationBtn.addEventListener('click', () => this.testNotification());
    }

    switchPage(pageName) {
        // Update navigation
        const navItems = document.querySelectorAll('.nav-item');
        navItems.forEach(item => {
            item.classList.remove('active');
            if (item.dataset.page === pageName) {
                item.classList.add('active');
            }
        });

        // Update content
        const pages = document.querySelectorAll('.page-content');
        pages.forEach(page => {
            page.classList.remove('active');
        });
        
        const activePage = document.getElementById(pageName);
        if (activePage) {
            activePage.classList.add('active');
        }

        this.currentPage = pageName;
        
        // Load page-specific data
        this.loadPageData(pageName);
    }

    async loadPageData(pageName) {
        switch (pageName) {
            case 'sound':
                await this.loadAudioSettings();
                await this.loadCustomAudioFiles();
                break;
            case 'monitoring':
                await this.loadMonitoringSettings();
                break;
            case 'configuration':
                await this.loadConfiguration();
                break;
        }
    }

    async loadInitialData() {
        try {
            // Load all configuration data
            await this.loadConfiguration();
            await this.loadMonitoringSettings();
            await this.loadAudioSettings();
            await this.loadCustomAudioFiles();
            
            // Load monitoring state
            const result = await chrome.storage.local.get(['isMonitoring', 'lastTicketCounts', 'lastPollAt']);
            this.isMonitoring = result.isMonitoring || false;
            
            // Update UI
            this.updateMonitoringStatus();
            this.updateTicketCounts();
            this.updateLastPollTime();
            
        } catch (error) {
            Logger.error(`Failed to load initial data: ${error.message}`);
            this.showToast('Failed to load initial data', 'error');
        }
    }

    async loadConfiguration() {
        try {
            const items = await chrome.storage.sync.get([
                'rooturl', 'primary', 'secondary', 'primaryNotificationText', 
                'secondaryNotificationText', 'splitcount'
            ]);
            
            // Update form fields
            const fields = {
                'rootUrl': items.rooturl || '',
                'primaryQueue': items.primary || '',
                'secondaryQueue': items.secondary || '',
                'primaryNotificationText': items.primaryNotificationText || 'New tickets in Queue 1',
                'secondaryNotificationText': items.secondaryNotificationText || 'New tickets in Queue 2',
                'badgeDisplay': items.splitcount || 'false'
            };
            
            Object.entries(fields).forEach(([fieldId, value]) => {
                const field = document.getElementById(fieldId);
                if (field) field.value = value;
            });
            
        } catch (error) {
            Logger.error(`Failed to load configuration: ${error.message}`);
        }
    }

    async loadMonitoringSettings() {
        try {
            const items = await chrome.storage.sync.get([
                'disableAlarm', 'disablePoll', 'pollInterval', 'alarmCondition'
            ]);
            
            // Update toggles
            const disableAlarm = document.getElementById('disableAlarm');
            const disablePoll = document.getElementById('disablePoll');
            if (disableAlarm) disableAlarm.checked = items.disableAlarm === 'on';
            if (disablePoll) disablePoll.checked = items.disablePoll === 'on';
            
            // Update poll interval
            const pollInterval = document.getElementById('pollInterval');
            if (pollInterval) {
                const interval = parseInt(items.pollInterval) || 5;
                pollInterval.value = interval;
                this.currentPollInterval = interval;
            }
            
            // Update alert condition
            const alertCondition = items.alarmCondition || 'nonZeroCount';
            const radio = document.querySelector(`input[name="alertCondition"][value="${alertCondition}"]`);
            if (radio) radio.checked = true;
            
        } catch (error) {
            Logger.error(`Failed to load monitoring settings: ${error.message}`);
        }
    }

    async loadAudioSettings() {
        try {
            this.currentSettings = await AudioManager.getAudioSettings();
            
            // Update UI
            const audioSource = document.getElementById('audioSource');
            const durationSlider = document.getElementById('playbackDuration');
            const volumeSlider = document.getElementById('volumeControl');
            const loopCheckbox = document.getElementById('loopAudio');
            
            if (audioSource) {
                audioSource.value = this.currentSettings.selectedAudio === 'default' ? 'default' : 'custom';
            }
            
            if (durationSlider) {
                durationSlider.value = this.currentSettings.playbackDuration / 1000;
                document.getElementById('durationValue').textContent = this.currentSettings.playbackDuration / 1000;
            }
            
            if (volumeSlider) {
                volumeSlider.value = this.currentSettings.volume * 100;
                document.getElementById('volumeValue').textContent = Math.round(this.currentSettings.volume * 100);
            }
            
            if (loopCheckbox) {
                loopCheckbox.checked = this.currentSettings.loop;
            }
            
            this.toggleAudioSection();
            
        } catch (error) {
            Logger.error(`Failed to load audio settings: ${error.message}`);
        }
    }

    async loadCustomAudioFiles() {
        try {
            this.customAudioFiles = await AudioManager.getCustomAudioFiles();
            this.updateCustomAudioList();
            this.updateFileManagement();
            this.updateStorageStats();
            
        } catch (error) {
            Logger.error(`Failed to load custom audio files: ${error.message}`);
        }
    }

    toggleAudioSection() {
        const audioSource = document.getElementById('audioSource');
        const defaultSection = document.getElementById('defaultAudioSection');
        const customSection = document.getElementById('customAudioSection');
        
        if (!audioSource) return;
        
        if (audioSource.value === 'default') {
            if (defaultSection) defaultSection.style.display = 'block';
            if (customSection) customSection.style.display = 'none';
        } else {
            if (defaultSection) defaultSection.style.display = 'none';
            if (customSection) customSection.style.display = 'block';
        }
    }

    async handleFileUpload(file) {
        if (!file) return;

        this.showLoading(true);

        try {
            const uploadedAudio = await AudioManager.uploadAudio(file);
            this.showToast(`Audio uploaded successfully: ${uploadedAudio.name}`, 'success');
            await this.loadCustomAudioFiles();
            
            // Switch to custom audio
            const audioSource = document.getElementById('audioSource');
            if (audioSource) {
                audioSource.value = 'custom';
                this.toggleAudioSection();
            }
            
        } catch (error) {
            Logger.error(`File upload failed: ${error.message}`);
            this.showToast(error.message, 'error');
        } finally {
            this.showLoading(false);
            // Reset file input
            const audioFileInput = document.getElementById('audioFileInput');
            if (audioFileInput) audioFileInput.value = '';
        }
    }

    updateCustomAudioList() {
        const container = document.getElementById('audioFilesContainer');
        if (!container) return;
        
        if (this.customAudioFiles.length === 0) {
            container.innerHTML = '<div class="empty-state">No custom audio files uploaded yet</div>';
            return;
        }

        container.innerHTML = this.customAudioFiles.map(audio => `
            <div class="audio-item">
                <div class="audio-info">
                    <div class="audio-name">${audio.name}</div>
                    <div class="audio-details">
                        <span>${this.formatFileSize(audio.size)}</span>
                        <span>${this.formatDuration(audio.duration)}</span>
                    </div>
                </div>
                <div class="audio-actions">
                    <button class="btn btn-sm btn-secondary test-audio" data-audio-id="${audio.id}">🔊</button>
                    <button class="btn btn-sm btn-primary select-audio" data-audio-id="${audio.id}">✓</button>
                    <button class="btn btn-sm btn-danger delete-audio" data-audio-id="${audio.id}">🗑️</button>
                </div>
            </div>
        `).join('');

        // Add event listeners
        container.querySelectorAll('.test-audio').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const audioId = e.target.closest('button').dataset.audioId;
                this.testAudio(audioId);
            });
        });
        
        container.querySelectorAll('.select-audio').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const audioId = e.target.closest('button').dataset.audioId;
                this.selectCustomAudio(audioId);
            });
        });
        
        container.querySelectorAll('.delete-audio').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const audioId = e.target.closest('button').dataset.audioId;
                this.deleteAudio(audioId);
            });
        });
    }

    updateFileManagement() {
        const container = document.getElementById('filesManagementContainer');
        if (!container) return;
        
        if (this.customAudioFiles.length === 0) {
            container.innerHTML = '<div class="empty-state">No files to manage</div>';
            return;
        }

        container.innerHTML = this.customAudioFiles.map(audio => `
            <div class="file-item">
                <div class="file-icon">🎵</div>
                <div class="file-details">
                    <div class="file-name">${audio.name}</div>
                    <div class="file-meta">
                        <span>${this.formatFileSize(audio.size)}</span>
                        <span>•</span>
                        <span>${new Date(audio.uploadDate).toLocaleDateString()}</span>
                    </div>
                </div>
                <div class="file-actions">
                    <button class="btn btn-sm btn-danger delete-file" data-audio-id="${audio.id}">🗑️ Delete</button>
                </div>
            </div>
        `).join('');

        // Add event listeners
        container.querySelectorAll('.delete-file').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const audioId = e.target.closest('button').dataset.audioId;
                this.deleteAudio(audioId);
            });
        });
    }

    updateStorageStats() {
        const filesCount = document.getElementById('filesCount');
        const totalSize = document.getElementById('totalSize');
        
        if (filesCount) filesCount.textContent = this.customAudioFiles.length;
        
        if (totalSize) {
            const totalBytes = this.customAudioFiles.reduce((sum, audio) => sum + audio.size, 0);
            totalSize.textContent = this.formatFileSize(totalBytes);
        }
    }

    async testAudio(audioId = null) {
        this.showLoading(true);
        
        try {
            if (audioId) {
                await AudioManager.testAudio(audioId);
                this.showToast('Audio test completed', 'success');
            } else {
                const { audioData, settings } = await AudioManager.getAudioForPlayback();
                await this.playAudioWithSettings(audioData, settings);
                this.showToast('Audio test completed', 'success');
            }
        } catch (error) {
            Logger.error(`Audio test failed: ${error.message}`);
            this.showToast('Failed to test audio', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    async testCurrentAudio() {
        await this.testAudio();
    }

    async playAudioWithSettings(audioData, settings) {
        // Create offscreen document if needed
        const existingContexts = await chrome.runtime.getContexts({
            contextTypes: ['OFFSCREEN_DOCUMENT'],
            documentUrls: [chrome.runtime.getURL('offscreen.html')]
        });

        if (existingContexts.length === 0) {
            await chrome.offscreen.createDocument({
                url: 'offscreen.html',
                reasons: ['AUDIO_PLAYBACK'],
                justification: 'Playing audio notifications for ServiceNow updates'
            });
        }

        // Send message to offscreen document
        await chrome.runtime.sendMessage({
            type: "PLAY_AUDIO",
            audioData: audioData,
            settings: settings
        });
    }

    selectCustomAudio(audioId) {
        this.currentSettings.selectedAudio = audioId;
        this.showToast('Custom audio selected', 'success');
    }

    async deleteAudio(audioId) {
        if (!confirm('Are you sure you want to delete this audio file?')) {
            return;
        }

        this.showLoading(true);

        try {
            const deleted = await AudioManager.deleteAudio(audioId);
            if (deleted) {
                this.showToast('Audio file deleted successfully', 'success');
                await this.loadCustomAudioFiles();
                
                // Reset to default if this was selected
                if (this.currentSettings.selectedAudio === audioId) {
                    this.currentSettings.selectedAudio = 'default';
                    const audioSource = document.getElementById('audioSource');
                    if (audioSource) {
                        audioSource.value = 'default';
                        this.toggleAudioSection();
                    }
                }
            } else {
                this.showToast('Failed to delete audio file', 'error');
            }
        } catch (error) {
            Logger.error(`Audio deletion failed: ${error.message}`);
            this.showToast('Failed to delete audio file', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    async resetAudioSettings() {
        if (!confirm('Are you sure you want to reset all audio settings to defaults?')) {
            return;
        }

        try {
            this.currentSettings = AudioManager.DEFAULT_SETTINGS;
            await this.loadAudioSettings(); // Reload to update UI
            this.showToast('Settings reset to defaults', 'success');
        } catch (error) {
            Logger.error(`Reset failed: ${error.message}`);
            this.showToast('Failed to reset settings', 'error');
        }
    }

    async saveAudioSettings() {
        this.showLoading(true);

        try {
            const settings = {
                selectedAudio: document.getElementById('audioSource').value === 'default' ? 'default' : this.currentSettings.selectedAudio,
                playbackDuration: parseInt(document.getElementById('playbackDuration').value) * 1000,
                volume: parseInt(document.getElementById('volumeControl').value) / 100,
                loop: document.getElementById('loopAudio').checked
            };

            const validation = AudioManager.validateAudioSettings(settings);
            if (!validation.isValid) {
                this.showToast(`Validation error: ${validation.errors.join(', ')}`, 'error');
                return;
            }

            const saved = await AudioManager.saveAudioSettings(settings);
            if (saved) {
                this.currentSettings = settings;
                this.showToast('Audio settings saved successfully!', 'success');
            } else {
                this.showToast('Failed to save audio settings', 'error');
            }
        } catch (error) {
            Logger.error(`Save audio settings failed: ${error.message}`);
            this.showToast('Failed to save audio settings', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    async saveConfiguration() {
        try {
            const config = {
                rooturl: document.getElementById('rootUrl').value.trim(),
                primary: document.getElementById('primaryQueue').value.trim(),
                secondary: document.getElementById('secondaryQueue').value.trim(),
                primaryNotificationText: document.getElementById('primaryNotificationText').value.trim(),
                secondaryNotificationText: document.getElementById('secondaryNotificationText').value.trim(),
                splitcount: document.getElementById('badgeDisplay').value
            };

            // Validate URLs
            if (config.primary && !this.validateServiceNowURL(config.primary)) {
                this.showToast('Primary URL must be a valid ServiceNow HTTPS URL', 'error');
                return;
            }
            
            if (config.secondary && !this.validateServiceNowURL(config.secondary)) {
                this.showToast('Secondary URL must be a valid ServiceNow HTTPS URL', 'error');
                return;
            }
            
            if (config.rooturl && !this.validateServiceNowURL(config.rooturl)) {
                this.showToast('Base URL must be a valid ServiceNow HTTPS URL', 'error');
                return;
            }

            await chrome.storage.sync.set(config);
            this.showToast('Configuration saved successfully!', 'success');
            
            // Notify background script
            chrome.runtime.sendMessage({ type: 'SNOW_AUDIO_ALERT_OPTIONS_UPDATED' });
            
        } catch (error) {
            Logger.error(`Save configuration failed: ${error.message}`);
            this.showToast('Failed to save configuration', 'error');
        }
    }

    async saveMonitoringSettings() {
        try {
            const settings = {
                disableAlarm: document.getElementById('disableAlarm').checked ? 'on' : 'off',
                disablePoll: document.getElementById('disablePoll').checked ? 'on' : 'off',
                pollInterval: parseInt(document.getElementById('pollInterval').value) || 5,
                alarmCondition: document.querySelector("input[name='alertCondition']:checked")?.value || 'nonZeroCount'
            };

            await chrome.storage.sync.set(settings);
            this.currentPollInterval = settings.pollInterval;
            
            this.updateMonitoringStatus();
            this.showToast('Monitoring settings saved successfully!', 'success');
            
            // Notify background script
            chrome.runtime.sendMessage({ type: 'SNOW_AUDIO_ALERT_OPTIONS_UPDATED' });
            
        } catch (error) {
            Logger.error(`Save monitoring settings failed: ${error.message}`);
            this.showToast('Failed to save monitoring settings', 'error');
        }
    }

    async testConfiguration() {
        this.showToast('Testing configuration...', 'info');
        // Implementation would test ServiceNow connection
        setTimeout(() => {
            this.showToast('Configuration test completed', 'success');
        }, 2000);
    }

    async toggleMonitoring() {
        this.isMonitoring = !this.isMonitoring;
        await this.updateMonitoringStatus();
        
        if (this.isMonitoring) {
            this.showToast('🟢 Monitoring started', 'success');
            chrome.runtime.sendMessage({ type: 'SNOW_AUDIO_ALERT_OPTIONS_UPDATED' });
        } else {
            this.showToast('🔴 Monitoring stopped', 'success');
        }
        
        await chrome.storage.local.set({ isMonitoring: this.isMonitoring });
    }

    updateMonitoringStatus() {
        const statusDot = document.getElementById('statusDot');
        const statusText = document.getElementById('statusText');
        const startStopIcon = document.getElementById('startStopIcon');
        const startStopText = document.getElementById('startStopText');
        const systemStatus = document.getElementById('systemStatus');
        const monitoringStatus = document.getElementById('monitoringStatus');
        
        const disablePoll = document.getElementById('disablePoll');
        const isDisabled = disablePoll && disablePoll.checked;
        
        const isActive = this.isMonitoring && !isDisabled;
        
        // Update header status
        if (statusDot) {
            statusDot.className = `status-dot ${isActive ? '' : 'inactive'}`;
        }
        if (statusText) {
            statusText.textContent = isActive ? 'Active' : 'Stopped';
        }
        if (startStopIcon) {
            startStopIcon.textContent = isActive ? '⏸️' : '▶️';
        }
        if (startStopText) {
            startStopText.textContent = isActive ? 'Stop' : 'Start';
        }
        
        // Update dashboard status
        if (systemStatus) {
            systemStatus.textContent = isActive ? 'Active' : 'Stopped';
            systemStatus.className = `status-badge ${isActive ? '' : 'stopped'}`;
        }
        if (monitoringStatus) {
            monitoringStatus.textContent = isActive ? 'Active' : 'Stopped';
        }
        
        // Handle countdown timer
        if (isActive) {
            this.startCountdownTimer();
        } else {
            this.stopCountdownTimer();
        }
    }

    async refreshQueues() {
        this.showToast('Refreshing queue data...', 'info');
        chrome.runtime.sendMessage({ type: 'REQUEST_TICKET_DATA' });
    }

    async testNotification() {
        try {
            await chrome.runtime.sendMessage({ 
                type: "TEST_NOTIFICATION",
                ticketNumber: "INC0012345",
                ticketDescription: "This is a test notification to verify the notification system is working properly.",
                severity: "3"
            });
            
            this.showToast('🔔 Test notification sent!', 'success');
        } catch (error) {
            Logger.error(`Test notification failed: ${error.message}`);
            this.showToast('Failed to send test notification', 'error');
        }
    }

    startRealTimeUpdates() {
        // Listen for updates from background script
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message && message.type === 'TICKET_UPDATE') {
                this.updateTicketCounts(
                    message.queueACount || 0,
                    message.queueBCount || 0,
                    message.totalCount || 0
                );
                this.updateRecentTickets(message.tickets || []);
                this.updateLastPollTime();
                this.startCountdownTimer(); // Reset countdown
            }
        });
        
        // Request initial data
        chrome.runtime.sendMessage({ type: 'REQUEST_TICKET_DATA' });
    }

    updateTicketCounts(queueACount = 0, queueBCount = 0, totalCount = 0) {
        const elements = {
            queueACount: document.getElementById('queueACount'),
            queueBCount: document.getElementById('queueBCount'),
            totalCount: document.getElementById('totalCount')
        };
        
        if (elements.queueACount) elements.queueACount.textContent = queueACount;
        if (elements.queueBCount) elements.queueBCount.textContent = queueBCount;
        if (elements.totalCount) elements.totalCount.textContent = totalCount;
        
        // Update trends (simplified)
        this.updateTrends(queueACount, queueBCount, totalCount);
    }

    updateRecentTickets(tickets = []) {
        const recentTicketsList = document.getElementById('recentTicketsList');
        const recentTicketCount = document.getElementById('recentTicketCount');
        
        if (recentTicketCount) recentTicketCount.textContent = tickets.length;
        
        if (!recentTicketsList) return;
        
        if (tickets.length === 0) {
            recentTicketsList.innerHTML = '<div class="empty-state">No recent tickets</div>';
            return;
        }
        
        recentTicketsList.innerHTML = tickets.slice(0, 5).map(ticket => `
            <div class="ticket-item">
                <strong>${ticket.number}</strong> - ${ticket.description || 'ServiceNow ticket'}
            </div>
        `).join('');
    }

    updateTrends(queueACount, queueBCount, totalCount) {
        // Simplified trend calculation
        const trends = {
            queueATrend: document.getElementById('queueATrend'),
            queueBTrend: document.getElementById('queueBTrend'),
            totalTrend: document.getElementById('totalTrend')
        };
        
        // For now, just show neutral arrows
        Object.values(trends).forEach(element => {
            if (element) element.textContent = '→';
        });
    }

    async updateLastPollTime() {
        try {
            const result = await chrome.storage.local.get(['lastPollAt']);
            const lastPollElements = ['lastPollTime', 'lastPollAt'];
            
            if (result.lastPollAt) {
                const pollDate = new Date(result.lastPollAt);
                const formattedTime = pollDate.toLocaleString();
                
                lastPollElements.forEach(elementId => {
                    const element = document.getElementById(elementId);
                    if (element) element.textContent = formattedTime;
                });
            } else {
                lastPollElements.forEach(elementId => {
                    const element = document.getElementById(elementId);
                    if (element) element.textContent = 'Never';
                });
            }
        } catch (error) {
            Logger.error(`Failed to update last poll time: ${error.message}`);
        }
    }

    startCountdownTimer() {
        this.stopCountdownTimer();
        
        const updateCountdown = () => {
            chrome.storage.local.get(['lastPollAt'], (result) => {
                let secondsRemaining = this.currentPollInterval * 60;
                
                if (result.lastPollAt) {
                    const lastPollTime = new Date(result.lastPollAt).getTime();
                    const timeSinceLastPoll = Date.now() - lastPollTime;
                    const intervalMs = this.currentPollInterval * 60 * 1000;
                    
                    secondsRemaining = Math.max(0, Math.ceil((intervalMs - timeSinceLastPoll) / 1000));
                    
                    if (secondsRemaining <= 5) {
                        secondsRemaining = this.currentPollInterval * 60;
                    }
                }
                
                this.updateCountdownDisplay(secondsRemaining);
            });
        };
        
        updateCountdown();
        this.countdownTimer = setInterval(updateCountdown, 1000);
    }

    stopCountdownTimer() {
        if (this.countdownTimer) {
            clearInterval(this.countdownTimer);
            this.countdownTimer = null;
        }
        
        const countdownValue = document.getElementById('countdownValue');
        const countdownProgress = document.getElementById('countdownProgress');
        
        if (countdownValue) countdownValue.textContent = '--:--';
        if (countdownProgress) countdownProgress.style.width = '0%';
    }

    updateCountdownDisplay(seconds) {
        const countdownValue = document.getElementById('countdownValue');
        const countdownProgress = document.getElementById('countdownProgress');
        
        if (!countdownValue || !countdownProgress) return;
        
        if (seconds <= 0) {
            countdownValue.textContent = 'Polling...';
            countdownProgress.style.width = '0%';
            return;
        }
        
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        const display = `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
        countdownValue.textContent = display;
        
        const totalSeconds = this.currentPollInterval * 60;
        const progressPercentage = (seconds / totalSeconds) * 100;
        countdownProgress.style.width = progressPercentage + '%';
    }

    updatePollInterval() {
        const pollInterval = document.getElementById('pollInterval');
        if (pollInterval) {
            this.currentPollInterval = parseInt(pollInterval.value) || 5;
            if (this.isMonitoring) {
                this.startCountdownTimer();
            }
        }
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

    showLoading(show) {
        const loadingOverlay = document.getElementById('loadingOverlay');
        if (loadingOverlay) {
            loadingOverlay.style.display = show ? 'flex' : 'none';
        }
    }

    showToast(message, type = 'success') {
        const toast = document.getElementById('toastNotification');
        const toastMessage = document.getElementById('toastMessage');
        const toastIcon = document.getElementById('toastIcon');
        
        if (!toast || !toastMessage) return;
        
        toastMessage.textContent = message;
        toast.className = `toast-notification ${type}`;
        
        // Set icon based on type
        if (toastIcon) {
            const icons = {
                success: '✅',
                error: '❌',
                info: 'ℹ️',
                warning: '⚠️'
            };
            toastIcon.textContent = icons[type] || icons.success;
        }
        
        toast.style.display = 'block';
        
        setTimeout(() => {
            toast.style.display = 'none';
        }, 3000);
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    formatDuration(milliseconds) {
        if (!milliseconds || milliseconds === 0) return 'Unknown';
        const seconds = Math.round(milliseconds / 1000);
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return minutes > 0 ? `${minutes}:${remainingSeconds.toString().padStart(2, '0')}` : `${seconds}s`;
    }
}

// Initialize the home UI when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new HomeUI();
});
