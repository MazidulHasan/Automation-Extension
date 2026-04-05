# 🎬 Mazidul QA Studio

A professional Chrome Extension that captures user interactions and automatically generates test automation code - similar to SelectorsHub Recorder.

## ✨ Features

### 🎯 Smart Recording
- **Comprehensive Event Capture**: Clicks, inputs, form changes, keyboard events, scrolling, and navigation
- **Intelligent Element Highlighting**: Visual feedback as you hover over elements during recording
- **Real-time Step Tracking**: See each action recorded instantly in the popup UI

### 🔍 Advanced Selector Generation
For every interaction, the extension generates:
- **XPath Selectors**
  - Absolute XPath
  - Relative XPath (smart, stable)
  - Text-based XPath
  - Attribute-based XPath
- **CSS Selectors** (ID, class, attribute-based)
- **Playwright Locators** (`getByRole`, `getByText`, `getByLabel`, `locator`)
- **Selenium Locators** (`By.id`, `By.xpath`, `By.cssSelector`)

### 📤 Multiple Export Formats
Export your recorded tests in 5 different formats:

1. **Manual Test Case (CSV)** - For manual testing documentation
2. **Playwright Test** - Ready-to-run JavaScript test file
3. **Selenium Java Test** - TestNG/JUnit compatible Java test
4. **JSON** - Raw structured data for custom processing
5. **BDD/Gherkin** - Feature file for behavior-driven development

### ✏️ Step Management
- **Edit Step Names**: Click edit to rename any step
- **Delete Steps**: Remove unwanted steps
- **Clear All**: Start fresh with one click

## 🚀 Installation

### Method 1: Load Unpacked Extension (Development)

1. **Download/Clone this repository**
   ```bash
   git clone <repository-url>
   cd ChromExtention
   ```

2. **Open Chrome Extensions Page**
   - Navigate to `chrome://extensions/`
   - Or click Menu (⋮) → More Tools → Extensions

3. **Enable Developer Mode**
   - Toggle the "Developer mode" switch in the top-right corner

4. **Load the Extension**
   - Click "Load unpacked"
   - Select the `ChromExtention` folder
   - The extension icon should appear in your toolbar

## 📖 Usage Guide

### Starting a Recording

1. **Click the Extension Icon** in your Chrome toolbar
2. **Click "Start Recording"** button
   - The recording indicator will turn red and blink
