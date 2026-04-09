/**
 * Popup UI Logic - Controls recording and displays steps
 * Supports: recording controls, step management, CSV/Excel/Playwright/Selenium/JSON/BDD export
 */

let isRecording = false;
let recordedSteps = [];
let updateInterval = null;
let lastStepsJson = '';
let isEditing = false;

// Initialize
document.addEventListener('DOMContentLoaded', initialize);

async function initialize() {
    // 1. Setup event listeners IMMEDIATELY so buttons work even if state loading is slow
    setupEventListeners();

    // 2. Load initial state
    await loadRecordingState();
    await loadSteps();

    // 3. Start periodic updates
    startPeriodicUpdates();

    // 4. Show Groq/Gemini key status
    await refreshApiKeyStatus();
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
    // Modal Close hooks (CRITICAL: Moved to top so they always attach)
    const cancelClearBtn = document.getElementById('cancelClearBtn');
    const confirmClearBtn = document.getElementById('confirmClearBtn');
    if (cancelClearBtn) cancelClearBtn.addEventListener('click', handleCancelClear);
    if (confirmClearBtn) confirmClearBtn.addEventListener('click', handleConfirmClear);

    // Recording Controls
    document.getElementById('startRecording').addEventListener('click', handleStartRecording);
    document.getElementById('stopRecording').addEventListener('click', handleStopRecording);
    document.getElementById('clearSteps').addEventListener('click', handleClearSteps);
    document.getElementById('resumeRecording').addEventListener('click', handleResumeRecording);
    document.getElementById('addTestCase').addEventListener('click', handleAddTestCase);

    // Settings
    document.getElementById('settingsToggle').addEventListener('click', toggleSettings);
    document.getElementById('saveApiKey').addEventListener('click', handleSaveApiKey);
    document.getElementById('saveGeminiApiKey').addEventListener('click', handleSaveGeminiApiKey);

    // Export buttons
    document.getElementById('exportManual').addEventListener('click', () => handleExport('manual'));
    document.getElementById('exportExcel').addEventListener('click', () => handleExport('excel'));
    document.getElementById('exportPlaywright').addEventListener('click', () => handleExport('playwright'));
    document.getElementById('exportSelenium').addEventListener('click', () => handleExport('selenium'));
    document.getElementById('exportJson').addEventListener('click', () => handleExport('json'));
    document.getElementById('exportBdd').addEventListener('click', () => handleExport('bdd'));

    // AI Flow Summary
    const exportFlowGroq = document.getElementById('exportFlowSummary');
    const exportFlowGemini = document.getElementById('exportFlowSummaryGemini');
    if (exportFlowGroq) exportFlowGroq.addEventListener('click', () => handleExportFlowSummary('groq'));
    if (exportFlowGemini) exportFlowGemini.addEventListener('click', () => handleExportFlowSummary('gemini'));
    
    // AI Structured Steps
    const exportStructGroq = document.getElementById('exportStructuredGroq');
    const exportStructGemini = document.getElementById('exportStructuredGemini');
    if (exportStructGroq) exportStructGroq.addEventListener('click', () => handleExportStructured('groq'));
    if (exportStructGemini) exportStructGemini.addEventListener('click', () => handleExportStructured('gemini'));

    // AI Toggle
    const toggleAiBtn = document.getElementById('toggleAiOptionsBtn');
    if (toggleAiBtn) {
        toggleAiBtn.addEventListener('click', () => {
            const panel = document.getElementById('aiOptionsPanel');
            panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
        });
    }

    // Clear API Keys
    const clearGroqKey = document.getElementById('clearGroqKey');
    const clearGeminiKey = document.getElementById('clearGeminiKey');
    if (clearGroqKey) clearGroqKey.addEventListener('click', () => handleClearApiKey('groq'));
    if (clearGeminiKey) clearGeminiKey.addEventListener('click', () => handleClearApiKey('gemini'));
}

/**
 * Load recording state
 */
