/**
 * GeminiService - AI-powered test case summarization using Google Gemini API
 * API key is stored securely in chrome.storage.local
 * Model: gemini-2.5-flash — best for fast structured output
 */

const GeminiService = {

    // Using gemini-2.5-flash for speed and JSON output
    API_URL: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',

    /**
     * Save API key to chrome.storage.local
     */
    async saveApiKey(key) {
        await chrome.storage.local.set({ geminiApiKey: key.trim() });
    },

    /**
     * Load API key from chrome.storage.local
     */
    async loadApiKey() {
        const result = await chrome.storage.local.get('geminiApiKey');
        return result.geminiApiKey || null;
    },

    /**
     * Send recorded steps to Gemini and receive a structured test case summary.
     */
    async summarizeSteps(steps, apiKey) {
        if (!apiKey) throw new Error('Gemini API key is not set. Please add your key in Settings.');

        const prompt = this.buildPrompt(steps);
        const url = `${this.API_URL}?key=${apiKey}`;

        let response;
        try {
            response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{ text: this.SYSTEM_PROMPT + '\n\n' + prompt }]
                    }],
                    generationConfig: {
                        responseMimeType: "application/json",
                        temperature: 0.15
                    }
                })
            });
        } catch (networkErr) {
            throw new Error('Network error reaching Gemini API. Check your internet connection.');
        }

        if (!response.ok) {
            let errMsg = `Gemini API error (HTTP ${response.status})`;
            try {
                const errBody = await response.json();
                errMsg = errBody?.error?.message || errMsg;
            } catch (_) { }
            throw new Error(errMsg);
        }

        const data = await response.json();
        const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!raw) throw new Error('Empty response from Gemini API.');

        try {
            const parsed = JSON.parse(this.extractJson(raw));
            if (parsed.scenarios && Array.isArray(parsed.scenarios)) {
                return parsed.scenarios.map(s => ({
                    module: parsed.module,
                    preconditions: parsed.preconditions,
                    priority: parsed.priority,
                    testCaseName: s.testCaseName,
                    testSteps: s.testSteps,
                    expectedResult: s.expectedResult
                }));
            }
            return parsed;
        } catch (_) {
            return [{
                testCaseName: 'AI Generated Test Case',
                module: 'Web Application',
                preconditions: 'Browser is open',
                testSteps: [raw],
                expectedResult: 'Application behaves as expected',
                priority: 'Medium'
            }];
        }
    },

    // ─────────────────────────────────────────────────────────
    //  Prompt Engineering
    // ─────────────────────────────────────────────────────────

    SYSTEM_PROMPT: `You are an expert QA engineer. Your job is to analyse a list of recorded browser actions and assertions and produce clear, human-readable manual test cases.
If there are multiple groups (e.g. '[GROUP] Scenario name...'), treat each as a scenario. Provide overarching context for the module and preconditions, then split the test steps into scenarios.
Ensure the testCaseName is a professional, meaningful summary of the entire scenario, NOT just a generic placeholder.

Rules:
- Do NOT include any CSS selectors, XPath, or technical locators in the output.
- Formatting: Format EVERY item in the testSteps array exactly as "Step Number | Action | Expected Result" (e.g. "1 | Click the 'Submit' button | Form is submitted").
- Be Specific: NEVER say "Click the link" or "Click the button." Instead, use the element's exact label or text (e.g., "Click the 'Checkout' button" or "Select the 'Pricing' link in the footer").
- Smart Grouping: Combine repetitive or micro-actions into single logical steps. (Bad: 1. Click Username 2. Type 'Admin' 3. Click Password 4. Type '123'. Good: 1. Log in using valid credentials (Username: 'Admin', Password: '123')).
- Preserve Data: Ensure no critical data points (input values, specific URLs, or unique identifiers) are lost during the summarization process.
- When describing a verification/assertion step, ALWAYS include the expected value (e.g., "Verify the 'Status' field has value 'Active'").
- Base the module name on the URL or page context.
- Respond with ONLY a JSON object matching the exact schema below.

Schema:
{
  "module": "string (feature or module name)",
  "preconditions": "string (browser/app state before test starts)",
  "priority": "High | Medium | Low",
  "scenarios": [
    {
      "testCaseName": "string (A highly descriptive, meaningful, and action-oriented name for this specific scenario)",
      "testSteps": ["1 | Action description | Expected outcome", "2 | Another action | Another expected outcome"],
      "expectedResult": "string (overall expected outcome)"
    }
  ]
}`,

    buildPrompt(steps) {
        if (typeof steps === 'string') return steps;

        const lines = steps.map((s, i) => {
            let type = `[${s.eventType.toUpperCase()}]`;
            if (s.eventType === 'group') type = `[GROUP]`;
            if (s.eventType === 'assertion') type = `[ASSERT ${s.assertionType.toUpperCase()}]`;
            
            const val = s.value !== null && s.value !== undefined && typeof s.value !== 'object' ? ` → value: "${s.value}"` : '';
            const url = s.url ? ` (URL: ${s.url})` : '';
            return `${i + 1}. ${type} ${s.actionName}${val}${url}`;
        });

        return `Here are the recorded browser steps:\n\n${lines.join('\n')}\n\nGenerate structured QA test case summaries based on the provided schema.`;
    },

    async structureSteps(stepsText, apiKey) {
        if (!stepsText) return [];
        if (!apiKey) throw new Error('Gemini API key is required.');

        const prompt = `You are a strict QA automation engineer. Convert the following simplified browser recording steps into a perfectly formatted JSON array for manual QA execution. 
        
        CRITICAL: Output ONLY a valid JSON array. No markdown, no introductory text, no code blocks like \`\`\`json.
        
        Structure of each object in the array:
        {
          "stepNo": "Number automatically based on index logic, restarting at 1 for each scenario",
          "action": "Clear instructions (e.g. 'Click the Login button', 'Type \"username\" into Email field')",
          "testData": "Any input values or data typed, empty if none",
          "expectedResult": "Expected outcome (for assertions) or implicit outcome"
        }

        If a step is an eventType "group", treat it as a test case divider. Action should be "TEST CASE: [actionName]" and stepNo should be "-".

        Simplified Steps:
        ${stepsText}`;

        try {
            const url = `${this.API_URL}?key=${apiKey}`;
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: {
                        temperature: 0.1,
                        responseMimeType: "application/json"
                    }
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error?.message || `API responded with status: ${response.status}`);
            }

            const data = await response.json();
            let text = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!text) throw new Error('Empty response from Gemini.');
            
            // Robust JSON extraction
            text = this.extractJson(text);
            
            const parsed = JSON.parse(text);
            // If it returned an object with a "steps" array, use that
            if (!Array.isArray(parsed) && Array.isArray(parsed.steps)) return parsed.steps;
            return Array.isArray(parsed) ? parsed : [];
        } catch (error) {
            console.error('Gemini API Error:', error);
            throw new Error(error.message || 'Failed to generate structured steps with Gemini.');
        }
    },

    /**
     * Clean up model output to ensure it's parseable JSON
     */
    extractJson(text) {
        // Strip markdown backticks
        text = text.replace(/```json/g, '').replace(/```/g, '').trim();
        // If it still has text around the JSON, try to find the first [ and last ]
        const start = text.indexOf('[');
        const end = text.lastIndexOf(']');
        if (start !== -1 && end !== -1 && end > start) {
            return text.substring(start, end + 1);
        }
        // Try object if array fails
        const objStart = text.indexOf('{');
        const objEnd = text.lastIndexOf('}');
        if (objStart !== -1 && objEnd !== -1 && objEnd > objStart) {
            return text.substring(objStart, objEnd + 1);
        }
        return text;
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = GeminiService;
}
