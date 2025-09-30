// Content script for Google Docs integration (Begoo)
class PersianVoiceTyping {
  constructor() {
    this.isRecording = false;
    this.recognition = null;
    this.speechBuffer = ''; // Accumulates final speech results before processing
    this.currentPromptText = ''; // Holds the text currently displayed in the paste prompt and copied to clipboard
    this.silenceTimer = null; // Timer for detecting pauses in speech
    this.promptTimeout = null; // Timer for auto-hiding the paste prompt
    this.pastePromptActive = false;
    this.settings = {
      silenceDuration: 1200 // Default silence duration in ms
    };
    
    // Ensure UI is initialized only once
    if (!document.getElementById('persian-voice-button')) {
      this.initializeUI();
      this.setupMessageListener();
      this.loadSettings();
      this.setupKeyboardListeners();
    }
  }

  findGoogleDocsEditor() {
    // This iframe is the primary target for all interactions in Google Docs.
    return document.querySelector('.docs-texteventtarget-iframe');
  }

  async loadSettings() {
    try {
      const result = await chrome.storage.local.get(['silenceDuration']);
      if (result.silenceDuration) {
        this.settings.silenceDuration = parseInt(result.silenceDuration, 10);
      }
    } catch (error) {
      console.error('Begoo: Error loading settings:', error);
    }
  }

  initializeUI() {
    // Create floating button
    const button = document.createElement('div');
    button.id = 'persian-voice-button';
    button.title = 'شروع تایپ صوتی فارسی (بگو)';
    button.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" fill="currentColor"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" fill="currentColor"/></svg>`;
    button.style.cssText = `position: fixed; bottom: 20px; right: 20px; width: 60px; height: 60px; border-radius: 50%; background-color: #1a73e8; color: white; display: flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 4px 16px rgba(26, 115, 232, 0.3); z-index: 999999; transition: all 0.3s ease; font-family: 'Vazirmatn', sans-serif;`;
    button.addEventListener('click', () => this.toggleRecording());
    document.body.appendChild(button);

    // Create status indicator
    const status = document.createElement('div');
    status.id = 'persian-voice-status';
    status.style.cssText = `position: fixed; bottom: 90px; right: 20px; padding: 12px 20px; background-color: rgba(0,0,0,0.85); color: white; border-radius: 25px; font-size: 14px; display: none; z-index: 999999; font-family: 'Vazirmatn', 'Tahoma', sans-serif; max-width: 300px; text-align: center; backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.1);`;
    document.body.appendChild(status);

    // Create interim text display
    const interimDisplay = document.createElement('div');
    interimDisplay.id = 'persian-interim-text';
    interimDisplay.style.cssText = `position: fixed; bottom: 130px; right: 20px; padding: 10px 16px; background-color: rgba(26, 115, 232, 0.9); color: white; border-radius: 20px; font-size: 13px; display: none; z-index: 999999; font-family: 'Vazirmatn', 'Tahoma', sans-serif; max-width: 250px; text-align: right; direction: rtl; backdrop-filter: blur(10px);`;
    document.body.appendChild(interimDisplay);

    this.createPastePrompt();
  }

