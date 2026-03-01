/**
 * Content Script - Captures user interactions and generates test steps
 */

let isRecording = false;
let recordedSteps = [];
let stepCounter = 0;
let highlightedElement = null;
let highlightOverlay = null;

// Initialize
initialize();

function initialize() {
    createHighlightOverlay();
    setupMessageListener();
    loadRecordingState();
}

/**
 * Create highlight overlay for element hover
 */
function createHighlightOverlay() {
    highlightOverlay = document.createElement('div');
    highlightOverlay.id = 'test-recorder-highlight';
    highlightOverlay.style.cssText = `
    position: absolute;
    border: 2px solid #6366f1;
    background: rgba(99, 102, 241, 0.1);
    pointer-events: none;
    z-index: 999999;
    display: none;
    box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.3);
    transition: all 0.1s ease;
  `;
    document.body.appendChild(highlightOverlay);
}

/**
 * Setup message listener for communication with background script
 */
function setupMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === 'startRecording') {
            startRecording();
            sendResponse({ success: true });
        } else if (message.action === 'stopRecording') {
            stopRecording();
            sendResponse({ success: true });
        } else if (message.action === 'getSteps') {
            sendResponse({ steps: recordedSteps });
        } else if (message.action === 'clearSteps') {
            clearSteps();
            sendResponse({ success: true });
        }
        return true;
    });
}

/**
 * Load recording state from storage
 */
function loadRecordingState() {
    chrome.storage.local.get(['isRecording', 'recordedSteps'], (result) => {
        if (result.isRecording) {
            isRecording = true;
            recordedSteps = result.recordedSteps || [];
            stepCounter = recordedSteps.length;
            attachEventListeners();
        }
    });
}

/**
 * Start recording
 */
function startRecording() {
    isRecording = true;
    recordedSteps = [];
    stepCounter = 0;

    attachEventListeners();

    // Save state
    chrome.storage.local.set({
        isRecording: true,
        recordedSteps: []
    });

    // Record page load
    recordStep({
        eventType: 'navigation',
        actionName: 'Navigate to page',
        element: null,
        value: null,
        url: window.location.href
    });

    console.log('🎬 Test Recorder: Recording started');
}

/**
 * Stop recording
 */
function stopRecording() {
    isRecording = false;
    detachEventListeners();

    chrome.storage.local.set({ isRecording: false });

    console.log('⏹ Test Recorder: Recording stopped');
}

/**
 * Clear all steps
 */
function clearSteps() {
    recordedSteps = [];
    stepCounter = 0;

    chrome.storage.local.set({ recordedSteps: [] });

    console.log('🗑 Test Recorder: Steps cleared');
}

/**
 * Attach event listeners
 */
function attachEventListeners() {
    // Click events
    document.addEventListener('click', handleClick, true);

    // Input events
    document.addEventListener('input', handleInput, true);
    document.addEventListener('change', handleChange, true);

    // Keyboard events
    document.addEventListener('keypress', handleKeypress, true);

    // Scroll events
    window.addEventListener('scroll', handleScroll, true);

    // Mouse move for highlighting
    document.addEventListener('mousemove', handleMouseMove, true);

    // Navigation events
    window.addEventListener('beforeunload', handleBeforeUnload);

    console.log('✅ Event listeners attached');
}

/**
 * Detach event listeners
 */
function detachEventListeners() {
    document.removeEventListener('click', handleClick, true);
    document.removeEventListener('input', handleInput, true);
    document.removeEventListener('change', handleChange, true);
    document.removeEventListener('keypress', handleKeypress, true);
    window.removeEventListener('scroll', handleScroll, true);
    document.removeEventListener('mousemove', handleMouseMove, true);
    window.removeEventListener('beforeunload', handleBeforeUnload);

    hideHighlight();

    console.log('❌ Event listeners detached');
}

/**
 * Handle click events
 */
function handleClick(event) {
    if (!isRecording) return;

    const element = event.target;

    // Ignore clicks on our highlight overlay
    if (element.id === 'test-recorder-highlight') return;

    const tagName = element.tagName.toLowerCase();
    const text = SelectorEngine.getElementText(element);

    let actionName = `Click ${tagName}`;
    if (text) {
        actionName = `Click "${text}"`;
    } else if (element.id) {
        actionName = `Click element with id="${element.id}"`;
    }

    recordStep({
        eventType: 'click',
        actionName: actionName,
        element: element,
        value: null
    });
}

/**
 * Handle input events
 */
function handleInput(event) {
    if (!isRecording) return;

    const element = event.target;
    const tagName = element.tagName.toLowerCase();

    if (tagName !== 'input' && tagName !== 'textarea') return;

    const label = SelectorEngine.getAssociatedLabel(element);
    const placeholder = element.placeholder;
    const value = element.value;

    let actionName = `Enter text in ${tagName}`;
    if (label) {
        actionName = `Enter "${value}" in "${label}"`;
    } else if (placeholder) {
        actionName = `Enter "${value}" in field with placeholder "${placeholder}"`;
    } else if (element.name) {
        actionName = `Enter "${value}" in field "${element.name}"`;
    }

    // Debounce input events
    clearTimeout(element._inputTimeout);
    element._inputTimeout = setTimeout(() => {
        recordStep({
            eventType: 'input',
            actionName: actionName,
            element: element,
            value: value
        });
    }, 500);
}

