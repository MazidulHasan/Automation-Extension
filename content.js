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

// Floating panel position & UI state (persisted per session)
let panelX = null; // null = auto-center on first show
let panelY = 16;
let panelMinimized = false;
let panelHidden = false;

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

    // Calculate initial X to center the panel (width ~230px)
    const initX = panelX !== null ? panelX : Math.max(0, Math.round(window.innerWidth / 2 - 115));
    const initY = panelY;

    // Inject shared styles (idempotent)
    if (!document.getElementById('trp-assertion-styles')) {
        const styleEl = document.createElement('style');
        styleEl.id = 'trp-assertion-styles';
        styleEl.textContent = `
            @keyframes trp-pulse { 0%,100%{opacity:1;box-shadow:0 0 0 0 rgba(239,68,68,0.7)} 70%{opacity:1;box-shadow:0 0 0 6px rgba(239,68,68,0)} }
            @keyframes trp-spin  { to { transform: rotate(360deg); } }
            #trp-recording-dot { animation: trp-pulse 1.4s ease infinite; }
            .trp-assert-btn {
                display:flex; align-items:center; gap:8px; width:100%;
                padding:8px 12px;
                background:rgba(99,102,241,0.08);
                border:1px solid rgba(99,102,241,0.2);
                border-radius:8px; color:#c7d2fe; font-size:12px;
                font-weight:500; cursor:pointer; text-align:left;
                transition:all 0.15s ease;
            }
            .trp-assert-btn:hover {
                background:rgba(99,102,241,0.2);
                border-color:rgba(99,102,241,0.5);
                color:#e0e7ff; transform:translateX(2px);
            }
            .trp-assert-btn.trp-active {
                background:rgba(99,102,241,0.35)!important;
                border-color:#6366f1!important; color:#fff!important;
                box-shadow:0 0 0 2px rgba(99,102,241,0.2);
            }
            .trp-icon-btn {
                background:none; border:none; cursor:pointer;
                color:#94a3b8; font-size:13px; padding:2px 5px;
                border-radius:4px; line-height:1; transition:all 0.15s;
                display:flex; align-items:center; justify-content:center;
            }
            .trp-icon-btn:hover { background:rgba(255,255,255,0.12); color:#e0e7ff; }
            #test-recorder-assertion-highlight {
                position:fixed;
                border:2px solid #22c55e;
                background:rgba(34,197,94,0.08);
                pointer-events:none; z-index:2147483646;
                box-shadow:0 0 0 3px rgba(34,197,94,0.25);
                border-radius:3px;
            }
        `;
        document.head.appendChild(styleEl);
    }

    floatingPanel = document.createElement('div');
    floatingPanel.id = 'test-recorder-assertion-panel';
    floatingPanel.style.cssText = `
        position: fixed;
        top: ${initY}px;
        left: ${initX}px;
        z-index: 2147483647;
        background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%);
        border: 1px solid rgba(99,102,241,0.4);
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(99,102,241,0.15), inset 0 1px 0 rgba(255,255,255,0.05);
        min-width: 230px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        backdrop-filter: blur(12px);
        overflow: hidden;
        transition: box-shadow 0.2s;
    `;

    floatingPanel.innerHTML = `
        <!-- ── Header / Drag Handle ── -->
        <div id="trp-drag-handle" style="
            display:flex; align-items:center; gap:8px;
            padding:9px 10px 9px 14px;
            background:linear-gradient(135deg,#1e1b4b 0%,#312e81 100%);
            cursor:grab; user-select:none;
            border-bottom:1px solid rgba(255,255,255,0.08);
        ">
            <!-- Record dot (hidden by default) -->
            <span id="trp-recording-dot" style="
                display:none; width:9px; height:9px; flex-shrink:0;
                border-radius:50%; background:#ef4444;
            "></span>
            <span style="color:#e0e7ff;font-size:11px;font-weight:700;letter-spacing:0.6px;white-space:nowrap;">TEST RECORDER PRO</span>
            <span id="trp-rec-label" style="
                display:none; margin-left:2px;
                background:rgba(239,68,68,0.2); color:#fca5a5;
                font-size:9px; padding:1px 6px; border-radius:20px; font-weight:700;
                letter-spacing:0.4px; white-space:nowrap;
            ">REC</span>
            <div style="margin-left:auto;display:flex;align-items:center;gap:2px;">
                <!-- Add Section -->
                <button id="trp-add-section-btn" class="trp-icon-btn" title="Mark new test case boundary" style="color:#a5b4fc; font-size:12px; margin-right:4px;">📁</button>
                <!-- Stop Recording -->
                <button id="trp-stop-btn" class="trp-icon-btn" title="Stop Recording & Open Details" style="color:#fca5a5; font-size:12px; margin-right:4px;">⏹</button>
                <!-- Minimize toggle -->
                <button id="trp-minimize-btn" class="trp-icon-btn" title="Minimize / Expand">▼</button>
                <!-- Close -->
                <button id="trp-close-btn" class="trp-icon-btn" title="Hide panel">✕</button>
            </div>
        </div>

        <!-- ── Body (collapsible) ── -->
        <div id="trp-panel-body" style="padding:10px 12px 12px;display:flex;flex-direction:column;gap:6px;">
            <div style="color:#94a3b8;font-size:10px;font-weight:600;letter-spacing:0.5px;margin-bottom:2px;">ASSERTION TYPE</div>
            <button class="trp-assert-btn" data-type="visibility" title="Assert element is visible"><span>👁️</span> Assert Visibility</button>
            <button class="trp-assert-btn" data-type="text"       title="Assert element text content"><span>🔤</span> Assert Text</button>
            <button class="trp-assert-btn" data-type="value"      title="Assert input value"><span>✏️</span> Assert Value</button>
            <div id="trp-status" style="
                margin-top:4px; color:#64748b; font-size:10px;
                text-align:center; padding:4px; border-radius:6px;
                background:rgba(0,0,0,0.2); min-height:18px; transition:all 0.2s;
            ">Click an assertion type, then click an element</div>
        </div>
    `;

    document.body.appendChild(floatingPanel);

    // ── Drag ──
    makeDraggable(floatingPanel, document.getElementById('trp-drag-handle'));

    // ── Stop Recording ──
    const stopBtn = document.getElementById('trp-stop-btn');
    if (stopBtn) {
        stopBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            chrome.runtime.sendMessage({ action: 'stopRecording' });
            stopRecording();
            chrome.runtime.sendMessage({ action: 'openDetails' });
        });
    }

    // ── Add Section ──
    const sectionBtn = document.getElementById('trp-add-section-btn');
    if (sectionBtn) {
        sectionBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const name = prompt("Enter a name for the new step section:", "New Test Case");
            if (name) {
                chrome.runtime.sendMessage({
                    action: 'stepRecorded',
                    step: {
                        id: 'grp_' + Date.now(),
                        timestamp: Date.now(),
                        eventType: 'group',
                        actionName: name,
                        element: null,
                        value: null,
                        assertionType: null
                    }
                });
            }
        });
    }
    // ── Minimize ──
    document.getElementById('trp-minimize-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        panelMinimized = !panelMinimized;
        const body = document.getElementById('trp-panel-body');
        const btn = document.getElementById('trp-minimize-btn');
        body.style.display = panelMinimized ? 'none' : 'flex';
        btn.textContent = panelMinimized ? '▲' : '▼';
        floatingPanel.style.borderRadius = panelMinimized ? '12px' : '12px';
        chrome.storage.local.set({ panelMinimized });
    });

    // ── Close ──
    document.getElementById('trp-close-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        panelHidden = true;
        floatingPanel.style.display = 'none';
        deactivateAssertionMode();
    });

    // ── Assertion buttons ──
    floatingPanel.querySelectorAll('.trp-assert-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            activateAssertionMode(btn.dataset.type);
        });
    });

    // Apply persisted minimized state
    if (panelMinimized) {
        document.getElementById('trp-panel-body').style.display = 'none';
        document.getElementById('trp-minimize-btn').textContent = '▲';
    }

    console.log('✅ Floating assertion panel created');
}