  createPastePrompt() {
    const pastePrompt = document.createElement('div');
    pastePrompt.id = 'persian-paste-prompt';
    pastePrompt.innerHTML = `
      <div class="paste-prompt-content">
        <div class="paste-prompt-header">
          <div class="paste-prompt-icon"><svg width="28" height="28" viewBox="0 0 24 24"><path d="M19 2H14.82C14.4 0.84 13.3 0 12 0C10.7 0 9.6 0.84 9.18 2H5C3.9 2 3 2.9 3 4V18C3 19.1 3.9 20 5 20H19C20.1 20 21 19.1 21 18V4C21 2.9 20.1 2 19 2ZM12 2C12.55 2 13 2.45 13 3C13 3.55 12.55 4 12 4C11.45 4 11 3.55 11 3C11 2.45 11.45 2 12 2ZM19 18H5V4H7V6H17V4H19V18Z" fill="currentColor"/></svg></div>
          <div class="paste-prompt-title">متن در کلیپ‌بورد کپی شد!</div>
          <button class="paste-prompt-close" id="paste-prompt-close">×</button>
        </div>
        <div class="paste-prompt-text" id="paste-prompt-text"></div>
        <div class="paste-prompt-actions">
          <button class="paste-prompt-button secondary" id="copy-again-button">
            <svg width="16" height="16" viewBox="0 0 24 24"><path d="M16 1H4C2.9 1 2 1.9 2 3V17H4V3H16V1ZM19 5H8C6.9 5 6 5.9 6 7V21C6 22.1 6.9 23 8 23H19C20.1 23 21 22.1 21 21V7C21 5.9 20.1 5 19 5ZM19 21H8V7H19V21Z" fill="currentColor"/></svg>
            کپی مجدد
          </button>
          <button class="paste-prompt-button dismiss" id="dismiss-button">بستن</button>
        </div>
        <div class="paste-prompt-instruction">
          <span>برای درج متن، </span>
          <div class="keyboard-shortcut"><kbd>Ctrl</kbd> + <kbd>V</kbd></div>
          <span> را فشار دهید</span>
        </div>
        <div class="paste-prompt-progress"><div class="progress-bar" id="paste-progress-bar"></div></div>
      </div>
    `;
    pastePrompt.style.cssText = `position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%) scale(0); width: 420px; max-width: 90vw; background: white; border-radius: 16px; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3); z-index: 1000000; font-family: 'Vazirmatn', 'Tahoma', sans-serif; direction: rtl; opacity: 0; transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); backdrop-filter: blur(10px); border: 1px solid rgba(255, 255, 255, 0.2); display: none;`;
    document.body.appendChild(pastePrompt);

    const backdrop = document.createElement('div');
    backdrop.id = 'persian-paste-backdrop';
    backdrop.style.cssText = `position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.5); z-index: 999999; opacity: 0; transition: opacity 0.3s ease; display: none; backdrop-filter: blur(3px);`;
    document.body.appendChild(backdrop);

    this.setupPastePromptListeners();
  }

  setupPastePromptListeners() {
    document.getElementById('paste-prompt-close').addEventListener('click', () => this.hidePastePrompt());
    document.getElementById('persian-paste-backdrop').addEventListener('click', () => this.hidePastePrompt());
    document.getElementById('dismiss-button').addEventListener('click', () => this.hidePastePrompt());
    
    document.getElementById('copy-again-button').addEventListener('click', async () => {
        if (this.currentPromptText) { // Use currentPromptText for copy again
            try {
                await navigator.clipboard.writeText(this.currentPromptText);
                this.showStatus('متن مجدداً کپی شد', 'success', 2000);
            } catch (error) {
                console.error('Begoo: Failed to recopy text:', error);
                this.showStatus('خطا در کپی مجدد متن', 'error', 3000);
            }
        }
    });
  }

  setupKeyboardListeners() {
    // Listen for actual paste events on the window to detect manual Ctrl+V
    window.addEventListener('paste', (e) => {
        if (this.pastePromptActive) {
            // Give a tiny delay to ensure the paste operation completes in Docs
            setTimeout(() => this.onPasteDetected(), 50); 
        }
    });
    window.addEventListener('keydown', (e) => {
        if (this.pastePromptActive && e.key === 'Escape') this.hidePastePrompt();
    });
  }

