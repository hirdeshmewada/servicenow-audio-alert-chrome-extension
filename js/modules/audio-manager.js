/**
 * Audio Manager Module
 * Handles custom audio uploads, storage, and playback
 * Provides interface for audio settings management
 */

import { Logger } from './logger.js';
import { SecurityValidator } from './security-validator.js';

export class AudioManager {
    
    static STORAGE_KEYS = {
        CUSTOM_AUDIO: 'customAudioFiles',
        AUDIO_SETTINGS: 'audioSettings',
        DEFAULT_AUDIO: 'defaultAlarmAudio'
    };
    
    static DEFAULT_SETTINGS = {
        selectedAudio: 'default', // 'default' or custom audio ID
        playbackDuration: 5000, // 5 seconds default
        volume: 0.7, // 70% volume default
        loop: false
    };
    
    /**
     * Uploads and validates custom audio file
     * @param {File} file - Audio file from user input
     * @returns {Promise<object>} - Uploaded audio info
     */
    static async uploadAudio(file) {
        try {
            // Validate file
            if (!SecurityValidator.isValidAudioFile(file)) {
                throw new Error('Invalid audio file. Only MP3, WAV files up to 5MB are allowed.');
            }
            
            Logger.info(`Processing audio upload: ${file.name} (${file.size} bytes)`);
            
            // Convert file to base64 for storage
            const base64Audio = await this.fileToBase64(file);
            
            // Generate unique ID for the audio
            const audioId = `audio_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            
            const audioInfo = {
                id: audioId,
                name: file.name,
                size: file.size,
                type: file.type,
                data: base64Audio,
                uploadDate: new Date().toISOString(),
                duration: 0 // Will be calculated when loaded
            };
            
            // Get existing custom audio files
            const { customAudioFiles = [] } = await chrome.storage.local.get(this.STORAGE_KEYS.CUSTOM_AUDIO);
            
            // Add new audio (limit to 5 custom files)
            if (customAudioFiles.length >= 5) {
                throw new Error('Maximum 5 custom audio files allowed. Please remove some existing files.');
            }
            
            customAudioFiles.push(audioInfo);
            
            // Save to storage
            await chrome.storage.local.set({
                [this.STORAGE_KEYS.CUSTOM_AUDIO]: customAudioFiles
            });
            
            // Calculate audio duration
            audioInfo.duration = await this.getAudioDuration(base64Audio);
            
            // Update storage with duration
            const updatedFiles = customAudioFiles.map(f => f.id === audioId ? audioInfo : f);
            await chrome.storage.local.set({
                [this.STORAGE_KEYS.CUSTOM_AUDIO]: updatedFiles
            });
            
            Logger.info(`Audio uploaded successfully: ${audioId}`);
            return audioInfo;
            
        } catch (error) {
            Logger.error(`Audio upload failed: ${error.message}`);
            throw error;
        }
    }
    
    /**
     * Converts file to base64 string
     * @param {File} file - File to convert
     * @returns {Promise<string>} - Base64 string
     */
    static fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsDataURL(file);
        });
    }
    
    /**
     * Gets audio duration from base64 data
     * @param {string} base64Audio - Base64 audio data
     * @returns {Promise<number>} - Duration in milliseconds
     */
    static getAudioDuration(base64Audio) {
        return new Promise((resolve) => {
            const audio = new Audio(base64Audio);
            audio.addEventListener('loadedmetadata', () => {
                resolve(audio.duration * 1000); // Convert to milliseconds
            });
            audio.addEventListener('error', () => {
                resolve(0); // Default to 0 if can't determine duration
            });
        });
    }
    
    /**
     * Gets all custom audio files
     * @returns {Promise<Array>} - Array of custom audio files
     */
    static async getCustomAudioFiles() {
        try {
            const { customAudioFiles = [] } = await chrome.storage.local.get(this.STORAGE_KEYS.CUSTOM_AUDIO);
            return customAudioFiles;
        } catch (error) {
            Logger.error(`Failed to get custom audio files: ${error.message}`);
            return [];
        }
    }
    
    /**
     * Deletes custom audio file
     * @param {string} audioId - ID of audio to delete
     * @returns {Promise<boolean>} - True if deleted successfully
     */
    static async deleteAudio(audioId) {
        try {
            const { customAudioFiles = [] } = await chrome.storage.local.get(this.STORAGE_KEYS.CUSTOM_AUDIO);
            const filteredFiles = customAudioFiles.filter(audio => audio.id !== audioId);
            
            if (filteredFiles.length === customAudioFiles.length) {
                return false; // Audio not found
            }
            
            await chrome.storage.local.set({
                [this.STORAGE_KEYS.CUSTOM_AUDIO]: filteredFiles
            });
            
            // Update settings if this audio was selected
            const settings = await this.getAudioSettings();
            if (settings.selectedAudio === audioId) {
                await this.saveAudioSettings({
                    ...settings,
                    selectedAudio: 'default'
                });
            }
            
            Logger.info(`Audio deleted: ${audioId}`);
            return true;
            
        } catch (error) {
            Logger.error(`Failed to delete audio: ${error.message}`);
            return false;
        }
    }
    
    /**
     * Gets current audio settings
     * @returns {Promise<object>} - Audio settings
     */
    static async getAudioSettings() {
        try {
            const { audioSettings } = await chrome.storage.local.get(this.STORAGE_KEYS.AUDIO_SETTINGS);
            return { ...this.DEFAULT_SETTINGS, ...audioSettings };
        } catch (error) {
            Logger.error(`Failed to get audio settings: ${error.message}`);
            return this.DEFAULT_SETTINGS;
        }
    }
    
    /**
     * Saves audio settings
     * @param {object} settings - Audio settings to save
     * @returns {Promise<boolean>} - True if saved successfully
     */
    static async saveAudioSettings(settings) {
        try {
            const currentSettings = await this.getAudioSettings();
            const updatedSettings = { ...currentSettings, ...settings };
            
            await chrome.storage.local.set({
                [this.STORAGE_KEYS.AUDIO_SETTINGS]: updatedSettings
            });
            
            Logger.info('Audio settings saved successfully');
            return true;
            
        } catch (error) {
            Logger.error(`Failed to save audio settings: ${error.message}`);
            return false;
        }
    }
    
    /**
     * Gets audio data for playback
     * @returns {Promise<object>} - Audio data and settings
     */
    static async getAudioForPlayback() {
        try {
            const settings = await this.getAudioSettings();
            let audioData = null;
            
            if (settings.selectedAudio === 'default') {
                // Use default alarm audio
                const { defaultAlarmAudio } = await chrome.storage.local.get(this.STORAGE_KEYS.DEFAULT_AUDIO);
                audioData = defaultAlarmAudio || 'sound/alarm-deep_groove.mp3';
            } else {
                // Use custom audio
                const customFiles = await this.getCustomAudioFiles();
                const selectedAudio = customFiles.find(audio => audio.id === settings.selectedAudio);
                audioData = selectedAudio ? selectedAudio.data : null;
            }
            
            return {
                audioData,
                settings: {
                    duration: settings.playbackDuration,
                    volume: settings.volume,
                    loop: settings.loop
                }
            };
            
        } catch (error) {
            Logger.error(`Failed to get audio for playback: ${error.message}`);
            return {
                audioData: 'sound/alarm-deep_groove.mp3',
                settings: this.DEFAULT_SETTINGS
            };
        }
    }
    
    /**
     * Plays audio with specified settings
     * @param {string} audioData - Audio data (URL or base64)
     * @param {object} settings - Playback settings
     * @returns {Promise<void>}
     */
    static async playAudio(audioData, settings) {
        return new Promise((resolve) => {
            try {
                const audio = new Audio(audioData);
                audio.volume = settings.volume;
                audio.loop = settings.loop;
                
                const stopAudio = () => {
                    audio.pause();
                    audio.currentTime = 0;
                    resolve();
                };
                
                // Set timeout for custom duration
                const timeoutId = setTimeout(stopAudio, settings.duration);
                
                audio.addEventListener('ended', () => {
                    clearTimeout(timeoutId);
                    if (!settings.loop) {
                        resolve();
                    }
                });
                
                audio.addEventListener('error', (error) => {
                    clearTimeout(timeoutId);
                    Logger.error(`Audio playback error: ${error.message}`);
                    resolve();
                });
                
                audio.play().catch(error => {
                    clearTimeout(timeoutId);
                    Logger.error(`Failed to play audio: ${error.message}`);
                    resolve();
                });
                
            } catch (error) {
                Logger.error(`Audio playback failed: ${error.message}`);
                resolve();
            }
        });
    }
    
    /**
     * Tests audio playback
     * @param {string} audioId - Audio ID to test (or 'default')
     * @returns {Promise<boolean>} - True if playback successful
     */
    static async testAudio(audioId) {
        try {
            const { audioData, settings } = await this.getAudioForPlayback();
            
            if (audioId !== 'default') {
                const customFiles = await this.getCustomAudioFiles();
                const testAudio = customFiles.find(audio => audio.id === audioId);
                if (!testAudio) {
                    throw new Error('Audio not found');
                }
                return await this.playAudio(testAudio.data, settings);
            }
            
            return await this.playAudio(audioData, settings);
            
        } catch (error) {
            Logger.error(`Audio test failed: ${error.message}`);
            return false;
        }
    }
    
    /**
     * Validates audio settings
     * @param {object} settings - Settings to validate
     * @returns {object} - Validation result
     */
    static validateAudioSettings(settings) {
        const errors = [];
        
        if (settings.playbackDuration !== undefined) {
            const duration = parseInt(settings.playbackDuration);
            if (isNaN(duration) || duration < 1000 || duration > 60000) {
                errors.push('Playback duration must be between 1 and 60 seconds');
            }
        }
        
        if (settings.volume !== undefined) {
            const volume = parseFloat(settings.volume);
            if (isNaN(volume) || volume < 0 || volume > 1) {
                errors.push('Volume must be between 0 and 1');
            }
        }
        
        if (settings.selectedAudio !== undefined) {
            if (typeof settings.selectedAudio !== 'string') {
                errors.push('Selected audio must be a string');
            }
        }
        
        return {
            isValid: errors.length === 0,
            errors
        };
    }
}
