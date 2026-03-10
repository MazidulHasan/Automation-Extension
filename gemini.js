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
            return JSON.parse(raw);
        } catch (_) {
            return {
                testCaseName: 'AI Generated Test Case',
                module: 'Web Application',
                preconditions: 'Browser is open',
                testSteps: [raw],
                expectedResult: 'Application behaves as expected',
                priority: 'Medium'
            };
        }
    },

    // ─────────────────────────────────────────────────────────
    //  Prompt Engineering
    // ─────────────────────────────────────────────────────────

    SYSTEM_PROMPT: `You are an expert QA engineer. Your job is to analyse a list of recorded browser actions and assertions and produce a clear, concise, human-readable test case.

Rules:
- Do NOT include any CSS selectors, XPath, or technical locators in the output.
- Write test steps as a QA practitioner would: action-focused, numbered, plain English.
- Combine sequential clicks/fills into logical steps where it makes sense.
- For dropdown menus, if a click is followed by a selection, the combined step should be phrased as: "Click the [Dropdown Name] and select [Selected Value]".
- Base the module name on the URL or page context.
- Respond with ONLY a JSON object matching the schema below. No markdown, no explanation.

Schema:
{
  "testCaseName": "string (descriptive name, ≤80 chars)",
  "module": "string (feature or module name)",
  "preconditions": "string (browser/app state before test starts)",
  "testSteps": ["1. ...", "2. ...", "..."],
  "expectedResult": "string (overall expected outcome)",
  "priority": "High | Medium | Low"
}`,

    buildPrompt(steps) {
        // Now handles either an array of objects or an array of strings (simplified manual rows)
        if (typeof steps === 'string') return steps;

        const lines = steps.map((s, i) => {
            const type = s.assertionType ? `[ASSERT ${s.assertionType.toUpperCase()}]` : `[${s.eventType.toUpperCase()}]`;
            const val = s.value !== null && s.value !== undefined ? ` → value: "${s.value}"` : '';
            const url = s.url ? ` (URL: ${s.url})` : '';
            return `${i + 1}. ${type} ${s.actionName}${val}${url}`;
        });

        return `Here are the recorded browser steps:\n\n${lines.join('\n')}\n\nGenerate a structured QA test case summary as JSON.`;
    },

    /**
     * Structure recorded steps specifically for manual QA consumption.
     * Outputs a JSON array of precisely cleaned action, data, and expected objects.
     */
    async structureSteps(stepsText, apiKey) {
        if (!stepsText) return [];
        if (!apiKey) throw new Error('Gemini API key is required.');

        const prompt = `You are a strict QA automation engineer. Convert the following simplified browser recording steps into a perfectly formatted JSON array for manual QA execution. 
        
        CRITICAL: Output ONLY a valid JSON array. No markdown, no introductory text, no code blocks like \`\`\`json.
        
        Structure of each object in the array:
        {
          "stepNo": "Number automatically based on index logic, excluding Group headers",
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
