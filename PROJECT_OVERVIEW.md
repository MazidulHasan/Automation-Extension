# Test Recorder Pro - Project Overview & AI Context

This file serves as a reference for AI assistants and developers to quickly understand the project's architecture, data flow, and file responsibilities, enabling easier navigation and code modifications.

## 🎯 Project Goal
**Test Recorder Pro** is a Manifest V3 Chrome Extension designed to capture user interactions in the browser and automatically generate test automation code. It supports multiple export formats including Playwright, Selenium (Java), JSON, BDD/Gherkin, and Excel/CSV formats for manual test cases. It also features integrations with Groq and Gemini APIs to summarize test flows and generate structured steps.

---

## 🏗️ Architecture & Core Components

### 1. Extension Configuration
- **`manifest.json`**: Manifest V3 file defining permissions (`activeTab`, `storage`, `scripting`, `tabs`), the background service worker, UI actions, and content scripts.

### 2. Background Service (State Management)
- **`background.js`**: The central communication hub.
  - Maintains global state (`isRecording`, `recordedSteps`).
  - Handles message routing between the popup UI and the injected content scripts.
  - Dynamically injects `selectorEngine.js` and `content.js` into active tabs when recording starts.

### 3. Frontend / User Interface (Popup)
- **`popup.html`**: The UI of the extension showing recording controls, export buttons, settings (Groq/Gemini), and the list of recorded steps.
- **`popup.css`**: Styling for the popup interface (dark-themed UI).
- **`popup.js`**: Logic for the popup UI. Handles UI rendering, button clicks (start/stop/resume recording, clearing steps, exporting), and passes actions to `background.js`.

### 4. Event Capture & DOM Interaction
- **`content.js`**: Injected directly into the website the user is testing.
  - Listens to DOM events (`click`, `input`, `change`, `keydown`, `scroll`, etc.).
  - Highlights elements visually as the user interacts with them.
  - Sends recorded interaction payloads back to `background.js` to be stored.
- **`selectorEngine.js`**: The core logic for generating robust locators. Evaluates a given DOM node to produce various locators: Absolute XPath, Relative XPath, Text-based XPath, CSS Selectors, Playwright Locators (`getByRole`, `getByText`), and Selenium Locators.

### 5. Utilities & Modules
- **`exporter.js`**: Transforms the raw JSON recorded steps into the various supported output files (Playwright JS, Selenium Java, CSV, BDD Feature, etc.). Uses `xlsx.full.min.js` to generate Excel sheets.
- **`groq.js` & `gemini.js`**: Handle AI integrations. Send recorded steps to Groq/Gemini API endpoints to get a flow summary or strictly QA-structured step descriptions.
- **`xlsx.full.min.js`**: Third-party library for writing Excel files (`.xlsx`).

---

## 🔄 Data Workflow
1. **Initialize**: User opens the Extension Popup (`popup.html`).
2. **Action**: User clicks "Start Recording". `popup.js` sends a `startRecording` message to `background.js`.
3. **Injection**: `background.js` injects `selectorEngine.js` and `content.js` into the active web tab.
4. **Capture**: The user interacts with the webpage. `content.js` catches an event (e.g., click), uses `selectorEngine.js` to get locators for the target element, and sends a `stepRecorded` message to `background.js`.
5. **Storage**: `background.js` saves the step in memory and local storage.
6. **Export**: User stops the record and chooses an export format. `popup.js` calls the respective function in `exporter.js` to format and download the generated test automation code.

## 🔑 Key Things to Note
- **State Persistence**: State is stored in `chrome.storage.local` to survive browser reloads/closures.
- **Content Security**: Content scripts (`content.js` and `selectorEngine.js`) run in an isolated environment on the website but rely on message passing to communicate with the extension.
- **AI Tooling**: API Keys for Groq/Gemini are stored locally via `chrome.storage.local`. Calls happen directly from the extension to the respective provider API.