async function loadRecordingState() {
    try {
        const response = await chrome.runtime.sendMessage({ action: 'getRecordingState' });
        isRecording = response.isRecording;
        updateUI();
        
        if (isRecording || response.isPaused) {
            // Find the most likely target tab: the active one in the current window
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            // Only send if it's a real web page (not our own popup tab or chrome://)
            if (tab && tab.url && (tab.url.startsWith('http') || tab.url.startsWith('file'))) {
                chrome.tabs.sendMessage(tab.id, { action: 'showPanel' }).catch(() => {});
            } else {
                // If the popup itself is the active tab (opened as detail view), 
                // we should find the last focused window's active tab
                const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
                const targetTab = tabs.find(t => t.url && t.url.startsWith('http'));
                if (targetTab) {
                    chrome.tabs.sendMessage(targetTab.id, { action: 'showPanel' }).catch(() => {});
                }
            }
        }
    } catch (error) {
        console.error('Error loading recording state:', error);
    }
}

/**
 * Load steps from storage
 */
async function loadSteps() {
    if (isEditing) return; // Prevent DOM wiping while a user is typing
    
    try {
        const response = await chrome.runtime.sendMessage({ action: 'getSteps' });
        const newSteps = response.steps || [];
        const newStepsJson = JSON.stringify(newSteps);
        
        // Prevent aggressive DOM thrashing (freezing)
        if (newStepsJson !== lastStepsJson || newSteps.length === 0) {
            recordedSteps = newSteps;
            lastStepsJson = newStepsJson;
            renderSteps();
        }
    } catch (error) {
        console.error('Error loading steps:', error);
    }
}

/**
 * Start periodic updates
 */
function startPeriodicUpdates() {
    updateInterval = setInterval(async () => {
        await loadSteps();
        await loadRecordingState();
    }, 1000);
}

/**
 * Handle start recording
 * Sends to background (not directly to content script) so background
 * can inject the content script first if it isn't already present.
 */
async function handleStartRecording() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) throw new Error('No active tab found');

        // Route through background so it can inject content script if needed
        const response = await chrome.runtime.sendMessage({
            action: 'startRecording',
            tabId: tab.id
        });

        if (response && response.success) {
            isRecording = true;
            recordedSteps = [];
            updateUI();
            renderSteps();
            window.close(); // Closes the popup implicitly so the browser reveals the page!
        } else {
            throw new Error(response?.error || 'Unknown error');
        }
    } catch (error) {
        console.error('Error starting recording:', error);
        alert('Failed to start recording.\n\nPlease:\n1. Refresh the page (F5)\n2. Click Start Recording again\n\nNote: Recording does not work on chrome:// or extension pages.');
    }
}

/**
 * Handle resume recording
 */
async function handleResumeRecording() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) throw new Error('No active tab found');

        const response = await chrome.runtime.sendMessage({
            action: 'resumeRecording',
            tabId: tab.id
        });

        if (response && response.success) {
            isRecording = true;
            updateUI();
            renderSteps();
        } else {
            throw new Error(response?.error || 'Unknown error');
        }
    } catch (error) {
        console.error('Error resuming recording:', error);
        alert('Failed to resume recording.\n\nPlease refresh the page and try again.');
    }
}

/**
 * Handle Add Test Case
 */
async function handleAddTestCase() {
    const currentGroupsCount = recordedSteps.filter(s => s.eventType === 'group').length;
    const testCaseName = `Recorded Steps ${currentGroupsCount + 2}`;

    await chrome.runtime.sendMessage({
        action: 'stepRecorded',
        step: {
            id: 'grp_' + Date.now(),
            timestamp: Date.now(),
            eventType: 'group',
            actionName: testCaseName,
            element: null,
            value: null,
            assertionType: null
        }
    });
    
    await loadSteps();

    // Visual notification
    const btn = document.getElementById('addTestCase');
    const originalContent = btn.innerHTML;
    btn.innerHTML = `<span style="font-size:12px; font-weight:bold; color:#a5b4fc;">✅ Started!</span>`;
    setTimeout(() => { btn.innerHTML = originalContent; }, 1500);
}

/**
 * Handle stop recording

 * Routed through background for consistency.
 */
