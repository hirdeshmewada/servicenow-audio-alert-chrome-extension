// ServiceNow Audio Alerts - Offscreen Script
// Handles audio playback in Manifest V3 service workers

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message && message.type === "PLAY_AUDIO") {
        playAudioNotification();
        sendResponse({ success: true });
    }
});

async function playAudioNotification() {
    try {
        const audioUrl = chrome.runtime.getURL('sound/alarm-deep_groove.mp3');
        const audio = new Audio(audioUrl);
        audio.volume = 0.5;
        await audio.play();
        console.log('Audio played successfully in offscreen document');
    } catch (error) {
        console.error('Could not play audio in offscreen document:', error);
    }
}
