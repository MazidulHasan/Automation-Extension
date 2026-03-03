/**
 * Content Script - Captures user interactions and generates test steps
 * Includes Playwright codegen-style floating assertion panel
 */

let isRecording = false;
let recordedSteps = [];
let stepCounter = 0;
let highlightedElement = null;
let highlightOverlay = null;

// Assertion panel state
let assertionMode = false;
let assertionType = null; // 'visibility' | 'text' | 'value'
let floatingPanel = null;
let assertionTargetElement = null;

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
 * Create the floating assertion panel (Playwright codegen style)
 */
function createFloatingPanel() {
    if (floatingPanel) return;

    floatingPanel = document.createElement('div');
    floatingPanel.id = 'test-recorder-assertion-panel';
    floatingPanel.innerHTML = `
        <div id="trp-drag-handle" style="
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 10px 14px 8px;
            background: linear-gradient(135deg, #1e1b4b 0%, #312e81 100%);
            border-radius: 12px 12px 0 0;
            cursor: grab;
            user-select: none;
            border-bottom: 1px solid rgba(255,255,255,0.1);
        ">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5b4fc" stroke-width="2.5">
                <circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/>
            </svg>
            <span style="color:#e0e7ff;font-size:12px;font-weight:700;letter-spacing:0.5px;">TEST RECORDER PRO</span>
            <span style="
                margin-left:auto;
                background:rgba(99,102,241,0.3);
                color:#a5b4fc;
                font-size:9px;
                padding:2px 6px;
                border-radius:20px;
                font-weight:600;
                letter-spacing:0.5px;
            ">ASSERT</span>
        </div>
        <div style="padding: 10px 12px 12px; display:flex; flex-direction:column; gap:6px;">
            <div style="color:#94a3b8;font-size:10px;font-weight:600;letter-spacing:0.5px;margin-bottom:2px;">ASSERTION TYPE</div>
            <button id="trp-assert-visibility" class="trp-assert-btn" data-type="visibility" title="Assert element is visible">
                <span>👁️</span> Assert Visibility
            </button>
            <button id="trp-assert-text" class="trp-assert-btn" data-type="text" title="Assert element text content">
                <span>🔤</span> Assert Text
            </button>
            <button id="trp-assert-value" class="trp-assert-btn" data-type="value" title="Assert element value (inputs)">
                <span>✏️</span> Assert Value
            </button>
            <div id="trp-status" style="
                margin-top:4px;
                color:#64748b;
                font-size:10px;
                text-align:center;
                padding:4px;
                border-radius:6px;
                background:rgba(0,0,0,0.2);
                min-height:18px;
                transition: all 0.2s;
            ">Click an assertion type, then click an element</div>
        </div>
    `;

    // Panel styles
    floatingPanel.style.cssText = `
        position: fixed;
        top: 16px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 2147483647;
        background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%);
        border: 1px solid rgba(99, 102, 241, 0.4);
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(99,102,241,0.2), inset 0 1px 0 rgba(255,255,255,0.05);
        min-width: 220px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        backdrop-filter: blur(12px);
    `;

    // Inject button styles
    const styleEl = document.createElement('style');
    styleEl.id = 'trp-assertion-styles';
    styleEl.textContent = `
        .trp-assert-btn {
            display: flex;
            align-items: center;
            gap: 8px;
            width: 100%;
            padding: 8px 12px;
            background: rgba(99, 102, 241, 0.08);
            border: 1px solid rgba(99, 102, 241, 0.2);
            border-radius: 8px;
            color: #c7d2fe;
            font-size: 12px;
            font-weight: 500;
            cursor: pointer;
            text-align: left;
            transition: all 0.15s ease;
        }
        .trp-assert-btn:hover {
            background: rgba(99, 102, 241, 0.2);
            border-color: rgba(99, 102, 241, 0.5);
            color: #e0e7ff;
            transform: translateX(2px);
        }
        .trp-assert-btn.trp-active {
            background: rgba(99, 102, 241, 0.35) !important;
            border-color: #6366f1 !important;
            color: #fff !important;
            box-shadow: 0 0 0 2px rgba(99,102,241,0.2);
        }
        #test-recorder-assertion-highlight {
            position: absolute;
            border: 2px solid #22c55e;
            background: rgba(34, 197, 94, 0.1);
            pointer-events: none;
            z-index: 2147483646;
            box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.25);
            border-radius: 3px;
            transition: all 0.1s ease;
        }
    `;
    document.head.appendChild(styleEl);

    document.body.appendChild(floatingPanel);

    // Make draggable
    makeDraggable(floatingPanel, document.getElementById('trp-drag-handle'));

    // Assertion button listeners
    floatingPanel.querySelectorAll('.trp-assert-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const type = btn.dataset.type;
            activateAssertionMode(type);
        });
    });

    console.log('✅ Floating assertion panel created');
}

