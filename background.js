// Background service worker
let recordingState = {
  isRecording: false,
  tabId: null
};

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'startRecording') {
    recordingState.isRecording = true;
    recordingState.tabId = sender.tab?.id;
    
    // Update badge
    chrome.action.setBadgeText({ text: 'ON' });
    chrome.action.setBadgeBackgroundColor({ color: '#ea4335' });
    
    sendResponse({ success: true });
  } else if (request.action === 'stopRecording') {
    recordingState.isRecording = false;
    recordingState.tabId = null;
    
    // Clear badge
    chrome.action.setBadgeText({ text: '' });
    
    sendResponse({ success: true });
  } else if (request.action === 'getRecordingStatus') {
    sendResponse({ isRecording: recordingState.isRecording });
  }
});

// Handle keyboard shortcuts
chrome.commands.onCommand.addListener((command) => {
  if (command === 'toggle-recording') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].url.includes('docs.google.com/document')) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'toggleRecording' });
      }
    });
  }
});

// Clean up when tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  if (recordingState.tabId === tabId) {
    recordingState.isRecording = false;
    recordingState.tabId = null;
    chrome.action.setBadgeText({ text: '' });
  }
});