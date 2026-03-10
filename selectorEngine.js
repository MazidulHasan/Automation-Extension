/**
 * Selector Engine - Generates smart selectors for test automation
 * Supports: XPath, CSS, Playwright, Selenium
 */

const SelectorEngine = {
  /**
   * Generate all selectors for an element
   */
  generateAllSelectors(element) {
    return {
      xpath: this.generateXPath(element),
      css: this.generateCSS(element),
      playwright: this.generatePlaywright(element),
      selenium: this.generateSelenium(element),
      metadata: this.extractMetadata(element)
    };
  },

  /**
   * Generate XPath selectors (absolute, relative, text-based)
   */
  generateXPath(element) {
    return {
      absolute: this.getAbsoluteXPath(element),
      relative: this.getRelativeXPath(element),
      textBased: this.getTextBasedXPath(element),
      attributeBased: this.getAttributeBasedXPath(element)
    };
  },

  /**
   * Get absolute XPath
   */
  getAbsoluteXPath(element) {
    if (element.tagName.toLowerCase() === 'html') {
      return '/html';
    }
    
    if (element === document.body) {
      return '/html/body';
    }

    let path = '';
    let current = element;

    while (current && current.nodeType === Node.ELEMENT_NODE) {
      let index = 0;
      let sibling = current.previousSibling;

      while (sibling) {
        if (sibling.nodeType === Node.ELEMENT_NODE && sibling.tagName === current.tagName) {
          index++;
        }
        sibling = sibling.previousSibling;
      }

      const tagName = current.tagName.toLowerCase();
      const pathIndex = index > 0 ? `[${index + 1}]` : '';
      path = `/${tagName}${pathIndex}${path}`;

      current = current.parentNode;
    }

    return path;
  },

  /**
   * Get relative XPath (smart, stable)
   */
  getRelativeXPath(element) {
    // Try ID first
    if (element.id) {
      return `//*[@id="${element.id}"]`;
    }

    // Try data-test or data-testid
    const testId = element.getAttribute('data-test') || element.getAttribute('data-testid');
    if (testId) {
      return `//*[@data-test="${testId}"]`;
    }

    // Try name attribute
    if (element.name) {
      return `//${element.tagName.toLowerCase()}[@name="${element.name}"]`;
    }

    // Try aria-label
    const ariaLabel = element.getAttribute('aria-label');
    if (ariaLabel) {
      return `//${element.tagName.toLowerCase()}[@aria-label="${ariaLabel}"]`;
    }

    // Try class-based with text
    const text = this.getElementText(element);
    if (text && element.className) {
      const className = element.className.toString().split(' ')[0];
      return `//${element.tagName.toLowerCase()}[@class="${className}" and contains(., "${text}")]`;
    }

    // Try text-based with parent context
    if (text) {
      const parent = element.parentElement;
      if (parent && parent.className) {
        const parentClass = parent.className.toString().split(' ')[0];
        return `//*[@class="${parentClass}"]//${element.tagName.toLowerCase()}[contains(., "${text}")]`;
      }
    }

    // Fallback to class-based
    if (element.className) {
      const className = element.className.toString().split(' ')[0];
      return `//${element.tagName.toLowerCase()}[@class="${className}"]`;
    }

    // Last resort: use absolute path
    return this.getAbsoluteXPath(element);
  },

  /**
   * Get text-based XPath
   */
  getTextBasedXPath(element) {
    const text = this.getElementText(element);
    const tagName = element.tagName.toLowerCase();

    if (!text) {
      return null;
    }

    // Exact text match
    if (text.length < 50) {
      return `//${tagName}[text()="${text}"]`;
    }

    // Contains text
    const shortText = text.substring(0, 30);
    return `//${tagName}[contains(text(), "${shortText}")]`;
  },

  /**
   * Get attribute-based XPath
   */
  getAttributeBasedXPath(element) {
    const attributes = ['id', 'name', 'type', 'placeholder', 'value', 'href', 'src'];
    
    for (const attr of attributes) {
      const value = element.getAttribute(attr);
      if (value) {
        return `//${element.tagName.toLowerCase()}[@${attr}="${value}"]`;
      }
    }

    return null;
  },

  /**
   * Generate CSS selector
   */
  generateCSS(element) {
    // Try ID
    if (element.id) {
      return `#${element.id}`;
    }

    // Try data-test
    const testId = element.getAttribute('data-test') || element.getAttribute('data-testid');
    if (testId) {
      return `[data-test="${testId}"]`;
    }

    // Try name
    if (element.name) {
      return `${element.tagName.toLowerCase()}[name="${element.name}"]`;
    }

    // Try class combination
    if (element.className && typeof element.className === 'string') {
      const classes = element.className.trim().split(/\s+/).filter(c => c);
      if (classes.length > 0) {
        return `${element.tagName.toLowerCase()}.${classes.join('.')}`;
      }
    }

    // Try attribute-based
    const type = element.getAttribute('type');
    if (type) {
      return `${element.tagName.toLowerCase()}[type="${type}"]`;
    }

    // Try nth-child
    const parent = element.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children);
      const index = siblings.indexOf(element) + 1;
      const parentSelector = parent.tagName.toLowerCase();
      return `${parentSelector} > ${element.tagName.toLowerCase()}:nth-child(${index})`;
    }

    return element.tagName.toLowerCase();
  },

  /**
   * Generate Playwright locator following best practices hierarchy
   */
  generatePlaywright(element) {
    const text = this.getElementText(element);
    
    // 1. getByRole
    const role = this.getAriaRole(element);
    if (role && text && text.length < 50) {
      return `page.getByRole('${role}', { name: '${this.escapeAriaName(text)}' })`;
    }

    // 2. getByLabel
    const label = this.getAssociatedLabel(element);
    if (label) {
      return `page.getByLabel('${this.escapeAriaName(label)}')`;
    }

    // 3. getByPlaceholder
    const placeholder = element.getAttribute('placeholder');
    if (placeholder) {
      return `page.getByPlaceholder('${this.escapeAriaName(placeholder)}')`;
    }

    // 4. getByText
    if (text && text.length > 0 && text.length < 50 && !this.isDecorativeElement(element)) {
      // Prioritize exact text match usually
      return `page.getByText('${this.escapeAriaName(text)}', { exact: true })`;
    }

    // 5. getByAltText
    const alt = element.getAttribute('alt');
    if (alt) {
      return `page.getByAltText('${this.escapeAriaName(alt)}')`;
    }

    // 6. getByTitle
    const title = element.getAttribute('title');
    if (title) {
      return `page.getByTitle('${this.escapeAriaName(title)}')`;
    }

    // 7. getByTestId (Playwright default testid usually data-testid)
    const testId = element.getAttribute('data-testid') || element.getAttribute('data-test');
    if (testId) {
      return `page.getByTestId('${this.escapeAriaName(testId)}')`;
    }

    // 8. Fallbacks
    if (element.id) {
      return `page.locator('#${element.id}')`;
    }

    const css = this.generateCSS(element);
    return `page.locator('${css}')`;
  },

  /**
   * Helper to escape names for playwright locators
   */
  escapeAriaName(str) {
    if (!str) return '';
    return str.replace(/'/g, "\\'").replace(/\n/g, " ").trim();
  },

  /**
   * Helper to skip noisy text elements
   */
  isDecorativeElement(element) {
    const tagName = element.tagName.toLowerCase();
    return ['div', 'span', 'p'].includes(tagName) && 
           (!element.onclick && !element.getAttribute('role'));
  },

  /**
   * Generate Selenium locator
   */
  generateSelenium(element) {
    // Try ID
    if (element.id) {
      return `By.id("${element.id}")`;
    }

    // Try name
    if (element.name) {
      return `By.name("${element.name}")`;
    }

    // Try data-test
    const testId = element.getAttribute('data-test') || element.getAttribute('data-testid');
    if (testId) {
      return `By.cssSelector("[data-test='${testId}']")`;
    }

    // Try class name (single class)
    if (element.className && typeof element.className === 'string') {
      const classes = element.className.trim().split(/\s+/);
      if (classes.length === 1) {
        return `By.className("${classes[0]}")`;
      }
    }

    // Try CSS selector
    const css = this.generateCSS(element);
    if (css && !css.includes('>')) {
      return `By.cssSelector("${css}")`;
    }

    // Try XPath
    const xpath = this.getRelativeXPath(element);
    return `By.xpath("${xpath}")`;
  },

  /**
   * Extract element metadata
   */
  extractMetadata(element) {
    return {
      tag: element.tagName.toLowerCase(),
      id: element.id || null,
      name: element.name || null,
      className: element.className || null,
      text: this.getElementText(element),
      value: element.value || null,
      type: element.type || null,
      placeholder: element.getAttribute('placeholder') || null,
      ariaLabel: element.getAttribute('aria-label') || null,
      role: element.getAttribute('role') || null,
      href: element.href || null,
      src: element.src || null,
      dataTest: element.getAttribute('data-test') || element.getAttribute('data-testid') || null,
      html: element.outerHTML.substring(0, 200) // First 200 chars
    };
  },

  /**
   * Get element text content
   */
  getElementText(element) {
    // For input elements
    if (element.tagName.toLowerCase() === 'input') {
      return element.value || element.placeholder || '';
    }

    // For other elements
    let text = element.textContent || element.innerText || '';
    text = text.trim().replace(/\s+/g, ' ');
    
    // Limit length
    if (text.length > 100) {
      text = text.substring(0, 100);
    }

    return text;
  },

  /**
   * Get ARIA role
   */
  getAriaRole(element) {
    // Explicit role
    const explicitRole = element.getAttribute('role');
    if (explicitRole) {
      return explicitRole;
    }

    // Implicit roles
    const tagName = element.tagName.toLowerCase();
    const roleMap = {
      'button': 'button',
      'a': 'link',
      'input': this.getInputRole(element),
      'textarea': 'textbox',
      'select': 'combobox',
      'img': 'img',
      'h1': 'heading',
      'h2': 'heading',
      'h3': 'heading',
      'h4': 'heading',
      'h5': 'heading',
      'h6': 'heading',
      'nav': 'navigation',
      'main': 'main',
      'header': 'banner',
      'footer': 'contentinfo',
      'aside': 'complementary',
      'section': 'region'
    };

    return roleMap[tagName] || null;
  },

  /**
   * Get input role based on type
   */
  getInputRole(element) {
    const type = element.type || 'text';
    const roleMap = {
      'button': 'button',
      'submit': 'button',
      'reset': 'button',
      'checkbox': 'checkbox',
      'radio': 'radio',
      'text': 'textbox',
      'email': 'textbox',
      'password': 'textbox',
      'search': 'searchbox',
      'tel': 'textbox',
      'url': 'textbox'
    };

    return roleMap[type] || 'textbox';
  },

  /**
   * Get associated label for form element
   */
  getAssociatedLabel(element) {
    // Try label with for attribute
    if (element.id) {
      try {
        const label = document.querySelector(`label[for="${element.id.replace(/"/g, '\\"')}"]`);
        if (label) {
          return label.textContent.trim().replace(/\s+/g, ' ');
        }
      } catch (e) {
        // Can happen with complex IDs, we'll try other methods
      }
    }

    // Try parent label
    const parentLabel = element.closest('label');
    if (parentLabel) {
      return parentLabel.textContent.trim().replace(/\s+/g, ' ');
    }

    // Try aria-label
    const ariaLabel = element.getAttribute('aria-label');
    if (ariaLabel) {
      return ariaLabel;
    }

    // Structural search: Look for a label in a sibling element's container, a common pattern in frameworks
    const formGroup = element.closest('.form-group');
    if (formGroup) {
      const previousSibling = formGroup.previousElementSibling;
      if (previousSibling && previousSibling.matches('[class*="col-"]')) {
        const labelInSibling = previousSibling.querySelector('label.control-label, label');
        if (labelInSibling) {
          return labelInSibling.textContent.trim().replace(/\s+/g, ' ');
        }
      }
    }

    return null;
  }
};

// Export for use in content script
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SelectorEngine;
}