/**
 * Make an element draggable by a handle
 */
function makeDraggable(element, handle) {
    let isDragging = false;
    let startX, startY, startLeft, startTop;

    handle.addEventListener('mousedown', (e) => {
        isDragging = true;
        handle.style.cursor = 'grabbing';
        startX = e.clientX;
        startY = e.clientY;

        const rect = element.getBoundingClientRect();
        // Switch from transform-based centering to absolute positioning
        element.style.transform = 'none';
        element.style.left = rect.left + 'px';
        element.style.top = rect.top + 'px';
        startLeft = rect.left;
        startTop = rect.top;

        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        element.style.left = Math.max(0, startLeft + dx) + 'px';
        element.style.top = Math.max(0, startTop + dy) + 'px';
    });

    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            handle.style.cursor = 'grab';
        }
    });
}

/**
 * Activate assertion selection mode
 */
function activateAssertionMode(type) {
    assertionMode = true;
    assertionType = type;

    // Update button active states
    floatingPanel.querySelectorAll('.trp-assert-btn').forEach(btn => {
        btn.classList.toggle('trp-active', btn.dataset.type === type);
    });

    // Update status
    const statusEl = document.getElementById('trp-status');
    const labels = {
        visibility: '👁️ Click an element to assert visibility',
        text: '🔤 Click an element to assert its text',
        value: '✏️ Click an element to assert its value'
    };
    statusEl.style.color = '#a5b4fc';
    statusEl.style.background = 'rgba(99,102,241,0.15)';
    statusEl.textContent = labels[type] || 'Click an element';

    // Attach assertion-specific highlight and click
    document.addEventListener('mousemove', handleAssertionMouseMove, true);
    document.addEventListener('click', handleAssertionClick, true);

    console.log(`🎯 Assertion mode activated: ${type}`);
}

/**
 * Deactivate assertion mode
 */
function deactivateAssertionMode() {
    assertionMode = false;
    assertionType = null;

    document.removeEventListener('mousemove', handleAssertionMouseMove, true);
    document.removeEventListener('click', handleAssertionClick, true);

    removeAssertionHighlight();

    if (floatingPanel) {
        floatingPanel.querySelectorAll('.trp-assert-btn').forEach(btn => btn.classList.remove('trp-active'));
        const statusEl = document.getElementById('trp-status');
        statusEl.style.color = '#64748b';
        statusEl.style.background = 'rgba(0,0,0,0.2)';
        statusEl.textContent = 'Click an assertion type, then click an element';
    }
}

/**
 * Handle mouse move during assertion mode (green highlight)
 */
function handleAssertionMouseMove(event) {
    const el = event.target;
    if (el.id === 'test-recorder-assertion-panel' || el.closest('#test-recorder-assertion-panel')) return;
    if (el.id === 'test-recorder-highlight' || el.id === 'test-recorder-assertion-highlight') return;

    highlightAssertionElement(el);
}

/**
 * Highlight element in assertion mode (green)
 */
