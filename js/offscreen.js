// ServiceNow Audio Alerts - Offscreen Script
// Handles audio playback in Manifest V3 service workers

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message && message.type === "PLAY_AUDIO") {
        playAudioNotification();
        sendResponse({ success: true });
    } else if (message && message.type === "STOP_AUDIO") {
        stopCurrentAudio();
        sendResponse({ success: true });
    }
});

// Global audio reference
let currentAudio = null;

async function playAudioNotification() {
    try {
        // Stop any existing audio
        if (currentAudio) {
            currentAudio.pause();
            currentAudio = null;
        }
        
        const audioUrl = chrome.runtime.getURL('sound/alarm-deep_groove.mp3');
        currentAudio = new Audio(audioUrl);
        currentAudio.volume = 0.5;
        await currentAudio.play();
        console.log('Audio played successfully in offscreen document');
    } catch (error) {
        console.error('Could not play audio in offscreen document:', error);
    }
}

function stopCurrentAudio() {
    try {
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
