// =====================================================================
// HDB Quality Assistant - Bot Engine
// Handles: data caching, search (RAG), Gemini API calls with retry
// =====================================================================

let cachedChunks = [];
let isChunksCached = false;

// ─── 1. Load & cache all chunks from Firestore ───────────────────────
async function fetchAndCacheChunks(force = false) {
    if (!KNOWLEDGE_BOT_CONFIG.ENABLED) return [];
    if (isChunksCached && !force && cachedChunks.length > 0) return cachedChunks;

    try {
        console.log("📥 Loading knowledge base from Firestore...");
        const snapshot = await db.collection("knowledge_bot_chunks").get();
        cachedChunks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        isChunksCached = true;
        console.log(`✅ Loaded ${cachedChunks.length} knowledge chunks`);

        if (typeof updateDynamicSuggestions === "function") {
            updateDynamicSuggestions();
        }
        return cachedChunks;
    } catch (error) {
        console.error("❌ Failed to load knowledge base:", error);
        return [];
    }
}

// ─── 2. Smart keyword + fuzzy search ─────────────────────────────────
function searchChunks(query) {
    if (!query || !query.trim()) return [];
    if (cachedChunks.length === 0) return [];

    const cleanQuery = query.toLowerCase().trim();

    // Remove stop words from Arabic & English
    const stopWords = new Set([
        "في","على","هل","ما","من","الى","إلى","عن","مع","لو","لي","لك","لها",
        "هو","هي","هم","هن","و","ف","ثم","أو","او","كيف","متى","اين","أين",
        "the","is","are","a","an","of","in","on","at","to","for","it","its","how","what","when","where"
    ]);

    const queryWords = cleanQuery
        .split(/[\s._\-–,;()!?؟،؛:]+/)
        .filter(w => w.length > 1 && !stopWords.has(w));

    // Score each chunk
    const scored = cachedChunks.map(chunk => {
        const content  = (chunk.content  || chunk.answer  || "").toLowerCase();
        const question = (chunk.question || "").toLowerCase();
        const topic    = (chunk.topic    || chunk.sheetName || chunk.sourceName || "").toLowerCase();
        const allText  = content + " " + question + " " + topic;

        let score = 0;

        // Keyword hits
        queryWords.forEach(w => {
            if (content.includes(w))  score += 2.0;
            if (question.includes(w)) score += 5.0;  // questions are high-value
            if (topic.includes(w))    score += 2.5;
        });

        // Exact phrase bonus
        if (content.includes(cleanQuery))  score += 12.0;
        if (question.includes(cleanQuery)) score += 20.0;

        // Coverage ratio bonus
        if (queryWords.length > 0) {
            const matched = queryWords.filter(w => allText.includes(w)).length;
            score += (matched / queryWords.length) * 6.0;
        }

        return { chunk, score };
    });

    let results = scored
        .filter(i => i.score > 0)
        .sort((a, b) => b.score - a.score)
        .map(i => i.chunk);

    // Fuzzy fallback via Fuse.js
    if (results.length === 0 && typeof Fuse !== "undefined") {
        const fuse = new Fuse(cachedChunks, {
            keys: ["question", "content", "answer", "topic", "sheetName"],
            includeScore: true,
            threshold: 0.65,
            ignoreLocation: true,
            minMatchCharLength: 2
        });
        results = fuse.search(query).map(r => r.item);
    }

    // Last resort: send first 5 chunks as general context
    if (results.length === 0 && cachedChunks.length > 0) {
        console.warn("⚠️ No match found — sending general context to AI");
        return cachedChunks.slice(0, 5);
    }

    return results.slice(0, 8);
}

