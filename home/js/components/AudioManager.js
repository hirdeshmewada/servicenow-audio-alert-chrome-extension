/**
 * Audio Manager Component
 * Handles audio settings, file upload, and playback
 */

import { AudioManager as ServiceAudioManager } from '../../modules/audio-manager.js';

export class AudioManager {
    constructor() {
        this.elements = {};
        this.customAudioFiles = [];
        this.currentSettings = {};
        this.init();
    }

    init() {
        this.setupElements();
        this.setupEventListeners();
    }

    setupElements() {
        this.elements = {
            // Audio source
            audioSource: document.getElementById('audioSource'),
            // Sections
            defaultSection: document.getElementById('defaultAudioSection'),
            customSection: document.getElementById('customAudioSection'),
            // Upload
            selectFileBtn: document.getElementById('selectFileBtn'),
            audioFileInput: document.getElementById('audioFileInput'),
            uploadArea: document.getElementById('uploadArea'),
            // Playback controls
            durationSlider: document.getElementById('playbackDuration'),
            volumeSlider: document.getElementById('volumeControl'),
            loopCheckbox: document.getElementById('loopAudio'),
            durationValue: document.getElementById('durationValue'),
            volumeValue: document.getElementById('volumeValue'),
            // Test buttons
            testDefaultBtn: document.getElementById('testDefaultAudio'),
            testCurrentBtn: document.getElementById('testCurrentSettings'),
            // Action buttons
            resetBtn: document.getElementById('resetAudioSettings'),
            saveBtn: document.getElementById('saveAudioSettings'),
            // Lists and containers
            audioFilesContainer: document.getElementById('audioFilesContainer'),
            filesManagementContainer: document.getElementById('filesManagementContainer'),
            filesCount: document.getElementById('filesCount'),
            totalSize: document.getElementById('totalSize')
        };
    }

    setupEventListeners() {
        // Audio source selection
        if (this.elements.audioSource) {
            this.elements.audioSource.addEventListener('change', () => this.toggleAudioSection());
        }
        
        // File upload
        this.setupFileUpload();
        
        // Playback controls
        this.setupPlaybackControls();
        
        // Test buttons
        if (this.elements.testDefaultBtn) {
            this.elements.testDefaultBtn.addEventListener('click', () => this.testAudio('default'));
        }
        
        if (this.elements.testCurrentBtn) {
            this.elements.testCurrentBtn.addEventListener('click', () => this.testCurrentAudio());
        }
        
        // Action buttons
        if (this.elements.resetBtn) {
            this.elements.resetBtn.addEventListener('click', () => this.resetAudioSettings());
        }
        
        if (this.elements.saveBtn) {
            this.elements.saveBtn.addEventListener('click', () => this.saveAudioSettings());
        }
    }

    setupFileUpload() {
        if (this.elements.selectFileBtn && this.elements.audioFileInput) {
            this.elements.selectFileBtn.addEventListener('click', () => {
                this.elements.audioFileInput.click();
            });
        }
        
        if (this.elements.audioFileInput) {
            this.elements.audioFileInput.addEventListener('change', (e) => {
                if (e.target.files[0]) {
                    this.handleFileUpload(e.target.files[0]);
                }
            });
        }
        
        if (this.elements.uploadArea) {
            this.elements.uploadArea.addEventListener('dragover', (e) => {
                e.preventDefault();
                this.elements.uploadArea.classList.add('drag-over');
            });
            
            this.elements.uploadArea.addEventListener('dragleave', () => {
                this.elements.uploadArea.classList.remove('drag-over');
            });
            
            this.elements.uploadArea.addEventListener('drop', (e) => {
                e.preventDefault();
                this.elements.uploadArea.classList.remove('drag-over');
                const file = e.dataTransfer.files[0];
                if (file) {
                    this.handleFileUpload(file);
                }
            });
        }
    }

    setupPlaybackControls() {
        if (this.elements.durationSlider && this.elements.durationValue) {
            this.elements.durationSlider.addEventListener('input', () => {
                this.elements.durationValue.textContent = this.elements.durationSlider.value;
            });
        }
        
        if (this.elements.volumeSlider && this.elements.volumeValue) {
            this.elements.volumeSlider.addEventListener('input', () => {
                this.elements.volumeValue.textContent = this.elements.volumeSlider.value;
            });
        }
    }