  async showPastePrompt(text) {
    this.pastePromptActive = true;
    this.currentPromptText = text; // Store the text being shown in the prompt

    // --- CRITICAL: Copy text to clipboard immediately ---
    try {
        await navigator.clipboard.writeText(text);
        this.showStatus('متن کپی شد! لطفاً Ctrl+V را بزنید.', 'info', 5000);
    } catch (error) {
        console.error('Begoo: Failed to copy text to clipboard:', error);
        this.showStatus('خطا در کپی متن به کلیپ‌بورد. لطفاً دستی کپی کنید.', 'error', 5000);
        // Even if copy fails, show the prompt so user can manually copy from there
    }

    const pastePrompt = document.getElementById('persian-paste-prompt');
    const backdrop = document.getElementById('persian-paste-backdrop');
    document.getElementById('paste-prompt-text').textContent = text;
    
    backdrop.style.display = 'block';
    pastePrompt.style.display = 'block';
    requestAnimationFrame(() => {
        backdrop.style.opacity = '1';
        pastePrompt.style.opacity = '1';
        pastePrompt.style.transform = 'translate(-50%, -50%) scale(1)';
    });

    this.startProgressBar(document.getElementById('paste-progress-bar'));
    // Reset timeout whenever the prompt content is updated or shown
    if (this.promptTimeout) clearTimeout(this.promptTimeout);
    this.promptTimeout = setTimeout(() => { 
        if (this.pastePromptActive) this.hidePastePrompt();
    }, 15000);
  }
  
  startProgressBar(progressBar) {
    progressBar.style.transition = 'none';
    progressBar.style.width = '100%';
    requestAnimationFrame(() => {
        progressBar.style.transition = 'width 15s linear';
        progressBar.style.width = '0%';
    });
  }

  hidePastePrompt() {
    if (!this.pastePromptActive) return; // Only hide if it's currently active

    this.pastePromptActive = false;
    this.currentPromptText = ''; // Clear prompt text when hidden
    if (this.promptTimeout) {
        clearTimeout(this.promptTimeout);
        this.promptTimeout = null; // Also nullify the timer ID
    }

    const pastePrompt = document.getElementById('persian-paste-prompt');
    const backdrop = document.getElementById('persian-paste-backdrop');
    backdrop.style.opacity = '0';
    pastePrompt.style.opacity = '0';
    pastePrompt.style.transform = 'translate(-50%, -50%) scale(0.8)';
    setTimeout(() => {
      backdrop.style.display = 'none';
      pastePrompt.style.display = 'none';
    }, 300);
  }

  onPasteDetected() {
    // This is called when the user manually pastes (e.g., Ctrl+V)
    this.showStatus('متن با موفقیت درج شد!', 'success', 2000);
    this.hidePastePrompt();
  }

  setupMessageListener() {
    chrome.runtime.onMessage.addListener((request) => {
        if (request.action === 'toggleRecording') this.toggleRecording();
    });
  }

  async toggleRecording() {
    if (this.isRecording) await this.stopRecording();
    else await this.startRecording();
  }

  async startRecording() {
    console.log('Begoo: Attempting to start recording...');
    // --- CRITICAL FIX: Reset all state before starting a new recording ---
    this.resetAllState(); 

    try {
      await navigator.mediaDevices.getUserMedia({ audio: true }); // Just for permission
      this.isRecording = true;
      this.updateUI(true);
      this.setupSpeechRecognition();
      this.recognition.start();
      this.showStatus('آماده برای شنیدن...', 'listening');
      console.log('Begoo: Recording successfully started.');
    } catch (error) {
      console.error('Begoo: Error starting recording:', error);
      this.showStatus('خطا در دسترسی به میکروفون', 'error', 4000);
      this.resetAllState();
      this.updateUI(false);
    }
  }

  setupSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.recognition = new SpeechRecognition();
    this.recognition.continuous = true; 
    this.recognition.interimResults = true;
    this.recognition.lang = 'fa-IR';

