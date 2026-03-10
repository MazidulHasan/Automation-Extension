/**
 * Popup UI Logic - Controls recording and displays steps
 * Supports: recording controls, step management, CSV/Excel/Playwright/Selenium/JSON/BDD export
 */

let isRecording = false;
let recordedSteps = [];
let updateInterval = null;

// Initialize
document.addEventListener('DOMContentLoaded', initialize);

async function initialize() {
    // Load initial state
    await loadRecordingState();
    await loadSteps();

    // Setup event listeners
    setupEventListeners();

    // Start periodic updates
    startPeriodicUpdates();

    // Show Groq key status
    await refreshApiKeyStatus();
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
    document.getElementById('startRecording').addEventListener('click', handleStartRecording);
    document.getElementById('stopRecording').addEventListener('click', handleStopRecording);
    document.getElementById('clearSteps').addEventListener('click', handleClearSteps);

    // Settings toggle
    document.getElementById('settingsToggle').addEventListener('click', toggleSettings);
    document.getElementById('saveApiKey').addEventListener('click', handleSaveApiKey);

    // Export buttons
    document.getElementById('exportManual').addEventListener('click', () => handleExport('manual'));
    document.getElementById('exportExcel').addEventListener('click', () => handleExport('excel'));
    document.getElementById('exportPlaywright').addEventListener('click', () => handleExport('playwright'));
    document.getElementById('exportSelenium').addEventListener('click', () => handleExport('selenium'));
    document.getElementById('exportJson').addEventListener('click', () => handleExport('json'));
    document.getElementById('exportBdd').addEventListener('click', () => handleExport('bdd'));

    // Resume Recording
    document.getElementById('resumeRecording').addEventListener('click', handleResumeRecording);

    // AI Flow Summary
    document.getElementById('exportFlowSummary').addEventListener('click', handleExportFlowSummary);
    document.getElementById('exportFlowSummaryGemini').addEventListener('click', handleExportFlowSummaryGemini);
    
    // Gemini Settings
    document.getElementById('saveGeminiApiKey').addEventListener('click', handleSaveGeminiApiKey);
}

/**
 * Load recording state
 */
async function loadRecordingState() {
    try {
        const response = await chrome.runtime.sendMessage({ action: 'getRecordingState' });
        isRecording = response.isRecording;
        updateUI();
    } catch (error) {
        console.error('Error loading recording state:', error);
    }
}

/**
 * Load steps from storage
 */
async function loadSteps() {
    try {
        const response = await chrome.runtime.sendMessage({ action: 'getSteps' });
        recordedSteps = response.steps || [];
        renderSteps();
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
    } catch (error) {
        console.error('Error stopping recording:', error);
        // Update UI regardless
        isRecording = false;
        updateUI();
    }
}

/**
 * Handle clear steps
 * Routed through background for consistency.
 */
async function handleClearSteps() {
    if (!confirm('Are you sure you want to clear all recorded steps?')) {
        return;
    }

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
    const indicator = document.getElementById('recordingIndicator');
    const stepCount = document.getElementById('stepCount');

    if (isRecording) {
        startBtn.disabled = true;
        stopBtn.disabled = false;
        resumeBtn.disabled = true;
        indicator.classList.add('active');
    } else {
        startBtn.disabled = false;
        stopBtn.disabled = true;
        resumeBtn.disabled = recordedSteps.length === 0;
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

    stepsList.innerHTML = recordedSteps.map((step, index) => createStepHTML(step, index)).join('');

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
    const stepItem = event.target.closest('.step-item');
    const stepId = stepItem.dataset.stepId;
    const step = recordedSteps.find(s => s.id === stepId);
    if (!step) return;

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
        await loadSteps();
    });

    formDiv.querySelector('#cancelEditBtn').addEventListener('click', () => {
        formDiv.remove();
        editBtn.style.display = 'inline-block';
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
    const stepItem = event.target.closest('.step-item');
    const stepId = stepItem.dataset.stepId;

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

// ─────────────────────────────────────────────────────────
//  AI Flow Summary Export
// ─────────────────────────────────────────────────────────

async function handleExportFlowSummary() {
    if (recordedSteps.length === 0) {
        alert('No steps to export. Please record some steps first.');
        return;
    }

    const btn = document.getElementById('exportFlowSummary');
    const status = document.getElementById('flowSummaryStatus');

    // Show loading state
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Generating…';
    status.textContent = '';
    status.className = 'flow-status';

    let aiSummary = null;

    try {
        const apiKey = await GroqService.loadApiKey();

        if (apiKey) {
            status.textContent = '🤖 Calling Groq AI…';
            status.className = 'flow-status loading';
            try {
                aiSummary = await GroqService.summarizeSteps(recordedSteps, apiKey);
                status.textContent = '✅ AI summary ready!';
                status.className = 'flow-status success';
            } catch (groqErr) {
                console.warn('Groq API call failed, using auto-summary:', groqErr);
                status.textContent = `⚠️ AI failed — using auto-summary`;
                status.className = 'flow-status error';
            }
        } else {
            status.textContent = 'ℹ️ No API key — using auto-summary';
            status.className = 'flow-status loading';
        }

        // Generate Excel (AI or auto)
        const xlsxData = Exporter.exportFlowSummaryExcel(recordedSteps, aiSummary);
        downloadBinaryFile(
            xlsxData,
            'flow-summary.xlsx',
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
        btn.innerHTML = '🤖 Export Flow Summary (Excel)';
    }
}

