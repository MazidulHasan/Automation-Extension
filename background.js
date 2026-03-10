/**
 * Background Service Worker - Manages recording state and message passing
 */

let isRecording = false;
let recordedSteps = [];

// Initialize
chrome.runtime.onInstalled.addListener(() => {
    console.log('🎬 Test Recorder Pro installed');

    // Initialize storage
    chrome.storage.local.set({
        isRecording: false,
        recordedSteps: []
    });
});

// Listen for messages from content script and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('📨 Background received message:', message.action, '| tabId:', message.tabId || sender.tab?.id);

    // Resolve the tab id: popup sends message.tabId; content script has sender.tab.id
    const tabId = message.tabId !== undefined ? message.tabId : sender.tab?.id;

    if (message.action === 'startRecording') {
        if (!tabId) {
            sendResponse({ success: false, error: 'No active tab id available' });
            return true;
        }
        handleStartRecording(tabId).then(sendResponse);
        return true;
    }
    else if (message.action === 'stopRecording') {
        handleStopRecording(tabId).then(sendResponse);
        return true;
    }
    else if (message.action === 'getRecordingState') {
        handleGetRecordingState().then(sendResponse);
        return true;
    }
    else if (message.action === 'getSteps') {
        handleGetSteps().then(sendResponse);
        return true;
    }
    else if (message.action === 'clearSteps') {
        handleClearSteps(tabId).then(sendResponse);
        return true;
    }
    else if (message.action === 'stepRecorded') {
        handleStepRecorded(message.step);
        sendResponse({ success: true });
    }
    else if (message.action === 'updateStep') {
        handleUpdateStep(message.stepId, message.updates).then(sendResponse);
        return true;
    }
    else if (message.action === 'deleteStep') {
        handleDeleteStep(message.stepId).then(sendResponse);
        return true;
    }
});

/**
 * Start recording
 */
async function handleStartRecording(tabId) {
    try {
        isRecording = true;
        recordedSteps = [];

        // Save state
        await chrome.storage.local.set({
            isRecording: true,
            recordedSteps: []
        });

        // Inject content script if not already injected
        await injectContentScript(tabId);

        // Send message to content script
        await chrome.tabs.sendMessage(tabId, { action: 'startRecording' });

        console.log('✅ Recording started');
        return { success: true };
    } catch (error) {
        console.error('❌ Error starting recording:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Stop recording
 */
async function handleStopRecording(tabId) {
    try {
        isRecording = false;

        await chrome.storage.local.set({ isRecording: false });

        // Send message to content script
        try {
            await chrome.tabs.sendMessage(tabId, { action: 'stopRecording' });
        } catch (error) {
            console.log('Content script not available:', error);
        }

        console.log('⏹ Recording stopped');
        return { success: true };
    } catch (error) {
        console.error('❌ Error stopping recording:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Get recording state
 */
async function handleGetRecordingState() {
    const result = await chrome.storage.local.get(['isRecording', 'recordedSteps']);
    return {
        isRecording: result.isRecording || false,
        stepCount: (result.recordedSteps || []).length
    };
}

/**
 * Get all steps
 */
async function handleGetSteps() {
    const result = await chrome.storage.local.get('recordedSteps');
    return { steps: result.recordedSteps || [] };
}

/**
 * Clear all steps
 */
async function handleClearSteps(tabId) {
    try {
        recordedSteps = [];

        await chrome.storage.local.set({ recordedSteps: [] });

        // Notify content script
        try {
            await chrome.tabs.sendMessage(tabId, { action: 'clearSteps' });
        } catch (error) {
            console.log('Content script not available:', error);
        }

        console.log('🗑 Steps cleared');
        return { success: true };
    } catch (error) {
        console.error('❌ Error clearing steps:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Handle step recorded from content script
 */
function handleStepRecorded(step) {
    recordedSteps.push(step);
    console.log('📝 Step recorded in background:', step);
}

/**
 * Update a step
 */
async function handleUpdateStep(stepId, updates) {
    try {
        const result = await chrome.storage.local.get('recordedSteps');
        const steps = result.recordedSteps || [];

        const stepIndex = steps.findIndex(s => s.id === stepId);
        if (stepIndex !== -1) {
            steps[stepIndex] = { ...steps[stepIndex], ...updates };
            await chrome.storage.local.set({ recordedSteps: steps });
            recordedSteps = steps;
            return { success: true };
        }

        return { success: false, error: 'Step not found' };
    } catch (error) {
        console.error('❌ Error updating step:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Delete a step
 */
async function handleDeleteStep(stepId) {
    try {
        const result = await chrome.storage.local.get('recordedSteps');
        const steps = result.recordedSteps || [];

        const filteredSteps = steps.filter(s => s.id !== stepId);
        await chrome.storage.local.set({ recordedSteps: filteredSteps });
        recordedSteps = filteredSteps;

        return { success: true };
    } catch (error) {
        console.error('❌ Error deleting step:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Inject content script into tab.
 * Validates the tab URL so we give a clear error on chrome:// pages,
 * pings first to skip redundant injection, then waits for scripts to settle.
 */
async function injectContentScript(tabId) {
    try {
        // Verify it is an injectable page
        const tab = await chrome.tabs.get(tabId);
        const url = tab.url || '';
        if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('file://')) {
            throw new Error(`Cannot record on this page type (${url.split(':')[0]}://). Navigate to an http/https page first.`);
        }

        // Ping to check if content script is already alive
        try {
            await chrome.tabs.sendMessage(tabId, { action: 'ping' });
            console.log('✅ Content script already active');
            return; // Already present — nothing to do
        } catch (_pingErr) {
            console.log('⚙️ Content script not found, injecting...');
        }

        // Inject both scripts
        await chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: ['selectorEngine.js', 'content.js']
        });

        // Brief pause so injected scripts can finish initializing
        await new Promise(resolve => setTimeout(resolve, 250));

        console.log('✅ Content script injected successfully');
    } catch (error) {
        console.error('❌ Error injecting content script:', error);
        throw error;
    }
}

console.log('🎬 Test Recorder Background Script Loaded');