/**
 * Handle change events (select, checkbox, radio)
 */
function handleChange(event) {
    if (!isRecording) return;

    const element = event.target;
    const tagName = element.tagName.toLowerCase();
    const type = element.type;

    let actionName = '';
    let value = null;

    if (tagName === 'select') {
        const selectedOption = element.options[element.selectedIndex];
        value = selectedOption.text;
        const label = SelectorEngine.getAssociatedLabel(element);
        actionName = label
            ? `Select "${value}" from "${label}"`
            : `Select "${value}" from dropdown`;
    } else if (type === 'checkbox') {
        value = element.checked;
        const label = SelectorEngine.getAssociatedLabel(element);
        actionName = label
            ? `${value ? 'Check' : 'Uncheck'} "${label}"`
            : `${value ? 'Check' : 'Uncheck'} checkbox`;
    } else if (type === 'radio') {
        value = element.value;
        const label = SelectorEngine.getAssociatedLabel(element);
        actionName = label
            ? `Select radio button "${label}"`
            : `Select radio button with value "${value}"`;
    } else {
        return; // Ignore other change events
    }

    recordStep({
        eventType: 'change',
        actionName: actionName,
        element: element,
        value: value
    });
}

/**
 * Handle keypress events
 */
function handleKeypress(event) {
    if (!isRecording) return;

    // Only record Enter key
    if (event.key === 'Enter') {
        const element = event.target;

        recordStep({
            eventType: 'keypress',
            actionName: `Press Enter key`,
            element: element,
            value: 'Enter'
        });
    }
}

/**
 * Handle scroll events
 */
let scrollTimeout;
function handleScroll(event) {
    if (!isRecording) return;

    // Debounce scroll events
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
        recordStep({
            eventType: 'scroll',
            actionName: `Scroll to position (${window.scrollX}, ${window.scrollY})`,
            element: null,
            value: { x: window.scrollX, y: window.scrollY }
        });
    }, 1000);
}

/**
 * Handle mouse move for element highlighting
 */
function handleMouseMove(event) {
    if (!isRecording) return;

    const element = event.target;

    // Ignore our highlight overlay
    if (element.id === 'test-recorder-highlight') return;

    highlightElement(element);
}

/**
 * Handle before unload (navigation)
 */
function handleBeforeUnload(event) {
    if (!isRecording) return;

    recordStep({
        eventType: 'navigation',
        actionName: `Navigate away from ${window.location.href}`,
        element: null,
        value: null
    });
}

/**
 * Highlight element
 */
function highlightElement(element) {
    if (!highlightOverlay) return;

    const rect = element.getBoundingClientRect();

    highlightOverlay.style.display = 'block';
    highlightOverlay.style.top = (rect.top + window.scrollY) + 'px';
    highlightOverlay.style.left = (rect.left + window.scrollX) + 'px';
    highlightOverlay.style.width = rect.width + 'px';
    highlightOverlay.style.height = rect.height + 'px';

    highlightedElement = element;
}

/**
 * Hide highlight
 */
function hideHighlight() {
    if (highlightOverlay) {
        highlightOverlay.style.display = 'none';
    }
    highlightedElement = null;
}

/**
 * Record a step
 */
function recordStep({ eventType, actionName, element, value, url = null }) {
    stepCounter++;

    const step = {
        id: generateUUID(),
        stepNumber: stepCounter,
        eventType: eventType,
        actionName: actionName,
        timestamp: Date.now(),
        url: url || window.location.href,
        value: value
    };

    // Generate selectors if element exists
    if (element) {
        const selectors = SelectorEngine.generateAllSelectors(element);
        step.element = {
            tag: selectors.metadata.tag,
            text: selectors.metadata.text,
            id: selectors.metadata.id,
            name: selectors.metadata.name,
            className: selectors.metadata.className,
            xpath: selectors.xpath,
            css: selectors.css,
            playwright: selectors.playwright,
            selenium: selectors.selenium,
            metadata: selectors.metadata
        };

        // Capture screenshot (simplified - actual implementation would use canvas)
        captureElementScreenshot(element).then(screenshot => {
            step.screenshot = screenshot;
        });
    }

    recordedSteps.push(step);

    // Save to storage
    chrome.storage.local.set({ recordedSteps: recordedSteps });

    // Notify background script
    chrome.runtime.sendMessage({
        action: 'stepRecorded',
        step: step
    });

    console.log('📝 Step recorded:', step);
}

/**
 * Capture element screenshot (simplified version)
 */
async function captureElementScreenshot(element) {
    try {
        // This is a simplified version
        // In production, you'd use html2canvas or similar library
        return null; // Placeholder
    } catch (error) {
        console.error('Screenshot capture failed:', error);
        return null;
    }
}

/**
 * Generate UUID
 */
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

/**
 * Format timestamp
 */
function formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString();
}

console.log('🎬 Test Recorder Content Script Loaded');
