/**
 * Popup UI Logic - Controls recording and displays steps
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
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
    document.getElementById('startRecording').addEventListener('click', handleStartRecording);
    document.getElementById('stopRecording').addEventListener('click', handleStopRecording);
    document.getElementById('clearSteps').addEventListener('click', handleClearSteps);

    // Export buttons
    document.getElementById('exportManual').addEventListener('click', () => handleExport('manual'));
    document.getElementById('exportPlaywright').addEventListener('click', () => handleExport('playwright'));
    document.getElementById('exportSelenium').addEventListener('click', () => handleExport('selenium'));
    document.getElementById('exportJson').addEventListener('click', () => handleExport('json'));
    document.getElementById('exportBdd').addEventListener('click', () => handleExport('bdd'));
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
 */
async function handleStartRecording() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const response = await chrome.tabs.sendMessage(tab.id, { action: 'startRecording' });

        if (response.success) {
            isRecording = true;
            recordedSteps = [];
            updateUI();
            renderSteps();
        }
    } catch (error) {
        console.error('Error starting recording:', error);
        alert('Failed to start recording. Please refresh the page and try again.');
    }
}

/**
 * Handle stop recording
 */
async function handleStopRecording() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        await chrome.tabs.sendMessage(tab.id, { action: 'stopRecording' });

        isRecording = false;
        updateUI();
    } catch (error) {
        console.error('Error stopping recording:', error);
    }
}

/**
 * Handle clear steps
 */
async function handleClearSteps() {
    if (!confirm('Are you sure you want to clear all recorded steps?')) {
        return;
    }

    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        await chrome.tabs.sendMessage(tab.id, { action: 'clearSteps' });

        recordedSteps = [];
        renderSteps();
    } catch (error) {
        console.error('Error clearing steps:', error);
    }
}

/**
 * Update UI based on recording state
 */
function updateUI() {
    const startBtn = document.getElementById('startRecording');
    const stopBtn = document.getElementById('stopRecording');
    const indicator = document.getElementById('recordingIndicator');
    const stepCount = document.getElementById('stepCount');

    if (isRecording) {
        startBtn.disabled = true;
        stopBtn.disabled = false;
        indicator.classList.add('active');
    } else {
        startBtn.disabled = false;
        stopBtn.disabled = true;
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
 * Create HTML for a step
 */
function createStepHTML(step, index) {
    const time = new Date(step.timestamp).toLocaleTimeString();
    const xpath = step.element?.xpath?.relative || 'N/A';
    const css = step.element?.css || 'N/A';

    return `
    <div class="step-item" data-step-id="${step.id}">
      <div class="step-header">
        <span class="step-number">Step ${index + 1}</span>
        <span class="step-time">${time}</span>
      </div>
      <div class="step-action" data-editable="true">
        ${step.actionName}
      </div>
      <div class="step-details">
        <div class="step-detail-row">
          <span class="step-detail-label">Type:</span>
          <span class="step-detail-value">${step.eventType}</span>
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
        ${step.value ? `
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
    const actionDiv = stepItem.querySelector('.step-action');
    const currentText = actionDiv.textContent.trim();

    // Create input field
    const input = document.createElement('input');
    input.type = 'text';
    input.value = currentText;
    input.style.width = '100%';

    // Replace text with input
    actionDiv.innerHTML = '';
    actionDiv.appendChild(input);
    input.focus();

    // Handle save
    const saveEdit = async () => {
        const newText = input.value.trim();
        if (newText && newText !== currentText) {
            await chrome.runtime.sendMessage({
                action: 'updateStep',
                stepId: stepId,
                updates: { actionName: newText }
            });
            await loadSteps();
        } else {
            actionDiv.textContent = currentText;
        }
    };

    input.addEventListener('blur', saveEdit);
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            saveEdit();
        }
    });
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

    switch (format) {
        case 'manual':
            content = Exporter.exportManualTestCase(recordedSteps);
            filename = 'manual-test-case.csv';
            mimeType = 'text/csv';
            break;
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
 * Download file
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

// Cleanup on unload
window.addEventListener('unload', () => {
    if (updateInterval) {
        clearInterval(updateInterval);
    }
});
