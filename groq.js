/**
 * GroqService - AI-powered test case summarization using Groq API
 * API key is stored securely in chrome.storage.local (never hardcoded)
 * Model: llama-3.3-70b-versatile — best for structured, deterministic output
 */

const GroqService = {

    API_URL: 'https://api.groq.com/openai/v1/chat/completions',
    MODEL: 'llama-3.3-70b-versatile',

    /**
     * Save API key to chrome.storage.local (extension-sandboxed, not exposed to pages)
     */
    async saveApiKey(key) {
        await chrome.storage.local.set({ groqApiKey: key.trim() });
    },

    /**
     * Load API key from chrome.storage.local
     */
    async loadApiKey() {
        const result = await chrome.storage.local.get('groqApiKey');
        return result.groqApiKey || null;
    },

    /**
     * Send recorded steps to Groq and receive a structured test case summary.
     * Returns a parsed object: { testCaseName, module, preconditions, testSteps[], expectedResult, priority }
     */
    async summarizeSteps(steps, apiKey) {
        if (!apiKey) throw new Error('Groq API key is not set. Please add your key in Settings.');

        const prompt = this.buildPrompt(steps);

        let response;
        try {
            response = await fetch(this.API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: this.MODEL,
                    messages: [
                        { role: 'system', content: this.SYSTEM_PROMPT },
                        { role: 'user', content: prompt }
                    ],
                    temperature: 0.15,   // low = deterministic / consistent
                    max_tokens: 1024,
                    response_format: { type: 'json_object' }
                })
            });
        } catch (networkErr) {
            throw new Error('Network error reaching Groq API. Check your internet connection.');
        }

        if (!response.ok) {
            let errMsg = `Groq API error (HTTP ${response.status})`;
            try {
                const errBody = await response.json();
                errMsg = errBody?.error?.message || errMsg;
            } catch (_) { }
            throw new Error(errMsg);
        }

        const data = await response.json();
        const raw = data?.choices?.[0]?.message?.content;
        if (!raw) throw new Error('Empty response from Groq API.');

        try {
            return JSON.parse(raw);
        } catch (_) {
            // If model returned text instead of JSON, wrap it
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

// CommonJS compatibility (not needed in extension but harmless)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GroqService;
}