function highlightAssertionElement(element) {
    let overlay = document.getElementById('test-recorder-assertion-highlight');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'test-recorder-assertion-highlight';
        overlay.className = 'test-recorder-assertion-highlight';
        document.body.appendChild(overlay);
    }

    const rect = element.getBoundingClientRect();
    overlay.style.cssText = `
        position: fixed;
        top: ${rect.top}px;
        left: ${rect.left}px;
        width: ${rect.width}px;
        height: ${rect.height}px;
        border: 2px solid #22c55e;
        background: rgba(34, 197, 94, 0.1);
        pointer-events: none;
        z-index: 2147483646;
        box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.25);
        border-radius: 3px;
    `;
    assertionTargetElement = element;
}

/**
 * Remove assertion highlight overlay
 */
function removeAssertionHighlight() {
    const overlay = document.getElementById('test-recorder-assertion-highlight');
    if (overlay) overlay.remove();
    assertionTargetElement = null;
}

/**
 * Handle click during assertion mode – record the assertion step
 */
function handleAssertionClick(event) {
    const el = event.target;
    if (el.id === 'test-recorder-assertion-panel' || el.closest('#test-recorder-assertion-panel')) return;

    event.preventDefault();
    event.stopPropagation();

    const type = assertionType;
    let assertValue = null;
    let actionName = '';

    switch (type) {
        case 'visibility':
            actionName = `Assert "${SelectorEngine.getElementText(el) || el.tagName.toLowerCase()}" is visible`;
            assertValue = null;
            break;
        case 'text':
            assertValue = (el.textContent || '').trim();
            actionName = `Assert text "${assertValue}"`;
            break;
        case 'value':
            assertValue = el.value !== undefined ? el.value : (el.getAttribute('value') || '');
            actionName = `Assert value "${assertValue}"`;
            break;
    }

    recordStep({
        eventType: 'assertion',
        assertionType: type,
        actionName: actionName,
        element: el,
        value: assertValue
    });

    // Flash status
    const statusEl = document.getElementById('trp-status');
    if (statusEl) {
        statusEl.style.color = '#22c55e';
        statusEl.style.background = 'rgba(34,197,94,0.15)';
        statusEl.textContent = `✅ Assertion recorded!`;
        setTimeout(() => deactivateAssertionMode(), 1200);
    } else {
        deactivateAssertionMode();
    }

    console.log(`✅ Assertion recorded: ${type} — "${assertValue}"`);
}

/**
 * Show/hide floating panel
 */
function showFloatingPanel() {
    if (!floatingPanel) {
        createFloatingPanel();
    } else {
        floatingPanel.style.display = 'block';
    }
}

function hideFloatingPanel() {
    if (floatingPanel) {
        floatingPanel.style.display = 'none';
    }
    deactivateAssertionMode();
}

/**
 * Setup message listener for communication with background script
 */
function setupMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === 'ping') {
            // Health-check — background uses this to detect if script is alive
            sendResponse({ alive: true });
        } else if (message.action === 'startRecording') {
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
            showFloatingPanel();
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
    showFloatingPanel();

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
    hideFloatingPanel();

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

    // Abort if we're in assertion mode (handled separately)
    if (assertionMode) return;

    const element = event.target;

    // Ignore clicks on our panels
    if (element.id === 'test-recorder-highlight') return;
    if (element.id === 'test-recorder-assertion-panel' || element.closest?.('#test-recorder-assertion-panel')) return;

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
    if (assertionMode) return; // assertion mode handles its own highlight

    const element = event.target;

    // Ignore our panels
    if (element.id === 'test-recorder-highlight') return;
    if (element.closest?.('#test-recorder-assertion-panel')) return;

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
 * Highlight element (purple, recording mode)
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
function recordStep({ eventType, assertionType, actionName, element, value, url = null }) {
    stepCounter++;

    const step = {
        id: generateUUID(),
        stepNumber: stepCounter,
        eventType: eventType,
        assertionType: assertionType || null,
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

        // Capture screenshot (simplified)
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
