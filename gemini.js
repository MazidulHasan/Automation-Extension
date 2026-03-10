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

    /**
     * Build the user prompt from recorded steps
     */
    buildPrompt(steps) {
        const lines = steps.map((s, i) => {
            const type = s.assertionType ? `[ASSERT ${s.assertionType.toUpperCase()}]` : `[${s.eventType.toUpperCase()}]`;
            const val = s.value !== null && s.value !== undefined ? ` → value: "${s.value}"` : '';
            const url = s.url ? ` (URL: ${s.url})` : '';
            return `${i + 1}. ${type} ${s.actionName}${val}${url}`;
        });

        return `Here are the recorded browser steps:\n\n${lines.join('\n')}\n\nGenerate a structured QA test case summary as JSON.`;
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = GeminiService;
}
