/**
 * Exporter - Generates test code in multiple formats
 */

const Exporter = {
    /**
     * Export as Manual Test Case (CSV format)
     */
    exportManualTestCase(steps) {
        const headers = ['Step No', 'Action', 'Element', 'Locator', 'Test Data', 'Expected Result'];
        const rows = [headers];

        steps.forEach((step, index) => {
            const stepNo = index + 1;
            const action = this.getActionType(step.eventType);
            const element = this.getElementDescription(step);
            const locator = step.element?.xpath?.relative || step.element?.css || 'N/A';
            const testData = step.value || 'N/A';
            const expectedResult = this.getExpectedResult(step);

            rows.push([
                stepNo,
                action,
                element,
                `"${locator}"`,
                testData,
                expectedResult
            ]);
        });

        return rows.map(row => row.join(',')).join('\n');
    },

    /**
     * Export as Playwright Test
     */
    exportPlaywright(steps) {
        const imports = `import { test, expect } from '@playwright/test';\n\n`;

        let testBody = `test('Recorded Test Case', async ({ page }) => {\n`;

        // Get first URL
        const firstStep = steps.find(s => s.url);
        if (firstStep) {
            testBody += `  await page.goto('${firstStep.url}');\n\n`;
        }

        steps.forEach((step, index) => {
            const code = this.generatePlaywrightStep(step);
            if (code) {
                testBody += `  // Step ${index + 1}: ${step.actionName}\n`;
                testBody += `  ${code}\n\n`;
            }
        });

        // Add final assertion
        const lastStep = steps[steps.length - 1];
        if (lastStep && lastStep.url) {
            testBody += `  // Verify final URL\n`;
            testBody += `  await expect(page).toHaveURL('${lastStep.url}');\n`;
        }

        testBody += `});\n`;

        return imports + testBody;
    },

    /**
     * Generate Playwright step code
     */
    generatePlaywrightStep(step) {
        const { eventType, element, value } = step;

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
     * Export as Selenium Java Test
     */
    exportSelenium(steps) {
        let code = `import org.openqa.selenium.By;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.chrome.ChromeDriver;
import org.openqa.selenium.support.ui.Select;
import org.testng.annotations.Test;
import org.testng.annotations.BeforeMethod;
import org.testng.annotations.AfterMethod;

public class RecordedTest {
    private WebDriver driver;

    @BeforeMethod
    public void setUp() {
        driver = new ChromeDriver();
        driver.manage().window().maximize();
    }

    @Test
    public void recordedTestCase() {
`;

        // Get first URL
        const firstStep = steps.find(s => s.url);
        if (firstStep) {
            code += `        driver.get("${firstStep.url}");\n\n`;
        }

        steps.forEach((step, index) => {
            const stepCode = this.generateSeleniumStep(step);
            if (stepCode) {
                code += `        // Step ${index + 1}: ${step.actionName}\n`;
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
     * Generate Selenium step code
     */
    generateSeleniumStep(step) {
        const { eventType, element, value } = step;

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

        steps.forEach((step, index) => {
            const gherkinStep = this.generateGherkinStep(step, index);
            if (gherkinStep) {
                feature += `  ${gherkinStep}\n`;
            }
        });

        return feature;
    },

    /**
     * Generate Gherkin step
     */
    generateGherkinStep(step, index) {
        const { eventType, actionName, value, url } = step;

        // First step is usually Given
        const keyword = index === 0 ? 'Given' :
            (eventType === 'navigation' ? 'When' :
                (eventType === 'click' || eventType === 'input' || eventType === 'change' ? 'When' : 'And'));

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
     * Helper: Get action type
     */
    getActionType(eventType) {
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
        const { eventType, value } = step;

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
    }
};

// Export for use in popup
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Exporter;
}