    this.recognition.onstart = () => console.log('Begoo: Speech recognition service started.');
    this.recognition.onerror = (e) => {
        console.error('Begoo: Speech recognition error:', e.error, e);
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
            this.showStatus('دسترسی به میکروفون رد شد', 'error', 4000);
        } else if (e.error === 'no-speech') {
            this.showStatus('صدایی تشخیص داده نشد.', 'warning', 3000);
        }
        console.log('Begoo: Error occurred, performing full state reset.');
        this.resetAllState();
        this.updateUI(false); 
    };
    
    // --- CRITICAL FIX: Robust onend handler for continuous restarts ---
    this.recognition.onend = () => { 
        console.log('Begoo: Speech recognition service ended. isRecording:', this.isRecording);
        if (this.isRecording) {
            console.log('Begoo: Attempting to restart recognition from onend.');
            try {
                this.recognition.start(); 
            } catch (e) {
                console.error('Begoo: Error restarting recognition from onend:', e);
                this.showStatus('خطا در راه‌اندازی مجدد تشخیص صدا.', 'error', 4000);
                this.resetAllState();
                this.updateUI(false);
            }
        }
    };

    this.recognition.onresult = (event) => {
      let currentInterimSegment = '';
      
      if (this.silenceTimer) clearTimeout(this.silenceTimer);
      this.silenceTimer = setTimeout(() => {
          console.log('Begoo: Silence timer fired. Triggering processFinalText.');
          this.processFinalText();
          this.silenceTimer = null; 
      }, this.settings.silenceDuration);
      
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          const finalTranscript = transcript.trim();
          if (finalTranscript) {
            this.speechBuffer = this.speechBuffer ? `${this.speechBuffer} ${finalTranscript}` : finalTranscript;
          }
        } else {
          currentInterimSegment += transcript;
        }
      }

      const displayInterim = this.speechBuffer ? `${this.speechBuffer} ${currentInterimSegment}` : currentInterimSegment;
      if (displayInterim.trim()) {
        this.showInterimText(displayInterim.trim());
      } else {
        this.hideInterimText();
      }
    };
  }

  async processFinalText() {
    if (!this.speechBuffer.trim()) { 
        console.log('Begoo: processFinalText called but speechBuffer is empty. Returning.');
        return;
    }

    const textToHandle = this.speechBuffer.trim();
    this.speechBuffer = ''; 
    this.hideInterimText();
    
    console.log('Begoo: Processing final text:', textToHandle);
    this.showPastePrompt(textToHandle);
    
    // --- CRITICAL "MICRO-RESTART" FIX ---
    // Proactively restart the recognition service to ensure it's fresh for the next sentence.
    // This prevents the service from stalling or becoming unresponsive.
    if (this.isRecording && this.recognition) {
        console.log('Begoo: Performing micro-restart of recognition service.');
        this.recognition.stop(); // This will trigger the onend handler, which will then restart it.
    }
  }

  async stopRecording() {
    if (!this.isRecording) return;
    
    console.log('Begoo: Stopping recording...');
    this.isRecording = false; 
    
    if (this.recognition) {
        this.recognition.stop(); 
    }
    
    await this.processFinalText(); 
    
    this.resetAllState();
    this.updateUI(false); 
    console.log('Begoo: Recording stopped and all state reset.');
  }

  resetAllState() {
    console.log('Begoo: resetAllState called. Cleaning up...');
    // Do not set isRecording to false here, as stopRecording handles that.
    // This function is for resetting the other components.
    if (this.recognition) {
        this.recognition.onstart = null;
        this.recognition.onerror = null;
        this.recognition.onend = null;
        this.recognition.onresult = null;
        this.recognition.stop(); 
        this.recognition = null;
    }
    this.speechBuffer = ''; 
    this.currentPromptText = ''; 
    this.pastePromptActive = false; 
    if (this.silenceTimer) {
        clearTimeout(this.silenceTimer);
        this.silenceTimer = null;
    }
    if (this.promptTimeout) {
        clearTimeout(this.promptTimeout);
        this.promptTimeout = null;
    }
    this.hideStatus();
    this.hideInterimText();
    this.hidePastePrompt();
  }

  updateUI(isRecording) {
    const button = document.getElementById('persian-voice-button');
    if (isRecording) {
      button.style.backgroundColor = '#ea4335';
      button.classList.add('recording');
      button.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/></svg>`;
    } else {
      button.style.backgroundColor = '#1a73e8';
      button.classList.remove('recording');
      button.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" fill="currentColor"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" fill="currentColor"/></svg>`;
    }
  }

  showStatus(message, type = 'info', duration = null) {
    const status = document.getElementById('persian-voice-status');
    status.textContent = message;
    const colors = { success: 'rgba(34, 197, 94, 0.9)', error: 'rgba(239, 68, 68, 0.9)', warning: 'rgba(245, 158, 11, 0.9)', listening: 'rgba(59, 130, 246, 0.9)', info: 'rgba(0, 0, 0, 0.85)' };
    status.style.backgroundColor = colors[type] || colors.info;
    status.style.display = 'block';
    if (duration) setTimeout(() => { if (status) status.style.display = 'none'; }, duration);
  }

  hideStatus() {
    const status = document.getElementById('persian-voice-status');
    if (status) status.style.display = 'none';
  }

  showInterimText(text) {
    const interimDisplay = document.getElementById('persian-interim-text');
    interimDisplay.textContent = text; 
    interimDisplay.style.display = 'block';
  }

  hideInterimText() {
    const interimDisplay = document.getElementById('persian-interim-text');
    if(interimDisplay) interimDisplay.style.display = 'none';
  }
}