3. **Navigate to your test website** (e.g., https://www.saucedemo.com)
4. **Perform your test actions**:
   - Click buttons, links, etc.
   - Fill in input fields
   - Select dropdown options
   - Check/uncheck checkboxes
   - Navigate between pages

### Viewing Recorded Steps

- Each step appears in the popup with:
  - Step number and timestamp
  - Action description
  - Event type
  - XPath and CSS selectors
  - Test data (if applicable)

### Editing Steps

1. Click the **✏️ Edit** button on any step
2. Modify the action name
3. Press Enter or click outside to save

### Exporting Tests

1. **Stop Recording** (if still recording)
2. **Choose Export Format**:
   - **📋 Manual Test** - Downloads CSV file
   - **🎭 Playwright** - Downloads `.spec.js` file
   - **☕ Selenium** - Downloads `.java` file
   - **📄 JSON** - Downloads `.json` file
   - **🥒 BDD** - Downloads `.feature` file

### Example: Playwright Export

```javascript
import { test, expect } from '@playwright/test';

test('Recorded Test Case', async ({ page }) => {
  await page.goto('https://www.saucedemo.com/');

  // Step 1: Enter "standard_user" in "Username"
  await page.getByPlaceholder('Username').fill('standard_user');

  // Step 2: Enter "secret_sauce" in "Password"
  await page.getByPlaceholder('Password').fill('secret_sauce');

  // Step 3: Click "Login"
  await page.getByRole('button', { name: 'Login' }).click();

  // Verify final URL
  await expect(page).toHaveURL('https://www.saucedemo.com/inventory.html');
});
```

### Example: Manual Test Case Export

```csv
Step No,Action,Element,Locator,Test Data,Expected Result
1,Navigate,Page,"//*[@id=""root""]",N/A,Page should load successfully
2,Enter Text,input with placeholder "Username","//*[@placeholder=""Username""]",standard_user,"Field should contain ""standard_user"""
3,Enter Text,input with placeholder "Password","//*[@placeholder=""Password""]",secret_sauce,"Field should contain ""secret_sauce"""
4,Click,button with text "Login","//button[text()='Login']",N/A,Element should be clicked successfully
```

## 🏗️ Architecture

```
┌─────────────────┐
│   Popup UI      │  ← User Interface (popup.html, popup.js, popup.css)
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│  Background     │  ← Service Worker (background.js)
│  Service Worker │     - State management
└────────┬────────┘     - Message routing
         │
         ↓
┌─────────────────┐
│  Content Script │  ← Injected into web pages (content.js)
└────────┬────────┘     - Event listeners
         │              - Element highlighting
         ↓
┌─────────────────┐
│ Selector Engine │  ← Smart selector generation (selectorEngine.js)
└─────────────────┘     - XPath, CSS, Playwright, Selenium

┌─────────────────┐
│    Exporter     │  ← Code generation (exporter.js)
└─────────────────┘     - 5 export formats
```

### File Structure

```
ChromExtention/
├── manifest.json           # Extension configuration (Manifest V3)
├── popup.html             # Popup UI structure
├── popup.css              # Modern dark-themed styling
├── popup.js               # Popup logic and controls
├── background.js          # Background service worker
├── content.js             # Content script (event capture)
├── selectorEngine.js      # Selector generation engine
├── exporter.js            # Export functionality
├── icons/                 # Extension icons
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md              # This file
```

## 🎨 UI Features

- **Modern Dark Theme** with gradient accents
- **Blinking Recording Indicator** for visual feedback
- **Smooth Animations** and hover effects
- **Element Highlighting** on the page during recording
- **Responsive Layout** optimized for extension popup

## 🔧 Technical Details

### Permissions Required
- `activeTab` - Access to current tab
- `storage` - Persist recorded steps
- `scripting` - Inject content scripts
- `tabs` - Tab management
- `<all_urls>` - Work on any website

### Browser Compatibility
- ✅ Google Chrome (Manifest V3)
- ✅ Microsoft Edge (Chromium)
- ✅ Brave Browser
- ✅ Other Chromium-based browsers

### Storage
- Uses `chrome.storage.local` for persistence
- Steps are saved automatically
- Survives browser restarts (if recording was stopped)

## 📝 Example Use Cases

### 1. QA Testing Documentation
Record manual test cases and export as CSV for test case management tools.

### 2. Test Automation Development
Quickly generate Playwright or Selenium test skeletons, then refine with assertions and validations.

### 3. Bug Reporting
Record reproduction steps and export as JSON or manual test case for bug reports.

### 4. BDD Scenarios
Generate Gherkin feature files from user journeys for behavior-driven development.

## 🐛 Troubleshooting

### Extension Not Working
1. Refresh the page you're testing on
2. Reload the extension from `chrome://extensions/`
3. Check browser console for errors (F12)

### Steps Not Recording
1. Ensure "Start Recording" was clicked
2. Check that the recording indicator is blinking red
3. Try clicking "Stop" then "Start" again

### Export Not Working
1. Ensure you have recorded steps
2. Check browser's download settings
3. Try a different export format

### Content Script Not Injecting
1. Some pages (chrome://, chrome-extension://) block content scripts
2. Refresh the page after starting recording
3. Check extension permissions

## 🚧 Known Limitations

1. **Screenshot Capture**: Currently placeholder - full implementation would require html2canvas library
2. **iFrames**: Events inside iframes may not be captured
3. **Shadow DOM**: Elements in shadow DOM may have limited selector generation
4. **Dynamic Content**: Selectors for dynamically generated content may need manual refinement

## 🔮 Future Enhancements

- [ ] Screenshot capture for each step
- [ ] Video recording of entire test session
- [ ] Assertion generation
- [ ] Custom selector preferences
- [ ] Test step grouping
- [ ] Import existing tests
- [ ] Cloud sync for recorded tests

## 📄 License

This project is provided as-is for educational and professional use.

## 🤝 Contributing

Feel free to submit issues, fork the repository, and create pull requests for any improvements.

## 📧 Support

For issues or questions, please create an issue in the repository.

---

**Built with ❤️ for QA Engineers and Test Automation Developers**
