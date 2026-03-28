// ServiceNow Audio Alerts - Audio Handler Module
// Handles all audio playback functionality using offscreen documents

import { AudioManager } from './audio-manager.js';

// Main audio notification function
export async function audioNotification() {
    try {
        // Get custom audio settings
        const { audioData, settings } = await AudioManager.getAudioForPlayback();
        
        // Create offscreen document if it doesn't exist
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

        // Send message to offscreen document with custom audio data and settings
        await chrome.runtime.sendMessage({ 
            type: "PLAY_AUDIO",
            audioData: audioData,
            settings: settings
        });
        console.log('Audio notification sent to offscreen document with custom settings');
    } catch (error) {
        console.log('Could not play audio notification:', error);
    }
}

// Stop audio notification function
export async function stopAudioNotification() {
    try {
        await chrome.runtime.sendMessage({ type: "STOP_AUDIO" });
        console.log('Audio stop notification sent to offscreen document');
    } catch (error) {
        console.log('Could not stop audio notification:', error);
    }
}

// Test audio notification function
export async function testAudioNotification() {
    console.log('Testing audio notification...');
    await audioNotification();
}

// Check if offscreen document exists
export async function checkOffscreenDocument() {
    try {
        const existingContexts = await chrome.runtime.getContexts({
            contextTypes: ['OFFSCREEN_DOCUMENT'],
            documentUrls: [chrome.runtime.getURL('offscreen.html')]
        });
        return existingContexts.length > 0;
    } catch (error) {
        console.log('Error checking offscreen document:', error);
        return false;
    }
}

// Create offscreen document if needed
export async function ensureOffscreenDocument() {
    try {
        const exists = await checkOffscreenDocument();
        if (!exists) {
            await chrome.offscreen.createDocument({
                url: 'offscreen.html',
                reasons: ['AUDIO_PLAYBACK'],
                justification: 'Playing audio notifications for ServiceNow updates'
            });
            console.log('Offscreen document created for audio playback');
        }
    } catch (error) {
        console.log('Error creating offscreen document:', error);
    }
}
