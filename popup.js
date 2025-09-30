document.addEventListener('DOMContentLoaded', () => {
  // Get references to the new UI elements
  const mainActionButton = document.getElementById('main-action-button');
  const controlPod = document.getElementById('control-pod');
  const statusText = document.getElementById('status-text');
  const buttonTextHelper = document.getElementById('button-text-helper');

  // This function updates the entire UI based on the recording state
  function updateUI(isRecording) {
    if (isRecording) {
      // Apply recording styles
      controlPod.classList.add('is-recording');
      statusText.textContent = 'در حال ضبط...';
      buttonTextHelper.textContent = 'توقف ضبط';
    } else {
      // Apply idle styles
      controlPod.classList.remove('is-recording');
      statusText.textContent = 'آماده برای شروع';
      buttonTextHelper.textContent = 'شروع ضبط';
    }
  }

  // --- Event Listener for the main button ---
  mainActionButton.addEventListener('click', () => {
    // Find the active tab and send a message to the content script to toggle recording
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].id) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'toggleRecording' }, (response) => {
          if (chrome.runtime.lastError) {
            // This can happen if the content script is not injected on the page
            console.error('Begoo Error:', chrome.runtime.lastError.message);
            statusText.textContent = 'صفحه را رفرش کنید';
          }
        });
        // Close the popup after the user clicks the button for a smoother experience
        window.close();
      } else {
        console.error("Begoo: Could not find active tab.");
      }
    });
  });

  // --- Check initial state when the popup opens ---
  // We need to ask the content script what the current state is to display the UI correctly
  try {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].id) {
        chrome.tabs.sendMessage(
          tabs[0].id,
          { action: 'getRecordingState' },
          (response) => {
            if (chrome.runtime.lastError) {
              // This handles cases where the content script isn't on the page (e.g., a new tab)
              console.log("Begoo: Content script not active. Defaulting to 'off' state.");
              updateUI(false);
            } else if (response && typeof response.isRecording !== 'undefined') {
              updateUI(response.isRecording);
            } else {
              updateUI(false);
            }
          }
        );
      } else {
        // If there's no active tab for some reason
        updateUI(false);
      }
    });
  } catch (error) {
    console.error("Begoo: Error checking initial state.", error);
    updateUI(false);
  }
});