const style = document.createElement('style');
style.textContent = `
  .paste-prompt-content { padding: 24px; text-align: center; }
  .paste-prompt-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; padding-bottom: 16px; border-bottom: 1px solid #e5e7eb; }
  .paste-prompt-icon { color: #1a73e8; margin-left: 12px; }
  .paste-prompt-title { font-size: 18px; font-weight: 600; color: #1f2937; flex: 1; text-align: right; }
  .paste-prompt-close { background: none; border: none; font-size: 24px; color: #6b7280; cursor: pointer; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border-radius: 50%; transition: all 0.2s ease; }
  .paste-prompt-close:hover { background-color: #f3f4f6; color: #374151; }
  .paste-prompt-text { background-color: #f8fafc; border: 2px dashed #cbd5e1; border-radius: 12px; padding: 16px; margin: 16px 0; font-size: 14px; color: #475569; text-align: right; direction: rtl; min-height: 60px; display: flex; align-items: center; justify-content: center; font-family: 'Vazirmatn', 'Tahoma', sans-serif; line-height: 1.5; }
  .paste-prompt-actions { display: flex; gap: 8px; margin: 20px 0; flex-wrap: wrap; justify-content: center; }
  .paste-prompt-button { padding: 12px 20px; border: none; border-radius: 8px; font-size: 14px; font-weight: 500; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; transition: all 0.2s ease; font-family: 'Vazirmatn', 'Tahoma', sans-serif; min-width: 120px; }
  .paste-prompt-button.secondary { background-color: #f3f4f6; color: #374151; border: 1px solid #d1d5db; }
  .paste-prompt-button.secondary:hover { background-color: #e5e7eb; transform: translateY(-1px); }
  .paste-prompt-button.dismiss { background-color: #e5e7eb; color: #4b5563; }
  .paste-prompt-button.dismiss:hover { background-color: #d1d5db; }
  .paste-prompt-instruction { display: flex; align-items: center; justify-content: center; gap: 8px; color: #6b7280; font-size: 13px; margin-top: 16px; flex-wrap: wrap; }
  .keyboard-shortcut { display: flex; gap: 4px; align-items: center; }
  .keyboard-shortcut kbd { background-color: #f3f4f6; border: 1px solid #d1d5db; border-radius: 4px; padding: 4px 8px; font-size: 12px; font-family: monospace; color: #374151; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1); }
  .paste-prompt-progress { width: 100%; height: 4px; background-color: #f3f4f6; border-radius: 2px; overflow: hidden; margin-top: 16px; }
  .progress-bar { height: 100%; background: linear-gradient(90deg, #1a73e8, #4285f4); border-radius: 2px; width: 100%; }
  #persian-voice-button.recording { animation: pulse 1.5s infinite; }
  @keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(234, 67, 53, 0.7); } 70% { box-shadow: 0 0 0 10px rgba(234, 67, 53, 0); } 100% { box-shadow: 0 0 0 0 rgba(234, 67, 53, 0); } }
  .spinner { animation: spin 1s linear infinite; }
  @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
`;
document.head.appendChild(style);

// Initialize the extension
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    if (!window.persianVoiceTypingInstance) {
        window.persianVoiceTypingInstance = new PersianVoiceTyping();
    }
  });
} else {
  if (!window.persianVoiceTypingInstance) {
    window.persianVoiceTypingInstance = new PersianVoiceTyping();
  }
}