    async loadAudioSettings() {
        try {
            this.currentSettings = await ServiceAudioManager.getAudioSettings();
            
            // Update UI
            if (this.elements.audioSource) {
                this.elements.audioSource.value = this.currentSettings.selectedAudio === 'default' ? 'default' : 'custom';
            }
            
            if (this.elements.durationSlider && this.elements.durationValue) {
                this.elements.durationSlider.value = this.currentSettings.playbackDuration / 1000;
                this.elements.durationValue.textContent = this.currentSettings.playbackDuration / 1000;
            }
            
            if (this.elements.volumeSlider && this.elements.volumeValue) {
                this.elements.volumeSlider.value = this.currentSettings.volume * 100;
                this.elements.volumeValue.textContent = Math.round(this.currentSettings.volume * 100);
            }
            
            if (this.elements.loopCheckbox) {
                this.elements.loopCheckbox.checked = this.currentSettings.loop;
            }
            
            this.toggleAudioSection();
            
        } catch (error) {
            this.dispatchAudioUpdate({
                type: 'error',
                message: 'Failed to load audio settings'
            });
        }
    }

    async loadCustomAudioFiles() {
        try {
            this.customAudioFiles = await ServiceAudioManager.getCustomAudioFiles();
            this.updateCustomAudioList();
            this.updateFileManagement();
            this.updateStorageStats();
            
        } catch (error) {
            this.dispatchAudioUpdate({
                type: 'error',
                message: 'Failed to load custom audio files'
            });
        }
    }

    toggleAudioSection() {
        if (!this.elements.audioSource || !this.elements.defaultSection || !this.elements.customSection) return;
        
        if (this.elements.audioSource.value === 'default') {
            if (this.elements.defaultSection) this.elements.defaultSection.style.display = 'block';
            if (this.elements.customSection) this.elements.customSection.style.display = 'none';
        } else {
            if (this.elements.defaultSection) this.elements.defaultSection.style.display = 'none';
            if (this.elements.customSection) this.elements.customSection.style.display = 'block';
        }
    }

