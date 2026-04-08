/**
 * Exporter - Generates test code in multiple formats
 * Supports: CSV (Manual), Playwright, Selenium, JSON, BDD/Gherkin, Excel (.xlsx)
 * Includes assertion steps (visibility, text, value)
 */

const Exporter = {
    /**
     * Export as Manual Test Case (CSV format)
     */
    exportManualTestCase(steps) {
        const headers = ['Step No', 'Action', 'Element', 'Locator', 'Playwright Locator', 'Test Data', 'Expected Result'];
        const rows = [headers];

        steps.forEach((step, index) => {
            const stepNo = index + 1;
            const action = this.getActionType(step.eventType, step.assertionType);
            const element = this.getElementDescription(step);
            const locator = step.element?.xpath?.relative || step.element?.css || 'N/A';
            const playwrightLocator = step.element?.playwright || 'N/A';
            let testData = 'N/A';
            if (step.eventType === 'assertion') {
                testData = (step.value !== null && step.value !== undefined ? String(step.value) : 'N/A');
            } else if (step.eventType === 'navigation') {
                testData = step.url || 'N/A';
            } else if (step.eventType === 'scroll' && step.value && typeof step.value === 'object') {
                testData = `X: ${step.value.x}, Y: ${step.value.y}`;
            } else {
                testData = (step.value !== null && step.value !== undefined ? String(step.value) : 'N/A');
            }
            const expectedResult = this.getExpectedResult(step);

            rows.push([
                stepNo,
                action,
                this.csvEscape(element),
                this.csvEscape(locator),
                this.csvEscape(playwrightLocator),
                this.csvEscape(String(testData)),
                this.csvEscape(expectedResult)
            ]);
        });

        return rows.map(row => row.join(',')).join('\n');
    },

    /**
     * Build structured rows for both CSV and Excel (shared logic)
     */
    buildManualTestRows(steps) {
        const headers = ['Step No', 'Action', 'Element', 'Locator', 'Playwright Locator', 'Test Data', 'Expected Result'];
        const rows = [headers];

        let realStepNo = 1;
        steps.forEach((step, index) => {
            if (step.eventType === 'group') {
                rows.push(['---', `Scenario name: ${step.actionName}`, '---', '---', '---', '---', '---']);
                realStepNo = 1; // reset step counter!
                return;
            }
            const stepNo = realStepNo++;
            const action = this.getActionType(step.eventType, step.assertionType);
            const element = this.getElementDescription(step);
            const locator = step.element?.xpath?.relative || step.element?.css || 'N/A';
            const playwrightLocator = step.element?.playwright || 'N/A';
            let testData = 'N/A';
            if (step.eventType === 'assertion') {
                testData = (step.value !== null && step.value !== undefined ? String(step.value) : 'N/A');
            } else if (step.eventType === 'navigation') {
                testData = step.url || 'N/A';
            } else if (step.eventType === 'scroll' && step.value && typeof step.value === 'object') {
                testData = `X: ${step.value.x}, Y: ${step.value.y}`;
            } else {
                testData = (step.value !== null && step.value !== undefined ? String(step.value) : 'N/A');
            }
            const expectedResult = this.getExpectedResult(step);

            rows.push([String(stepNo), action, element, locator, playwrightLocator, testData, expectedResult]);
        });

        return rows;
    },

    /**
     * Export as Excel (.xlsx) using SheetJS
     */
    exportExcel(steps) {
        if (typeof XLSX === 'undefined') {
            throw new Error('SheetJS (XLSX) library not loaded');
        }

        const rows = this.buildManualTestRows(steps);

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(rows);

        // Column widths
        ws['!cols'] = [
            { wch: 8 },   // Step No
            { wch: 22 },  // Action
            { wch: 30 },  // Element
            { wch: 40 },  // Locator
            { wch: 40 },  // Playwright Locator
            { wch: 25 },  // Test Data
            { wch: 40 },  // Expected Result
        ];

        XLSX.utils.book_append_sheet(wb, ws, 'Test Steps');

        // Return as array buffer
        return XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    },

    /**
     * Export Flow Summary as Excel (.xlsx)
     * Produces a QA-facing, single-row test case sheet — NO locators.
     * @param {Array}  steps     - Recorded steps array
     * @param {Object|null} aiSummary - Parsed Groq response (or null for auto-summary)
     */
    exportFlowSummaryExcel(steps, aiSummary = null) {
        if (typeof XLSX === 'undefined') {
            throw new Error('SheetJS (XLSX) library not loaded');
        }

        let summaries = aiSummary || this.buildAutoSummary(steps);
        if (!Array.isArray(summaries)) {
            summaries = [summaries];
        }

        // ── Headers ──
        const headers = [
            'Test Case ID',
            'Module / Feature',
            'Test Case Name',
            'Preconditions',
            'Test Steps',
            'Test Data',
            'Expected Result',
            'Priority',
            'Status',
            'Notes'
        ];

        const rows = [headers];

        // Group steps by scenarios to map test data properly
        const stepGroups = [];
        let currentGroupSteps = [];
        steps.forEach(s => {
            if (s.eventType === 'group') {
                if (currentGroupSteps.length > 0) stepGroups.push(currentGroupSteps);
                currentGroupSteps = [];
            } else {
                currentGroupSteps.push(s);
            }
        });
        if (currentGroupSteps.length > 0) stepGroups.push(currentGroupSteps);

        summaries.forEach((summary, index) => {
            const relevantSteps = summary.rawSteps || stepGroups[index] || steps;

            const stepsText = Array.isArray(summary.testSteps)
                ? summary.testSteps.join('\n')
                : String(summary.testSteps || '');

            const testDataValues = relevantSteps
                .filter(s => s.value !== null && s.value !== undefined && s.value !== '' && s.value !== false && typeof s.value !== 'object')
                .map(s => {
                    const desc = this.getElementDescription(s);
                    // Try to get a clean field name: "Email Address" from "input: Email Address"
                    const fieldName = desc.includes(': ') ? desc.split(': ')[1] : desc;
                    return `${fieldName}: ${s.value}`;
                })
                .filter((v, i, a) => a.indexOf(v) === i)
                .join(', ');

            const tcId = `TC-${String(index + 1).padStart(3, '0')}`;

            rows.push([
                tcId,
                (summary.module && summary.module !== 'Web Application') ? summary.module : (this.extractModuleName(relevantSteps) || 'Web Application'),
                summary.testCaseName || 'Recorded User Flow',
                summary.preconditions || `Browser open. Navigate to ${relevantSteps.find(s => s.url)?.url || 'the application URL'}.`,
                stepsText,
                testDataValues || 'N/A',
                summary.expectedResult || 'Application performs all steps successfully without errors.',
                summary.priority || 'Medium',
                '',
                ''
            ]);
        });

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(rows);

        // Column widths
        ws['!cols'] = [
            { wch: 14 },  // Test Case ID
            { wch: 22 },  // Module
            { wch: 38 },  // Test Case Name
            { wch: 40 },  // Preconditions
            { wch: 55 },  // Test Steps
            { wch: 30 },  // Test Data
            { wch: 45 },  // Expected Result
            { wch: 10 },  // Priority
            { wch: 12 },  // Status
            { wch: 25 },  // Notes
        ];

        // Enable text wrap for the Test Steps cell in each row (Col E, 0-indexed column 4)
        for (let r = 1; r < rows.length; r++) {
            const stepsCell = ws[XLSX.utils.encode_cell({ r: r, c: 4 })];
            if (stepsCell) {
                stepsCell.s = { alignment: { wrapText: true, vertical: 'top' } };
            }
        }

        XLSX.utils.book_append_sheet(wb, ws, 'Flow Summary');
        return XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    },

    /**
     * Export Structured AI Steps as Excel (.xlsx)
     * Takes strictly formatted input from AI structureSteps()
     */
    exportStructuredExcel(structuredSteps) {
        if (typeof XLSX === 'undefined') {
            throw new Error('SheetJS (XLSX) library not loaded');
        }

        const headers = ['Step No', 'Action', 'Test Data', 'Expected Result'];
        const rows = [headers];

        structuredSteps.forEach(step => {
            rows.push([
                String(step.stepNo || ''),
                String(step.action || ''),
                String(step.testData || ''),
                String(step.expectedResult || '')
            ]);
        });

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(rows);

        // Styling widths
        ws['!cols'] = [
            { wch: 10 },  // Step No
            { wch: 60 },  // Action
            { wch: 30 },  // Test Data
            { wch: 50 },  // Expected Result
        ];

        XLSX.utils.book_append_sheet(wb, ws, 'Structured QA Steps');
        return XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    },

    /**
     * Auto-generate a flow summary without AI (fallback)
     */
    buildAutoSummary(steps) {
        const scenarios = [];
        let currentGroup = { actionName: 'Recorded User Flow', steps: [] };

        if (steps.length > 0 && steps[0].eventType === 'group') {
            currentGroup.actionName = steps[0].actionName;
        }

        steps.forEach(s => {
            if (s.eventType === 'group') {
                if (currentGroup.steps.length > 0) scenarios.push(currentGroup);
                currentGroup = { actionName: s.actionName || 'Recorded User Flow', steps: [] };
            } else if (s.eventType !== 'group') {
                currentGroup.steps.push(s);
            }
        });
        if (currentGroup.steps.length > 0) scenarios.push(currentGroup);
        if (scenarios.length === 0) return [];

        return scenarios.map((scenario, index) => {
            const firstUrl = scenario.steps.find(s => s.url)?.url || '';
            const domain = this.extractModuleName(scenario.steps) || 'Web Application';

            const actionSteps = scenario.steps
                .filter(s => s.eventType !== 'navigation' || scenario.steps.indexOf(s) === 0)
                .map((s, i) => {
                    if (s.eventType === 'assertion') {
                        const aType = { visibility: 'is visible', text: `has text "${s.value}"`, value: `has value "${s.value}"` };
                        return `${i + 1}. Verify element ${aType[s.assertionType] || 'assertion'}`;
                    }
                    return `${i + 1}. ${s.actionName}`;
                });

            return {
                testCaseName: scenario.actionName || `User flow on ${domain}`,
                module: domain,
                preconditions: `Browser is open. Navigate to: ${firstUrl}`,
                testSteps: actionSteps,
                expectedResult: 'All steps complete successfully and the application responds correctly.',
                priority: 'Medium',
                rawSteps: scenario.steps
            };
        });
    },

    /**
     * Export as Playwright Test
     */
    exportPlaywright(steps) {
        const scenarios = this.groupStepsIntoScenarios(steps);
        const moduleName = this.extractModuleName(steps) || 'App';
        const pageClassName = `${moduleName}Page`;
        
        let output = `/**\n * file Name: ${pageClassName.toLowerCase()}.js\n */\n\n`;
        output += `class ${pageClassName} {\n`;
        output += `  constructor(page) {\n`;
        output += `    this.page = page;\n`;

        // 1. Identify all unique elements and assign variable names
        const elementMap = new Map();
        let elCounter = 1;
        
        steps.forEach(s => {
            if (s.element && !elementMap.has(s.element.playwright)) {
                let varName = s.actionName.toLowerCase()
                    .replace(/[^a-z0-9]/g, '_')
                    .replace(/^click_|^type_|^select_/, '')
                    .replace(/_+/g, '_')
                    .replace(/^_|_$/g, '');
                
                if (!varName || varName === 'element') varName = `element_${elCounter++}`;
                // Avoid duplicates
                const originalVarName = varName;
                let suffix = 1;
                while ([...elementMap.values()].includes(varName)) {
                    varName = `${originalVarName}_${suffix++}`;
                }
                
                elementMap.set(s.element.playwright, varName);
                output += `    this.${varName} = ${s.element.playwright};\n`;
            }
        });
        
        output += `  }\n\n`;

        // 2. Generate methods for each scenario
        scenarios.forEach((scenario, index) => {
            const methodName = `executeScenario${index + 1}`;
            output += `  /**\n   * ${scenario.name}\n   */\n`;
            output += `  async ${methodName}(data) {\n`;
            
            scenario.steps.forEach(step => {
                const code = this.generatePlaywrightStepPOM(step, elementMap);
                if (code) {
                    output += `    ${code}\n`;
                }
            });
            output += `  }\n\n`;
        });
        output += `}\n\n`;

        // 3. Generate Data Driven config
        output += `/**\n * Data Driven Testing Configuration\n */\n`;
        const testData = scenarios.map((scenario, index) => {
            const dataEntry = {};
            scenario.steps.forEach(s => {
                if (s.eventType === 'input' || s.eventType === 'change') {
                    const varName = elementMap.get(s.element?.playwright);
                    if (varName) dataEntry[varName] = s.value;
                }
            });
            return { name: scenario.name, data: dataEntry };
        });
        output += `const testData = ${JSON.stringify(testData, null, 2)};\n\n`;

        // 4. Generate Spec File
        const specName = `${moduleName.toLowerCase()}.spec.js`;
        output += `/**\n * file Name: ${specName}\n */\n\n`;
        output += `import { test, expect } from '@playwright/test';\n\n`;
        
        output += `test.describe('${moduleName} Tests', () => {\n`;
        output += `  let appPage;\n\n`;
        output += `  test.beforeEach(async ({ page }) => {\n`;
        output += `    appPage = new ${pageClassName}(page);\n`;
        const firstUrl = steps.find(s => s.url)?.url;
        if (firstUrl) {
            output += `    await page.goto('${firstUrl}');\n`;
        }
        output += `  });\n\n`;

        // Create a test for each scenario using DDT
        testData.forEach((td, index) => {
            output += `  test('${td.name}', async () => {\n`;
            output += `    await appPage.executeScenario${index + 1}(testData[${index}].data);\n`;
            output += `  });\n\n`;
        });

        output += `});\n`;

        return output;
    },

    /**
     * Helper to group steps by Scenario (EventType: group)
     */
    groupStepsIntoScenarios(steps) {
        const scenarios = [];
        let current = { name: 'Recorded Scenario 1', steps: [] };
        
        steps.forEach(s => {
            if (s.eventType === 'group') {
                if (current.steps.length > 0) scenarios.push(current);
                current = { name: s.actionName || `Scenario ${scenarios.length + 2}`, steps: [] };
            } else {
                current.steps.push(s);
            }
        });
        if (current.steps.length > 0) scenarios.push(current);
        return scenarios;
    },

    /**
     * Generate step code for POM method
     */
    generatePlaywrightStepPOM(step, elementMap) {
        const { eventType, assertionType, element } = step;
        const varName = elementMap.get(element?.playwright);
        
        if (eventType === 'assertion') {
            const locator = varName ? `this.${varName}` : (element?.playwright || 'null');
            const val = this.escapeString(step.value);
            switch (assertionType) {
                case 'visibility': return `await expect(${locator}).toBeVisible();`;
                case 'text': return `await expect(${locator}).toHaveText('${val}');`;
                case 'value': return `await expect(${locator}).toHaveValue('${val}');`;
            }
        }

        if (eventType === 'navigation' && step.url) return `await this.page.goto('${step.url}');`;
        if (eventType === 'scroll' && step.value) return `await this.page.evaluate(() => window.scrollTo(${step.value.x}, ${step.value.y}));`;

        if (!varName) return null;

        switch (eventType) {
            case 'click': return `await this.${varName}.click();`;
            case 'input': return `await this.${varName}.fill(data.${varName} || '${this.escapeString(step.value)}');`;
            case 'change': 
                if (element?.metadata?.tag === 'select') return `await this.${varName}.selectOption(data.${varName} || '${this.escapeString(step.value)}');`;
                return `await this.${varName}.check();`;
            case 'keypress':
                if (step.value === 'Enter') return `await this.${varName}.press('Enter');`;
                return null;
        }
        return null;
    },

    /**
     * Export as Selenium Java Test
     */
    exportSelenium(steps) {
        const scenarios = this.groupStepsIntoScenarios(steps);
        const moduleName = this.extractModuleName(steps) || "App";
        const pageClassName = `${moduleName}Page`;

        let output = `/**\n * file Name: ${pageClassName}.java\n */\n\n`;
        output += `import org.openqa.selenium.WebDriver;\n`;
        output += `import org.openqa.selenium.WebElement;\n`;
        output += `import org.openqa.selenium.support.FindBy;\n`;
        output += `import org.openqa.selenium.support.PageFactory;\n`;
        output += `import org.openqa.selenium.support.ui.ExpectedConditions;\n`;
        output += `import org.openqa.selenium.support.ui.WebDriverWait;\n`;
        output += `import java.time.Duration;\n\n`;
        
        output += `public class ${pageClassName} {\n`;
        output += `    private WebDriver driver;\n`;
        output += `    private WebDriverWait wait;\n\n`;

        const elementMap = new Map();
        let elCounter = 1;

        steps.forEach(s => {
            const locator = s.element?.xpath?.relative || s.element?.css;
            if (locator && !elementMap.has(locator)) {
                let varName = (s.element.friendlyName || s.actionName).toLowerCase()
                    .replace(/[^a-z0-9]/g, '_')
                    .replace(/^click_|^type_|^select_/, '')
                    .replace(/_+/g, '_')
                    .replace(/^_|_$/g, '');
                
                if (!varName || varName === "element") varName = `element_${elCounter++}`;
                const originalVarName = varName;
                let suffix = 1;
                while ([...elementMap.values()].includes(varName)) {
                    varName = `${originalVarName}_${suffix++}`;
                }

                elementMap.set(locator, varName);

                if (s.element.xpath?.relative) {
                    output += `    @FindBy(xpath = "${s.element.xpath.relative.replace(/"/g, '\\"')}")\n`;
                } else {
                    output += `    @FindBy(css = "${s.element.css.replace(/"/g, '\\"')}")\n`;
                }
                output += `    private WebElement ${varName};\n\n`;
            }
        });

        output += `    public ${pageClassName}(WebDriver driver) {\n`;
        output += `        this.driver = driver;\n`;
        output += `        this.wait = new WebDriverWait(driver, Duration.ofSeconds(10));\n`;
        output += `        PageFactory.initElements(driver, this);\n`;
        output += `    }\n\n`;

        scenarios.forEach((scenario, index) => {
            output += `    public void executeScenario${index + 1}(java.util.Map<String, String> data) {\n`;
            scenario.steps.forEach(step => {
                const locator = step.element?.xpath?.relative || step.element?.css;
                const varName = elementMap.get(locator);
                const code = this.generateSeleniumStepPOM(step, varName);
                if (code) output += `        ${code}\n`;
            });
            output += `    }\n\n`;
        });
        output += `}\n\n`;

        output += `/**\n * file Name: ${moduleName}Test.java\n */\n\n`;
        output += `import org.openqa.selenium.WebDriver;\n`;
        output += `import org.openqa.selenium.chrome.ChromeDriver;\n`;
        output += `import org.testng.annotations.*;\n`;
        output += `import java.util.HashMap;\n`;
        output += `import java.util.Map;\n\n`;
        
        output += `public class ${moduleName}Test {\n`;
        output += `    private WebDriver driver;\n`;
        output += `    private ${pageClassName} page;\n\n`;

        output += `    @BeforeMethod\n`;
        output += `    public void setUp() {\n`;
        output += `        driver = new ChromeDriver();\n`;
        output += `        page = new ${pageClassName}(driver);\n`;
        const firstUrl = steps.find(s => s.url)?.url;
        if (firstUrl) output += `        driver.get("${firstUrl}");\n`;
        output += `    }\n\n`;

        scenarios.forEach((scenario, index) => {
            output += `    @Test\n`;
            output += `    public void test${index + 1}_${scenario.name.replace(/[^a-zA-Z0-9]/g, "")}() {\n`;
            output += `        Map<String, String> data = new HashMap<>();\n`;
            scenario.steps.forEach(s => {
                if ((s.eventType === 'input' || s.eventType === 'change') && s.value) {
                    const varName = elementMap.get(s.element?.xpath?.relative || s.element?.css);
                    if (varName) output += `        data.put("${varName}", "${this.escapeString(s.value)}");\n`;
                }
            });
            output += `        page.executeScenario${index + 1}(data);\n`;
            output += `    }\n\n`;
        });

        output += `    @AfterMethod\n`;
        output += `    public void tearDown() {\n`;
        output += `        if (driver != null) driver.quit();\n`;
        output += `    }\n`;
        output += `}\n`;

        return output;
    },

    generateSeleniumStepPOM(step, varName) {
        if (step.eventType === 'navigation' && step.url) return `driver.get("${step.url}");`;
        if (step.eventType === 'scroll' && step.value) return `((org.openqa.selenium.JavascriptExecutor) driver).executeScript("window.scrollTo(${step.value.x}, ${step.value.y})");`;
        
        if (!varName) return null;
        
        const val = this.escapeString(step.value);
        switch (step.eventType) {
            case 'click': return `wait.until(ExpectedConditions.elementToBeClickable(${varName})).click();`;
            case 'input': return `${varName}.clear(); ${varName}.sendKeys(data.getOrDefault("${varName}", "${val}"));`;
            case 'change': 
                if (step.element?.metadata?.tag === 'select') return `new org.openqa.selenium.support.ui.Select(${varName}).selectByVisibleText(data.getOrDefault("${varName}", "${val}"));`;
                return `if (!${varName}.isSelected()) ${varName}.click();`;
            case 'assertion':
                switch (step.assertionType) {
                    case 'visibility': return `org.testng.Assert.assertTrue(wait.until(ExpectedConditions.visibilityOf(${varName})).isDisplayed());`;
                    case 'text': return `org.testng.Assert.assertEquals(${varName}.getText(), data.getOrDefault("${varName}_expected", "${val}"));`;
                    case 'value': return `org.testng.Assert.assertEquals(${varName}.getAttribute("value"), data.getOrDefault("${varName}_expected", "${val}"));`;
                }
        }
        return null;
    },

    /**
     * Generate Playwright step code (including assertions)
     */
    generatePlaywrightStep(step) {
        const { eventType, assertionType, element, value } = step;

        // Handle assertion steps
        if (eventType === 'assertion') {
            return this.generatePlaywrightAssertion(step);
        }

        if (!element && eventType !== 'navigation' && eventType !== 'scroll') {
            return null;
        }

        const locator = element?.playwright || `page.locator('${element?.css}')`;

        switch (eventType) {
            case 'click':
                return `await ${locator}.click();`;

            case 'input':
                return `await ${locator}.fill('${this.escapeString(value)}');`;

            case 'change':
                if (element?.metadata?.tag === 'select') {
                    return `await ${locator}.selectOption('${this.escapeString(value)}');`;
                } else if (element?.metadata?.type === 'checkbox') {
                    return value ? `await ${locator}.check();` : `await ${locator}.uncheck();`;
                }
                return null;

            case 'keypress':
                if (value === 'Enter') {
                    return `await ${locator}.press('Enter');`;
                }
                return null;

            case 'scroll':
                if (value && typeof value === 'object') {
                    return `await page.evaluate(() => window.scrollTo(${value.x}, ${value.y}));`;
                }
                return null;

            case 'navigation':
                if (step.url) {
                    return `await page.goto('${step.url}');`;
                }
                return null;

            default:
                return null;
        }
    },

    /**
     * Generate Playwright assertion code
     */
    generatePlaywrightAssertion(step) {
        const { assertionType, element, value } = step;
        if (!element) return null;

        const locator = element?.playwright || `page.locator('${element?.css}')`;

        switch (assertionType) {
            case 'visibility':
                return `await expect(${locator}).toBeVisible();`;

            case 'text':
                if (value !== null && value !== undefined && value !== '') {
                    return `await expect(${locator}).toHaveText('${this.escapeString(value)}');`;
                }
                return `await expect(${locator}).toBeVisible();`;

            case 'value':
                if (value !== null && value !== undefined) {
                    return `await expect(${locator}).toHaveValue('${this.escapeString(value)}');`;
                }
                return `await expect(${locator}).toBeVisible();`;

            default:
                return `await expect(${locator}).toBeVisible();`;
        }
    },

    /**
     * Export as Selenium Java Test
     */
    exportSelenium(steps) {
        let code = `import org.openqa.selenium.By;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.chrome.ChromeDriver;
import org.openqa.selenium.support.ui.Select;
import org.openqa.selenium.support.ui.ExpectedConditions;
import org.openqa.selenium.support.ui.WebDriverWait;
import org.testng.Assert;
import org.testng.annotations.Test;
import org.testng.annotations.BeforeMethod;
import org.testng.annotations.AfterMethod;
import java.time.Duration;

public class RecordedTest {
    private WebDriver driver;
    private WebDriverWait wait;

    @BeforeMethod
    public void setUp() {
        driver = new ChromeDriver();
        driver.manage().window().maximize();
        wait = new WebDriverWait(driver, Duration.ofSeconds(10));
    }

    @Test
    public void recordedTestCase() {
`;

        // Get first URL
        const firstStep = steps.find(s => s.url);
        if (firstStep) {
            code += `        driver.get("${firstStep.url}");\n\n`;
        }

        let localStepNo = 1;
        steps.forEach((step, index) => {
            if (step.eventType === 'group') {
                code += `\n        // =========================================\n`;
                code += `        // Scenario name: ${step.actionName}\n`;
                code += `        // =========================================\n\n`;
                localStepNo = 1;
                return;
            }
            const stepCode = this.generateSeleniumStep(step);
            if (stepCode) {
                code += `        // Step ${localStepNo++}: ${step.actionName}\n`;
                code += `        ${stepCode}\n\n`;
            }
        });

        code += `    }

    @AfterMethod
    public void tearDown() {
        if (driver != null) {
            driver.quit();
        }
    }
}
`;

        return code;
    },

    /**
     * Generate Selenium step code (including assertions)
     */
    generateSeleniumStep(step) {
        const { eventType, assertionType, element, value } = step;

        // Handle assertion steps
        if (eventType === 'assertion') {
            return this.generateSeleniumAssertion(step);
        }

        if (!element && eventType !== 'navigation' && eventType !== 'scroll') {
            return null;
        }

        const locator = element?.selenium || `By.cssSelector("${element?.css}")`;

        switch (eventType) {
            case 'click':
                return `driver.findElement(${locator}).click();`;

            case 'input':
                return `driver.findElement(${locator}).sendKeys("${this.escapeString(value)}");`;

            case 'change':
                if (element?.metadata?.tag === 'select') {
                    return `new Select(driver.findElement(${locator})).selectByVisibleText("${this.escapeString(value)}");`;
                } else if (element?.metadata?.type === 'checkbox') {
                    if (value) {
                        return `WebElement checkbox = driver.findElement(${locator});\n        if (!checkbox.isSelected()) checkbox.click();`;
                    } else {
                        return `WebElement checkbox = driver.findElement(${locator});\n        if (checkbox.isSelected()) checkbox.click();`;
                    }
                }
                return null;

            case 'keypress':
                if (value === 'Enter') {
                    return `driver.findElement(${locator}).sendKeys(Keys.ENTER);`;
                }
                return null;

            case 'scroll':
                if (value && typeof value === 'object') {
                    return `((JavascriptExecutor) driver).executeScript("window.scrollTo(${value.x}, ${value.y})");`;
                }
                return null;

            case 'navigation':
                if (step.url) {
                    return `driver.get("${step.url}");`;
                }
                return null;

            default:
                return null;
        }
    },

    /**
     * Generate Selenium assertion code
     */
    generateSeleniumAssertion(step) {
        const { assertionType, element, value } = step;
        if (!element) return null;

        const locator = element?.selenium || `By.cssSelector("${element?.css}")`;

        switch (assertionType) {
            case 'visibility':
                return `Assert.assertTrue(wait.until(ExpectedConditions.visibilityOfElementLocated(${locator})).isDisplayed(), "Element should be visible");`;

            case 'text':
                if (value !== null && value !== undefined && value !== '') {
                    return `Assert.assertEquals(driver.findElement(${locator}).getText().trim(), "${this.escapeString(value)}", "Text should match");`;
                }
                return `Assert.assertTrue(driver.findElement(${locator}).isDisplayed(), "Element should be visible");`;

            case 'value':
                if (value !== null && value !== undefined) {
                    return `Assert.assertEquals(driver.findElement(${locator}).getAttribute("value"), "${this.escapeString(value)}", "Value should match");`;
                }
                return `Assert.assertTrue(driver.findElement(${locator}).isDisplayed(), "Element should be visible");`;

            default:
                return `Assert.assertTrue(driver.findElement(${locator}).isDisplayed(), "Element should be visible");`;
        }
    },

    /**
     * Export as JSON
     */
    exportJSON(steps) {
        return JSON.stringify(steps, null, 2);
    },

    /**
     * Export as BDD/Gherkin
     */
    exportBDD(steps) {
        let feature = `Feature: Recorded Test Case
  As a user
  I want to execute the recorded test scenario
  So that I can verify the application functionality

Scenario: Recorded User Journey\n`;

        let localStepNo = 0;
        steps.forEach((step, index) => {
            if (step.eventType === 'group') {
                feature += `\nScenario name: ${step.actionName}\n`;
                localStepNo = 0;
                return;
            }
            const gherkinStep = this.generateGherkinStep(step, localStepNo);
            if (gherkinStep) {
                feature += `  ${gherkinStep}\n`;
            }
            localStepNo++;
        });

        return feature;
    },

    /**
     * Generate Gherkin step (including assertions)
     */
    generateGherkinStep(step, index) {
        const { eventType, assertionType, actionName, value, url } = step;

        const keyword = index === 0 ? 'Given' :
            (eventType === 'navigation' ? 'When' :
                (eventType === 'assertion' ? 'Then' :
                    (eventType === 'click' || eventType === 'input' || eventType === 'change' ? 'When' : 'And')));

        if (eventType === 'assertion') {
            switch (assertionType) {
                case 'visibility':
                    return `${keyword} I should see the element is visible`;
                case 'text':
                    return `${keyword} the element should have text "${value}"`;
                case 'value':
                    return `${keyword} the element should have value "${value}"`;
                default:
                    return `${keyword} I verify the element`;
            }
        }

        switch (eventType) {
            case 'navigation':
                return `${keyword} I navigate to "${url}"`;

            case 'click':
                return `${keyword} I ${actionName.toLowerCase()}`;

            case 'input':
                return `${keyword} I enter "${value}" in the field`;

            case 'change':
                if (value !== null && value !== undefined) {
                    return `${keyword} I select "${value}"`;
                }
                return `${keyword} I ${actionName.toLowerCase()}`;

            case 'keypress':
                return `${keyword} I press ${value} key`;

            case 'scroll':
                return `${keyword} I scroll the page`;

            default:
                return `${keyword} I ${actionName.toLowerCase()}`;
        }
    },

    /**
     * Helper: Get action type label
     */
    getActionType(eventType, assertionType) {
        if (eventType === 'assertion') {
            const assertLabels = {
                visibility: 'Assert Visibility',
                text: 'Assert Text',
                value: 'Assert Value'
            };
            return assertLabels[assertionType] || 'Assert';
        }

        const actionMap = {
            'click': 'Click',
            'input': 'Enter Text',
            'change': 'Select/Change',
            'keypress': 'Press Key',
            'scroll': 'Scroll',
            'navigation': 'Navigate'
        };
        return actionMap[eventType] || eventType;
    },

    /**
     * Helper: Get element description
     */
    getElementDescription(step) {
    if (!step.element) {
      return step.eventType === 'navigation' ? 'Page' : 'N/A';
    }

    // Use the new friendlyName if it exists
    if (step.element.friendlyName) {
      return step.element.friendlyName;
    }

    // Fallback to the old logic
    const { tag, text, id, name } = step.element.metadata || {};

    if (text) {
      return `${tag} with text "${text}"`;
    } else if (id) {
      return `${tag}#${id}`;
    } else if (name) {
      return `${tag}[name="${name}"]`;
    } else {
      return tag || 'element';
    }
  },

    /**
     * Helper: Get expected result
     */
    getExpectedResult(step) {
        const { eventType, assertionType, value } = step;

        if (eventType === 'assertion') {
            switch (assertionType) {
                case 'visibility': return 'Element should be visible on the page';
                case 'text':
                    const expectedText = (value !== undefined && value !== null && value !== '') ? value : (step.element?.metadata?.text || '');
                    return `Element text should equal "${expectedText}"`;
                case 'value':
                    const expectedVal = (value !== undefined && value !== null && value !== '') ? value : (step.element?.metadata?.value || step.element?.metadata?.text || '');
                    return `Element value should equal "${expectedVal}"`;
                default: return 'Assertion should pass';
            }
        }

        switch (eventType) {
            case 'click':
                return 'Element should be clicked successfully';
            case 'input':
                return `Field should contain "${value}"`;
            case 'change':
                return `Value should be changed to "${value}"`;
            case 'navigation':
                return `Page should load successfully`;
            default:
                return 'Action should complete successfully';
        }
    },

    /**
     * Helper: Escape a CSV cell value
     */
    csvEscape(val) {
        const s = String(val ?? '');
        if (s.includes(',') || s.includes('"') || s.includes('\n')) {
            return '"' + s.replace(/"/g, '""') + '"';
        }
        return s;
    },

    /**
     * Helper: Escape string for code generation
     */
    escapeString(str) {
        if (!str) return '';
        return str.toString()
            .replace(/\\/g, '\\\\')
            .replace(/"/g, '\\"')
            .replace(/'/g, "\\'")
            .replace(/\n/g, '\\n')
            .replace(/\r/g, '\\r')
            .replace(/\t/g, '\\t');
    },

    /**
     * Helper to extract a module name from steps
     */
    extractModuleName(steps) {
        const firstUrl = steps.find(s => s.url)?.url;
        if (!firstUrl) return null;
        try {
            const url = new URL(firstUrl);
            const pathParts = url.pathname.split('/').filter(p => p);
            if (pathParts.length > 0) {
                const name = pathParts[0].replace(/[^a-zA-Z]/g, '');
                return name.charAt(0).toUpperCase() + name.slice(1);
            }
            return url.hostname.split('.')[0].charAt(0).toUpperCase() + url.hostname.split('.')[0].slice(1);
        } catch (_) {
            return 'App';
        }
    }
};

// Export for use in popup
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Exporter;
}