/**
 * Make an element draggable by a handle.
 * Uses mouse-offset approach — no transform, no jump.
 */
function makeDraggable(element, handle) {
    let isDragging = false;
    let offsetX = 0, offsetY = 0;

    handle.addEventListener('mousedown', (e) => {
        // Ignore clicks on child buttons inside the handle
        if (e.target.classList.contains('trp-icon-btn')) return;
        isDragging = true;
        handle.style.cursor = 'grabbing';
        const rect = element.getBoundingClientRect();
        offsetX = e.clientX - rect.left;
        offsetY = e.clientY - rect.top;
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const newX = Math.max(0, Math.min(window.innerWidth - 60, e.clientX - offsetX));
        const newY = Math.max(0, Math.min(window.innerHeight - 40, e.clientY - offsetY));
        element.style.left = newX + 'px';
        element.style.top = newY + 'px';
        // Persist position so it survives show/hide cycles
        panelX = newX;
        panelY = newY;
    });

    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            handle.style.cursor = 'grab';
            chrome.storage.local.set({ panelX, panelY });
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

    const role = getElementRoleLabel(el);
    const text = SelectorEngine.getElementText(el);
    const label = SelectorEngine.getAssociatedLabel(el);
    const name = el.name;
    const placeholder = el.placeholder;
    // Base identifier logic similar to input fields
    const identifier = label || text || placeholder || name || (el.id ? `#${el.id}` : null);

    // Fallback if no specific identifier exists
    const targetDesc = identifier ? `${role} "${identifier}"` : role;

    const type = assertionType;
    let assertValue = null;
    let actionName = '';

    switch (type) {
        case 'visibility':
            actionName = `Verify ${targetDesc} is visible`;
            assertValue = null;
            break;
        case 'text':
            assertValue = (el.textContent || '').trim();
            actionName = `Verify ${targetDesc} contains text "${assertValue}"`;
            break;
        case 'value':
            assertValue = el.value !== undefined ? el.value : (el.getAttribute('value') || '');
            actionName = `Verify ${targetDesc} has value "${assertValue}"`;
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
        } else if (message.action === 'resumeRecording') {
            resumeRecording();
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
    chrome.storage.local.get(['isRecording', 'recordedSteps', 'panelX', 'panelY', 'panelMinimized'], (result) => {
        if (result.panelX !== undefined) panelX = result.panelX;
        if (result.panelY !== undefined) panelY = result.panelY;
        if (result.panelMinimized !== undefined) panelMinimized = result.panelMinimized;

        if (result.isRecording) {
            isRecording = true;
            recordedSteps = result.recordedSteps || [];
            stepCounter = recordedSteps.length;
            attachEventListeners();
            showFloatingPanel();
            updatePanelRecordingState(true);
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
    updatePanelRecordingState(true);

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
 * Resume recording without clearing steps
 */
function resumeRecording() {
    isRecording = true;
    
    // We expect recordedSteps to either be populated by `loadRecordingState()` 
    // or by Chrome storage state pulling.
    attachEventListeners();
    showFloatingPanel();
    updatePanelRecordingState(true);

    chrome.storage.local.set({ isRecording: true });

    console.log('▶️ Test Recorder: Recording resumed');
}

/**
 * Stop recording
 */
function stopRecording() {
    isRecording = false;
    detachEventListeners();
    updatePanelRecordingState(false);
    hideFloatingPanel();

    chrome.storage.local.set({ isRecording: false });

    console.log('⏹ Test Recorder: Recording stopped');
}

/**
 * Update the recording indicator dot & REC badge in the floating panel.
 */
function updatePanelRecordingState(recording) {
    const dot = document.getElementById('trp-recording-dot');
    const label = document.getElementById('trp-rec-label');
    if (!dot) return;
    dot.style.display = recording ? 'inline-block' : 'none';
    if (label) label.style.display = recording ? 'inline-block' : 'none';
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
    if (assertionMode) return;

    const element = event.target;
    if (element.id === 'test-recorder-highlight') return;
    if (element.id === 'test-recorder-assertion-panel' || element.closest?.('#test-recorder-assertion-panel')) return;

    const role = getElementRoleLabel(element);
    const text = SelectorEngine.getElementText(element);
    const label = SelectorEngine.getAssociatedLabel(element);
    const aria = element.getAttribute?.('aria-label');
    const title = element.title;
    const name = element.name;
    const id = element.id;

    // Best human-readable identifier: label > text > aria > title > name > id
    const identifier = label || text || aria || title || name ||
        (id ? `#${id}` : null);

    let actionName;
    if (identifier) {
        actionName = `Click ${role} "${identifier}"`;
    } else {
        actionName = `Click ${role}`;
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

    const value = element.value;
    const label = SelectorEngine.getAssociatedLabel(element);
    const placeholder = element.placeholder;
    const fieldName = element.name;
    const fieldId = element.id;
    const inputType = element.type?.toLowerCase();

    // Determine field identifier: label > placeholder > name > id > type
    const fieldIdentifier = label ? `"${label}" field` :
        placeholder ? `"${placeholder}" field` :
            fieldName ? `"${fieldName}" field` :
                fieldId ? `field #${fieldId}` :
                    inputType ? `${inputType} field` : 'input field';

    // Mask password values
    const displayValue = inputType === 'password' ? '••••••••' : `"${value}"`;

    const actionName = `Enter ${displayValue} into ${fieldIdentifier}`;

    // Debounce input events
    clearTimeout(element._inputTimeout);
    element._inputTimeout = setTimeout(() => {
        recordStep({
            eventType: 'input',
            actionName: actionName,
            element: element,
            value: inputType === 'password' ? '[REDACTED]' : value
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

    if (event.key === 'Enter') {
        const element = event.target;
        const label = SelectorEngine.getAssociatedLabel(element);
        const placeholder = element.placeholder;
        const name = element.name;

        // Give context about WHERE Enter was pressed
        const context = label ? ` in "${label}" field` :
            placeholder ? ` in "${placeholder}" field` :
                name ? ` in "${name}" field` : '';

        recordStep({
            eventType: 'keypress',
            actionName: `Press Enter key${context}`,
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

    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
        const y = window.scrollY;
        const x = window.scrollX;
        const direction = y > 0 ? 'down' : 'up';
        recordStep({
            eventType: 'scroll',
            actionName: `Scroll ${direction} — page position X:${x}, Y:${y}`,
            element: null,
            value: { x, y }
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
        actionName: `Navigate away from "${document.title || window.location.href}" (${window.location.href})`,
        element: null,
        value: null
    });
}

/**
 * Return a human-readable role label for an element (used in action names).
 */
function getElementRoleLabel(element) {
    const tag = element.tagName.toLowerCase();
    const type = (element.type || '').toLowerCase();
    const role = element.getAttribute?.('role');

    if (role) return role;
    if (tag === 'button') return 'button';
    if (tag === 'a') return 'link';
    if (tag === 'select') return 'dropdown';
    if (tag === 'textarea') return 'text area';
    if (tag === 'input') {
        if (type === 'submit') return 'Submit button';
        if (type === 'button') return 'button';
        if (type === 'checkbox') return 'checkbox';
        if (type === 'radio') return 'radio button';
        if (type === 'password') return 'password field';
        if (type === 'email') return 'email field';
        if (type === 'search') return 'search field';
        if (type === 'file') return 'file input';
        return 'input field';
    }
    if (tag === 'img') return 'image';
    if (tag === 'label') return 'label';
    if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag)) return 'heading';
    if (tag === 'li') return 'list item';
    if (tag === 'td' || tag === 'th') return 'table cell';
    return tag; // fallback: raw tag name
}

/**
 * Gets a user-friendly name for an element, prioritizing labels over other attributes.
 */
function getElementFriendlyName(element) {
    if (!element) return 'N/A';

    const label = SelectorEngine.getAssociatedLabel(element);
    // Clean label text from common artifacts like '*'
    if (label) return label.replace(/[*:]/g, '').trim();

    const text = SelectorEngine.getElementText(element);
    if (text) return `${element.tagName.toLowerCase()} with text "${text}"`;

    const placeholder = element.getAttribute('placeholder');
    if (placeholder) return placeholder;
    
    const name = element.name;
    if (name) return name;

    return getElementRoleLabel(element);
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
            metadata: selectors.metadata,
            friendlyName: getElementFriendlyName(element) // Add the friendly name here
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