async function handleStopRecording() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab) {
            await chrome.runtime.sendMessage({
                action: 'stopRecording',
                tabId: tab.id
            });
        }
        isRecording = false;
        updateUI();
        window.close(); // Close explicitly when they hit stop from popup too
    } catch (error) {
        console.error('Error stopping recording:', error);
        // Update UI regardless
        isRecording = false;
        updateUI();
    }
}

/**
 * Handle clear steps Modal presentation
 */
function handleClearSteps() {
    document.getElementById('customConfirmModal').style.display = 'flex';
}

function handleCancelClear() {
    document.getElementById('customConfirmModal').style.display = 'none';
}

/**
 * Confirm clear steps execution
 * Routed through background for consistency.
 */
async function handleConfirmClear() {
    document.getElementById('customConfirmModal').style.display = 'none';

    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab) {
            await chrome.runtime.sendMessage({
                action: 'clearSteps',
                tabId: tab.id
            });
        } else {
            // No tab — just clear storage directly
            await chrome.runtime.sendMessage({ action: 'clearSteps', tabId: null });
        }
        recordedSteps = [];
        renderSteps();
    } catch (error) {
        console.error('Error clearing steps:', error);
        // Clear locally even if message fails
        recordedSteps = [];
        renderSteps();
    }
}

/**
 * Update UI based on recording state
 */
function updateUI() {
    const startBtn = document.getElementById('startRecording');
    const stopBtn = document.getElementById('stopRecording');
    const resumeBtn = document.getElementById('resumeRecording');
    const addTestCaseBtn = document.getElementById('addTestCase');
    const indicator = document.getElementById('recordingIndicator');
    const stepCount = document.getElementById('stepCount');

    if (isRecording) {
        startBtn.disabled = true;
        stopBtn.disabled = false;
        resumeBtn.disabled = true;
        addTestCaseBtn.disabled = false;
        indicator.classList.add('active');
    } else {
        startBtn.disabled = false;
        stopBtn.disabled = true;
        resumeBtn.disabled = recordedSteps.length === 0;
        addTestCaseBtn.disabled = recordedSteps.length === 0;
        indicator.classList.remove('active');
    }

    stepCount.textContent = recordedSteps.length;
}

/**
 * Render steps list
 */
