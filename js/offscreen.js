// ServiceNow Audio Alerts - Offscreen Script
// Handles audio playback in Manifest V3 service workers

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message && message.type === "PLAY_AUDIO") {
        playAudioNotification(message.audioData, message.settings);
        sendResponse({ success: true });
    } else if (message && message.type === "STOP_AUDIO") {
        stopCurrentAudio();
        sendResponse({ success: true });
    }
});

// Global audio reference
let currentAudio = null;
let audioTimeout = null;

async function playAudioNotification(audioData = null, settings = null) {
    try {
        // Stop any existing audio and clear timeout
        stopCurrentAudio();
        
        // Use provided audio data or default
        const audioUrl = audioData || chrome.runtime.getURL('sound/alarm-deep_groove.mp3');
        
        // Use provided settings or defaults
        const playbackSettings = {
            volume: settings?.volume || 0.7,
            duration: settings?.duration || 5000,
            loop: settings?.loop || false
        };
        
        currentAudio = new Audio(audioUrl);
        currentAudio.volume = playbackSettings.volume;
        currentAudio.loop = playbackSettings.loop;
        
        await currentAudio.play();
        console.log('Audio played successfully in offscreen document with custom settings:', playbackSettings);
        
        // Set timeout to stop audio after specified duration (if not looping)
        if (!playbackSettings.loop && playbackSettings.duration > 0) {
            audioTimeout = setTimeout(() => {
                stopCurrentAudio();
            }, playbackSettings.duration);
        }
        
    } catch (error) {
        console.error('Could not play audio in offscreen document:', error);
    }
}

function stopCurrentAudio() {
    try {
        // Clear any pending timeout
        if (audioTimeout) {
            clearTimeout(audioTimeout);
            audioTimeout = null;
        }
        
        if (currentAudio) {
            currentAudio.pause();
            currentAudio.currentTime = 0;
            currentAudio = null;
            console.log('Audio stopped successfully in offscreen document');
        }
    } catch (error) {
        console.error('Could not stop audio in offscreen document:', error);
    }
}