    updateCustomAudioList() {
        if (!this.elements.audioFilesContainer) return;
        
        if (this.customAudioFiles.length === 0) {
            this.elements.audioFilesContainer.innerHTML = '<div class="empty-state">No custom audio files uploaded yet</div>';
            return;
        }

        this.elements.audioFilesContainer.innerHTML = this.customAudioFiles.map(audio => `
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
        this.elements.audioFilesContainer.querySelectorAll('.test-audio').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const audioId = e.target.closest('button').dataset.audioId;
                this.testAudio(audioId);
            });
        });
        
        this.elements.audioFilesContainer.querySelectorAll('.select-audio').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const audioId = e.target.closest('button').dataset.audioId;
                this.selectCustomAudio(audioId);
            });
        });
        
        this.elements.audioFilesContainer.querySelectorAll('.delete-audio').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const audioId = e.target.closest('button').dataset.audioId;
                this.deleteAudio(audioId);
            });
        });
    }

    updateFileManagement() {
        if (!this.elements.filesManagementContainer) return;
        
        if (this.customAudioFiles.length === 0) {
            this.elements.filesManagementContainer.innerHTML = '<div class="empty-state">No files to manage</div>';
            return;
        }

        this.elements.filesManagementContainer.innerHTML = this.customAudioFiles.map(audio => `
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
        this.elements.filesManagementContainer.querySelectorAll('.delete-file').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const audioId = e.target.closest('button').dataset.audioId;
                this.deleteAudio(audioId);
            });
        });
    }

    updateStorageStats() {
        if (this.elements.filesCount) {
            this.elements.filesCount.textContent = this.customAudioFiles.length;
        }
        
        if (this.elements.totalSize) {
            const totalBytes = this.customAudioFiles.reduce((sum, audio) => sum + audio.size, 0);
            this.elements.totalSize.textContent = this.formatFileSize(totalBytes);
        }
    }

    async handleFileUpload(file) {
        this.dispatchAudioUpdate({
            type: 'uploading',
            file: file.name
        });

        try {
            const uploadedAudio = await ServiceAudioManager.uploadAudio(file);
            this.dispatchAudioUpdate({
                type: 'upload-success',
                audio: uploadedAudio
            });
            await this.loadCustomAudioFiles();
            
            // Switch to custom audio
            if (this.elements.audioSource) {
                this.elements.audioSource.value = 'custom';
                this.toggleAudioSection();
            }
            
        } catch (error) {
            this.dispatchAudioUpdate({
                type: 'error',
                message: error.message
            });
        } finally {
            // Reset file input
            if (this.elements.audioFileInput) {
                this.elements.audioFileInput.value = '';
            }
        }
    }

    async testAudio(audioId = null) {
        this.dispatchAudioUpdate({
            type: 'testing',
            audioId: audioId
        });

        try {
            if (audioId) {
                await ServiceAudioManager.testAudio(audioId);
            } else {
                const { audioData, settings } = await ServiceAudioManager.getAudioForPlayback();
                await this.playAudioWithSettings(audioData, settings);
            }
            
            this.dispatchAudioUpdate({
                type: 'test-success'
            });
        } catch (error) {
            this.dispatchAudioUpdate({
                type: 'error',
                message: 'Failed to test audio'
            });
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
        this.dispatchAudioUpdate({
            type: 'selected',
            audioId: audioId
        });
    }

    async deleteAudio(audioId) {
        if (!confirm('Are you sure you want to delete this audio file?')) {
            return;
        }

        this.dispatchAudioUpdate({
            type: 'deleting',
            audioId: audioId
        });

        try {
            const deleted = await ServiceAudioManager.deleteAudio(audioId);
            if (deleted) {
                this.dispatchAudioUpdate({
                    type: 'delete-success',
                    audioId: audioId
                });
                await this.loadCustomAudioFiles();
                
                // Reset to default if this was selected
                if (this.currentSettings.selectedAudio === audioId) {
                    this.currentSettings.selectedAudio = 'default';
                    if (this.elements.audioSource) {
                        this.elements.audioSource.value = 'default';
                        this.toggleAudioSection();
                    }
                }
            } else {
                this.dispatchAudioUpdate({
                    type: 'error',
                    message: 'Failed to delete audio file'
                });
            }
        } catch (error) {
            this.dispatchAudioUpdate({
                type: 'error',
                message: error.message
            });
        }
    }

    async resetAudioSettings() {
        if (!confirm('Are you sure you want to reset all audio settings to defaults?')) {
            return;
        }

        try {
            this.currentSettings = ServiceAudioManager.DEFAULT_SETTINGS;
            await this.loadAudioSettings();
            this.dispatchAudioUpdate({
                type: 'reset-success'
            });
        } catch (error) {
            this.dispatchAudioUpdate({
                type: 'error',
                message: 'Failed to reset settings'
            });
        }
    }

    async saveAudioSettings() {
        const settings = {
            selectedAudio: this.elements.audioSource?.value === 'default' ? 'default' : this.currentSettings.selectedAudio,
            playbackDuration: parseInt(this.elements.durationSlider?.value) * 1000,
            volume: parseInt(this.elements.volumeSlider?.value) / 100,
            loop: this.elements.loopCheckbox?.checked
        };

        const validation = ServiceAudioManager.validateAudioSettings(settings);
        if (!validation.isValid) {
            this.dispatchAudioUpdate({
                type: 'error',
                message: `Validation error: ${validation.errors.join(', ')}`
            });
            return false;
        }

        this.dispatchAudioUpdate({
            type: 'saving'
        });

        try {
            const saved = await ServiceAudioManager.saveAudioSettings(settings);
            if (saved) {
                this.currentSettings = settings;
                this.dispatchAudioUpdate({
                    type: 'save-success',
                    settings: settings
                });
            } else {
                this.dispatchAudioUpdate({
                    type: 'error',
                    message: 'Failed to save audio settings'
                });
            }
        } catch (error) {
            this.dispatchAudioUpdate({
                type: 'error',
                message: 'Failed to save audio settings'
            });
        }
    }

    dispatchAudioUpdate(updateData) {
        const event = new CustomEvent('audioUpdate', {
            detail: updateData
        });
        document.dispatchEvent(event);
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