function renderSteps() {
    const stepsList = document.getElementById('stepsList');

    if (recordedSteps.length === 0) {
        stepsList.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📝</div>
        <p>No steps recorded yet</p>
        <p class="empty-hint">Click "Start Recording" to begin</p>
      </div>
    `;
        return;
    }

    let finalHtml = '';
    let currentGroupHtml = '';
    let inGroup = false;
    let groupCounter = 0;
    let localStepNo = 1;

    // Check if the first step is a group. If not, start with a default "Recorded Steps 1"
    const firstStepIsGroup = recordedSteps[0] && recordedSteps[0].eventType === 'group';
    
    if (!firstStepIsGroup) {
        groupCounter++;
        inGroup = true;
        finalHtml += `<details class="step-group" open><summary>📁 Recorded Steps ${groupCounter}</summary><div class="step-group-content">`;
    }

    recordedSteps.forEach((step, index) => {
        if (step.eventType === 'group') {
            // Close previous group if exists
            if (inGroup) {
                finalHtml += currentGroupHtml + `</div></details>`;
                currentGroupHtml = '';
            }
            inGroup = true;
            groupCounter++;
            localStepNo = 1; // RESET
            
            // Generate a default name if it was an empty name, or use the provided name
            const groupName = step.actionName || `Recorded Steps ${groupCounter}`;
            
            finalHtml += `<details class="step-group" open><summary>📁 ${escapeHtml(groupName)} <button class="step-btn-delete" data-action="delete" data-step-id="${step.id}" style="margin-left:auto; background:none; border:none; padding:0; font-size:11px;">✕</button></summary><div class="step-group-content">`;
        } else {
            const stepHtml = createStepHTML(step, localStepNo - 1);
            localStepNo++;
            
            if (inGroup) {
                currentGroupHtml += stepHtml;
            } else {
                finalHtml += stepHtml;
            }
        }
    });

    // Close trailing group
    if (inGroup) {
        finalHtml += currentGroupHtml + `</div></details>`;
    }

    stepsList.innerHTML = finalHtml;

    // Attach event listeners to step actions
    attachStepEventListeners();
}

/**
 * Get assertion badge label & color
 */
function getAssertionBadge(step) {
    if (step.eventType !== 'assertion') return '';
    const badges = {
        visibility: { label: '👁️ Visibility', color: '#22c55e' },
        text: { label: '🔤 Text', color: '#3b82f6' },
        value: { label: '✏️ Value', color: '#f59e0b' }
    };
    const badge = badges[step.assertionType] || { label: '✅ Assert', color: '#6366f1' };
    return `<span style="
        display:inline-block;
        background:${badge.color}22;
        color:${badge.color};
        border:1px solid ${badge.color}55;
        border-radius:4px;
        font-size:9px;
        font-weight:700;
        padding:1px 6px;
        margin-left:6px;
        letter-spacing:0.3px;
        vertical-align:middle;
    ">${badge.label}</span>`;
}

/**
 * Create HTML for a step
 */
function createStepHTML(step, index) {
    const time = new Date(step.timestamp).toLocaleTimeString();
    const xpath = step.element?.xpath?.relative || 'N/A';
    const css = step.element?.css || 'N/A';
    const isAssertion = step.eventType === 'assertion';
    const assertBadge = getAssertionBadge(step);

    return `
    <div class="step-item${isAssertion ? ' step-assertion' : ''}" data-step-id="${step.id}">
      <div class="step-header">
        <span class="step-number">Step ${index + 1}</span>
        <span class="step-time">${time}</span>
      </div>
      <div class="step-action" data-editable="true">
        ${step.actionName}${assertBadge}
      </div>
      <div class="step-details">
        <div class="step-detail-row">
          <span class="step-detail-label">Type:</span>
          <span class="step-detail-value">${step.eventType}${step.assertionType ? ' / ' + step.assertionType : ''}</span>
        </div>
        ${step.element ? `
          <div class="step-detail-row">
            <span class="step-detail-label">XPath:</span>
            <span class="step-detail-value">${xpath}</span>
          </div>
          <div class="step-detail-row">
            <span class="step-detail-label">CSS:</span>
            <span class="step-detail-value">${css}</span>
          </div>
        ` : ''}
        ${(step.value !== null && step.value !== undefined && step.value !== '') ? `
          <div class="step-detail-row">
            <span class="step-detail-label">Value:</span>
            <span class="step-detail-value">${step.value}</span>
          </div>
        ` : ''}
      </div>
      <div class="step-actions">
        <button class="step-btn step-btn-edit" data-action="edit">✏️ Edit</button>
        <button class="step-btn step-btn-delete" data-action="delete">🗑️ Delete</button>
      </div>
    </div>
  `;
}

/**
 * Attach event listeners to step actions
 */
function attachStepEventListeners() {
    // Edit buttons
    document.querySelectorAll('.step-btn-edit').forEach(btn => {
        btn.addEventListener('click', handleEditStep);
    });

    // Delete buttons
    document.querySelectorAll('.step-btn-delete').forEach(btn => {
        btn.addEventListener('click', handleDeleteStep);
    });
}

/**
 * Handle edit step
 */
function handleEditStep(event) {
    isEditing = true; // Lock DOM rendering 
    const stepItem = event.target.closest('.step-item');
    const stepId = stepItem.dataset.stepId;
    const step = recordedSteps.find(s => s.id === stepId);
    if (!step) {
        isEditing = false;
        return;
    }

    // Create a form inside stepItem
    const formHtml = `
        <div class="edit-step-form" style="display:flex; flex-direction:column; gap:8px; padding:10px; background:rgba(255,255,255,0.05); border-radius:6px; margin-top:8px;">
            <input type="text" id="editActionName" value="${escapeHtml(step.actionName)}" style="padding:4px; width:100%; border-radius:4px;" />
            
            <div style="display:flex; gap:8px;">
                <input type="text" id="editEventType" value="${escapeHtml(step.eventType)}" placeholder="Event Type" style="flex:1; padding:4px;" />
                <input type="text" id="editValue" value="${escapeHtml(step.value || '')}" placeholder="Value" style="flex:1; padding:4px;" />
            </div>
            
            ${step.element ? `
            <input type="text" id="editXPath" value="${escapeHtml(step.element.xpath?.relative || '')}" placeholder="XPath" style="padding:4px; width:100%;" />
            <input type="text" id="editCss" value="${escapeHtml(step.element.css || '')}" placeholder="CSS Selector" style="padding:4px; width:100%;" />
            ` : ''}
            
            <div style="display:flex; justify-content:flex-end; gap:8px;">
                <button type="button" id="saveEditBtn" style="padding:4px 12px; background:#4f46e5; color:white; border:none; border-radius:4px; cursor:pointer;">Save</button>
                <button type="button" id="cancelEditBtn" style="padding:4px 12px; background:transparent; color:#9ca3af; border:1px solid #4b5563; border-radius:4px; cursor:pointer;">Cancel</button>
            </div>
        </div>
    `;

    // Disable edit button so we don't spam it
    const editBtn = stepItem.querySelector('.step-btn-edit');
    editBtn.style.display = 'none';

    const detailsDiv = stepItem.querySelector('.step-details');
    detailsDiv.insertAdjacentHTML('afterend', formHtml);

    const formDiv = stepItem.querySelector('.edit-step-form');

    formDiv.querySelector('#saveEditBtn').addEventListener('click', async () => {
        const updates = {
            actionName: formDiv.querySelector('#editActionName').value.trim(),
            eventType: formDiv.querySelector('#editEventType').value.trim(),
            value: formDiv.querySelector('#editValue').value.trim() || null
        };

        if (step.element) {
            updates.element = {
                ...step.element,
                css: formDiv.querySelector('#editCss').value.trim(),
                xpath: {
                    ...step.element.xpath,
                    relative: formDiv.querySelector('#editXPath').value.trim()
                }
            };
        }

        await chrome.runtime.sendMessage({
            action: 'updateStep',
            stepId: stepId,
            updates: updates
        });
        
        isEditing = false;
        lastStepsJson = ''; // Force re-render on next tick
        await loadSteps();
    });

    formDiv.querySelector('#cancelEditBtn').addEventListener('click', () => {
        formDiv.remove();
        editBtn.style.display = 'inline-block';
        isEditing = false;
    });
}

function escapeHtml(unsafe) {
    return String(unsafe || '')
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

/**
 * Handle delete step
 */
async function handleDeleteStep(event) {
    const btn = event.target;
    const stepId = btn.dataset.stepId || btn.closest('.step-item')?.dataset.stepId;

    if (!stepId) return;

    if (confirm('Delete this step?')) {
        await chrome.runtime.sendMessage({
            action: 'deleteStep',
            stepId: stepId
        });
        await loadSteps();
    }
}

/**
 * Handle export
 */
async function handleExport(format) {
    if (recordedSteps.length === 0) {
        alert('No steps to export. Please record some steps first.');
        return;
    }

    let content = '';
    let filename = '';
    let mimeType = 'text/plain';
    let isExcel = false;

    switch (format) {
        case 'manual':
            content = Exporter.exportManualTestCase(recordedSteps);
            filename = 'manual-test-case.csv';
            mimeType = 'text/csv';
            break;

        case 'excel':
            try {
                const xlsxData = Exporter.exportExcel(recordedSteps);
                filename = 'manual-test-case.xlsx';
                downloadBinaryFile(xlsxData, filename, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
                return; // early return; binary download handled separately
            } catch (err) {
                alert('Excel export failed: ' + err.message + '\n\nMake sure xlsx.full.min.js is present in the extension folder.');
                console.error('Excel export error:', err);
                return;
            }

        case 'playwright':
            content = Exporter.exportPlaywright(recordedSteps);
            filename = 'test.spec.js';
            mimeType = 'text/javascript';
            break;

        case 'selenium':
            content = Exporter.exportSelenium(recordedSteps);
            filename = 'RecordedTest.java';
            mimeType = 'text/x-java';
            break;

        case 'json':
            content = Exporter.exportJSON(recordedSteps);
            filename = 'recorded-steps.json';
            mimeType = 'application/json';
            break;

        case 'bdd':
            content = Exporter.exportBDD(recordedSteps);
            filename = 'test.feature';
            mimeType = 'text/plain';
            break;
    }

    downloadFile(content, filename, mimeType);
}

/**
 * Download a text file
 */
function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/**
 * Download a binary file (e.g., Excel)
 */
function downloadBinaryFile(data, filename, mimeType) {
    const blob = new Blob([data], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Cleanup on unload
window.addEventListener('unload', () => {
    if (updateInterval) {
        clearInterval(updateInterval);
    }
});

// ─────────────────────────────────────────────────────────
//  Settings Panel (Groq API Key)
// ─────────────────────────────────────────────────────────

function toggleSettings() {
    const panel = document.getElementById('settingsPanel');
    const isHidden = panel.style.display === 'none' || !panel.style.display;
    panel.style.display = isHidden ? 'block' : 'none';
    if (isHidden) refreshApiKeyStatus();
}

async function handleSaveApiKey() {
    const input = document.getElementById('groqApiKeyInput');
    const status = document.getElementById('apiKeyStatus');
    const key = input.value.trim();

    if (!key) {
        status.textContent = '⚠️ Please enter a key first.';
        status.className = 'api-key-status unset';
        return;
    }

    try {
        await GroqService.saveApiKey(key);
        input.value = '';
        status.textContent = '✅ API key saved securely.';
        status.className = 'api-key-status set';
    } catch (err) {
        status.textContent = '❌ Failed to save key: ' + err.message;
        status.className = 'api-key-status unset';
    }
}

async function refreshApiKeyStatus() {
    const status = document.getElementById('apiKeyStatus');
    const geminiStatus = document.getElementById('geminiApiKeyStatus');

    if (status) {
        const key = await GroqService.loadApiKey();
        if (key) {
            status.textContent = `✅ API key is set (${key.slice(0, 8)}…)`;
            status.className = 'api-key-status set';
        } else {
            status.textContent = '⚠️ No Groq API key saved.';
            status.className = 'api-key-status unset';
        }
    }

    if (geminiStatus) {
        let GeminiServiceObj = typeof GeminiService !== 'undefined' ? GeminiService : window.GeminiService;
        if (GeminiServiceObj) {
            const key = await GeminiServiceObj.loadApiKey();
            if (key) {
                geminiStatus.textContent = `✅ API key is set (${key.slice(0, 8)}…)`;
                geminiStatus.className = 'api-key-status set';
            } else {
                geminiStatus.textContent = '⚠️ No Gemini API key saved.';
                geminiStatus.className = 'api-key-status unset';
            }
        }
    }
}

async function handleSaveGeminiApiKey() {
    const input = document.getElementById('geminiApiKeyInput');
    const status = document.getElementById('geminiApiKeyStatus');
    const key = input.value.trim();

    if (!key) {
        status.textContent = '⚠️ Please enter a key first.';
        status.className = 'api-key-status unset';
        return;
    }

    try {
        let GeminiServiceObj = typeof GeminiService !== 'undefined' ? GeminiService : window.GeminiService;
        await GeminiServiceObj.saveApiKey(key);
        input.value = '';
        status.textContent = '✅ API key saved securely.';
        status.className = 'api-key-status set';
    } catch (err) {
        status.textContent = '❌ Failed to save key: ' + err.message;
        status.className = 'api-key-status unset';
    }
}

async function handleClearApiKey(provider) {
    if (provider === 'groq') {
        await GroqService.saveApiKey('');
        const status = document.getElementById('apiKeyStatus');
        if (status) {
            status.textContent = '🗑️ Groq API key cleared.';
            status.className = 'api-key-status unset';
        }
    } else if (provider === 'gemini') {
        let GeminiServiceObj = typeof GeminiService !== 'undefined' ? GeminiService : window.GeminiService;
        await GeminiServiceObj.saveApiKey('');
        const status = document.getElementById('geminiApiKeyStatus');
        if (status) {
            status.textContent = '🗑️ Gemini API key cleared.';
            status.className = 'api-key-status unset';
        }
    }
}

// ─────────────────────────────────────────────────────────
//  AI Flow Summary Export
// ─────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────
//  AI Structured Steps Export
// ─────────────────────────────────────────────────────────

async function handleExportStructured(aiServiceType) {
    if (recordedSteps.length === 0) {
        alert('No steps to export. Please record some steps first.');
        return;
    }

    const btnId = aiServiceType === 'groq' ? 'exportStructuredGroq' : 'exportStructuredGemini';
    const btn = document.getElementById(btnId);
    const status = document.getElementById('flowSummaryStatus');
    const originalText = btn.innerHTML;

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Generating…';
    status.textContent = '';
    status.className = 'flow-status';

    try {
        let AiServiceObj = aiServiceType === 'groq' ? GroqService : (typeof GeminiService !== 'undefined' ? GeminiService : window.GeminiService);
        const apiKey = await AiServiceObj.loadApiKey();

        if (!apiKey) {
            alert(`No ${aiServiceType.toUpperCase()} API key found. Please save one in Settings.`);
            return;
        }

        status.textContent = `🤖 Calling ${aiServiceType} AI…`;
        status.className = 'flow-status loading';
        
        // Optimize input context: Send simplified manual rows instead of raw JSON
        const manualRows = Exporter.buildManualTestRows(recordedSteps);
        // Remove headers and convert to string for AI
        const stepsText = manualRows.slice(1).map(row => row.join(' | ')).join('\n');
        
        let structuredData = await AiServiceObj.structureSteps(stepsText, apiKey);
        
        status.textContent = '✅ Structured steps ready!';
        status.className = 'flow-status success';

        const xlsxData = Exporter.exportStructuredExcel(structuredData);
        downloadBinaryFile(
            xlsxData,
            `structured-steps-${aiServiceType}.xlsx`,
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );

        setTimeout(() => {
            status.textContent = '';
            status.className = 'flow-status';
        }, 3000);

    } catch (err) {
        console.error('Structured steps export failed:', err);
        status.textContent = '❌ Export failed: ' + err.message;
        status.className = 'flow-status error';
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}
/**
 * Handle AI Flow Summary Export (Unified for Groq and Gemini)
 */
async function handleExportFlowSummary(aiType = 'groq') {
    if (recordedSteps.length === 0) {
        alert('No steps to export. Please record some steps first.');
        return;
    }

    const btnId = aiType === 'groq' ? 'exportFlowSummary' : 'exportFlowSummaryGemini';
    const btn = document.getElementById(btnId);
    const status = document.getElementById('flowSummaryStatus');
    const originalText = btn.innerHTML;

    // Show loading state
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Working…';
    status.textContent = '';
    status.className = 'flow-status';

    let aiSummary = null;

    try {
        const AiServiceObj = aiType === 'groq' ? GroqService : (typeof GeminiService !== 'undefined' ? GeminiService : window.GeminiService);
        const apiKey = await AiServiceObj.loadApiKey();

        if (apiKey) {
            status.textContent = `🤖 Calling ${aiType.toUpperCase()} AI…`;
            status.className = 'flow-status loading';
            try {
                aiSummary = await AiServiceObj.summarizeSteps(recordedSteps, apiKey);
                status.textContent = '✅ AI summary ready!';
                status.className = 'flow-status success';
            } catch (aiErr) {
                console.warn(`${aiType.toUpperCase()} API call failed, using auto-summary:`, aiErr);
                status.textContent = `⚠️ AI failed — using auto-summary`;
                status.className = 'flow-status error';
            }
        } else {
            status.textContent = `ℹ️ No ${aiType.toUpperCase()} key — using auto-summary`;
            status.className = 'flow-status loading';
        }

        // Generate Excel (AI or auto)
        const xlsxData = Exporter.exportFlowSummaryExcel(recordedSteps, aiSummary);
        downloadBinaryFile(
            xlsxData,
            `flow-summary-${aiType}.xlsx`,
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );

        setTimeout(() => {
            status.textContent = '';
            status.className = 'flow-status';
        }, 3000);

    } catch (err) {
        console.error('Flow summary export failed:', err);
        status.textContent = '❌ Export failed: ' + err.message;
        status.className = 'flow-status error';
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