// ─── 3. Call Gemini API with auto-retry on 429 ───────────────────────
async function askGemini(question, relevantChunks) {
    if (!KNOWLEDGE_BOT_CONFIG.ENABLED) return { text: "البوت معطل حالياً.", sources: [] };

    if (!relevantChunks || relevantChunks.length === 0) {
        return { text: KNOWLEDGE_BOT_CONFIG.FALLBACK_MESSAGE, sources: [] };
    }

    // Build context string
    let contextString = "";
    const citations = [];

    relevantChunks.forEach((chunk, idx) => {
        const num = idx + 1;
        let loc = "";
        if (chunk.type === "pdf")     loc = `[PDF: ${chunk.sourceName}, Page ${chunk.pageNumber || 1}]`;
        else if (chunk.type === "excel") loc = `[Excel: ${chunk.sourceName}, Sheet: ${chunk.sheetName || "Sheet1"}, Row: ${chunk.rowNumber || "?"}]`;
        else                           loc = `[Manual: ${chunk.topic || "General"}]`;

        const text = chunk.content || chunk.answer || "";
        contextString += `--- [Source ${num}] ${loc} ---\n${text}\n\n`;
        citations.push({
            ref: num, sourceName: chunk.sourceName, type: chunk.type,
            pageNumber: chunk.pageNumber, sheetName: chunk.sheetName,
            rowNumber: chunk.rowNumber, topic: chunk.topic,
            preview: text.substring(0, 120)
        });
    });

    const systemPrompt = `You are HDB Quality Assistant — an intelligent AI for bank quality support agents.
Your ONLY job: answer the agent's question using the knowledge sources below.

RULES (follow strictly):
1. Read ALL sources carefully. Data may be in CSV/table format from Excel — understand the column:value pairs.
2. If the answer exists in ANY source, answer completely and clearly IN ARABIC.
3. Use bullet points or numbered steps for complex answers.
4. Cite sources like [Source 1] after relevant statements.
5. If NO source contains relevant information, reply ONLY with: "${KNOWLEDGE_BOT_CONFIG.FALLBACK_MESSAGE}"
6. NEVER invent facts. NEVER add information not in the sources.

=== KNOWLEDGE SOURCES ===
${contextString}
=== END OF SOURCES ===

Agent's question: "${question}"

Answer in Arabic:`;

    const payload = {
        contents: [{ role: "user", parts: [{ text: systemPrompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 1500, topP: 0.85 },
        safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT",        threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_HATE_SPEECH",       threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
        ]
    };

    // Model priority list — tries each in order
    const modelQueue = [
        KNOWLEDGE_BOT_CONFIG.AI_MODEL,   // configured model first
        "gemini-2.5-flash",
        "gemini-3.5-flash",
        "gemini-2.0-flash",
        "gemini-2.0-flash-lite",
        "gemini-flash-latest"
    ].filter((m, i, arr) => arr.indexOf(m) === i); // deduplicate

    for (const model of modelQueue) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${KNOWLEDGE_BOT_CONFIG.AI_API_KEY}`;

        try {
            console.log(`🚀 Trying model: ${model}`);

            let attempt = 0;
            let response = null;

            // Retry loop for 429 (rate limit) — up to 3 times with backoff
            while (attempt < 3) {
                response = await fetch(url, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                });

                if (response.status === 429) {
                    attempt++;
                    if (attempt < 3) {
                        const waitSec = attempt * 20; // 20s, 40s
                        console.warn(`⏳ Rate limit on ${model} — waiting ${waitSec}s (attempt ${attempt}/3)`);
                        await new Promise(r => setTimeout(r, waitSec * 1000));
                        continue;
                    } else {
                        console.warn(`⚠️ Rate limit on ${model} after 3 retries — trying next model`);
                        break; // go to next model
                    }
                }
                break; // not 429, exit retry loop
            }

            if (!response || response.status === 429) continue; // skip to next model

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                const errMsg = errData?.error?.message || `HTTP ${response.status}`;
                // 404 = model not available for this key → skip
                if (response.status === 404) {
                    console.warn(`⚠️ Model ${model} not available (404) — skipping`);
                    continue;
                }
                throw new Error(errMsg);
            }

            const data = await response.json();
            const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

            if (!text) {
                const reason = data?.candidates?.[0]?.finishReason || "unknown";
                console.warn(`⚠️ Empty response from ${model} — finishReason: ${reason}`);
                if (reason === "SAFETY") continue; // try next model
                throw new Error(`Empty response (${reason})`);
            }

            // Success!
            console.log(`✅ Got response from ${model}`);
            KNOWLEDGE_BOT_CONFIG.AI_MODEL = model; // cache working model

            const isFallback = text.includes(KNOWLEDGE_BOT_CONFIG.FALLBACK_MESSAGE);
            const tokens = Math.ceil((systemPrompt.length + text.length) / 4);
            logQuery(question, text, !isFallback, tokens);

            return {
                text: text.trim(),
                sources: isFallback ? [] : citations
            };

        } catch (err) {
            console.error(`❌ Error with model ${model}:`, err.message);
            // continue to next model
        }
    }

    // All models failed
    return {
        text: "⚠️ تعذّر التواصل مع خادم الذكاء الاصطناعي الآن.\n\n**السبب المحتمل:** تجاوز حد الطلبات المجانية (rate limit) مؤقتاً.\n\n**الحل:** انتظر دقيقة واحدة ثم أعد السؤال.",
        sources: []
    };
}

// ─── 4. Log queries to Firestore ──────────────────────────────────────
async function logQuery(question, reply, answered, tokensEstimated) {
    try {
        const user = (typeof currentUser !== "undefined" && currentUser?.username) ? currentUser.username : "guest";
        await db.collection("knowledge_bot_logs").add({
            username: user,
            question,
            reply,
            answered,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            tokensEstimated
        });
    } catch (e) {
        console.error("❌ Failed to log query:", e);
    }
}
