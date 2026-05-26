// =====================================================================
// HDB Quality Assistant - Bot Engine
// Handles: data caching, advanced search (RAG), Gemini API calls with retry & memory
// =====================================================================

let cachedChunks = [];
let isChunksCached = false;
let currentAbortController = null; // متحكم لإلغاء طلب الـ API قيد التشغيل
let cachedSourceProfiles = new Map();

async function loadBotConfiguration() {
    try {
        const doc = await db.collection("systemSettings").doc("knowledge_bot").get();
        if (doc.exists) {
            const data = doc.data();
            if (data.apiKey) KNOWLEDGE_BOT_CONFIG.AI_API_KEY = data.apiKey;
            if (data.proxyUrl) KNOWLEDGE_BOT_CONFIG.AI_PROXY_URL = data.proxyUrl;
            if (data.model) KNOWLEDGE_BOT_CONFIG.AI_MODEL = data.model;
            console.log("⚙️ Loaded live bot configurations from Firestore");
        }
    } catch(e) {
        console.warn("⚠️ Failed to load live bot configurations from Firestore, using default:", e);
    }
}

// ─── 1. Load & cache all chunks from Firestore ───────────────────────
async function fetchAndCacheChunks(force = false) {
    if (!KNOWLEDGE_BOT_CONFIG.ENABLED) return [];

    await loadBotConfiguration();

    if (isChunksCached && !force && cachedChunks.length > 0) return cachedChunks;

    try {
        console.log("📥 Loading knowledge base from Firestore...");
        const snapshot = await db.collection("knowledge_bot_chunks").get();
        cachedChunks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        try {
            const sourcesSnapshot = await db.collection("knowledge_bot_sources").get();
            cachedSourceProfiles = new Map(sourcesSnapshot.docs.map(doc => {
                const data = doc.data() || {};
                return [doc.id, {
                    name: data.name || "",
                    type: data.type || "",
                    analysis: data.analysis || {},
                    profile: data.analysis?.fileProfile || {}
                }];
            }));
        } catch (profileErr) {
            console.warn("Could not load source profiles:", profileErr.message);
            cachedSourceProfiles = new Map();
        }
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

// ─── 2. Smart retrieval: Arabic normalization + colloquial + fuzzy ───
function normalizeForSearch(text) {
    return String(text || "")
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[\u064B-\u065F\u0670]/g, "") // إزالة التشكيل
        .replace(/[إأآٱ]/g, "ا")
        .replace(/ى/g, "ي")
        .replace(/ؤ/g, "و")
        .replace(/ئ/g, "ي")
        .replace(/ة/g, "ه")
        .replace(/ـ/g, "") // إزالة الكشيدة
        .replace(/[^\p{L}\p{N}\s]/gu, " ") // إبقاء الحروف والأرقام فقط
        .replace(/\s+/g, " ")
        .trim();
}

// الكلمات التي يتم استبعادها من البحث لتسريعه ودقته
const KB_STOP_WORDS = new Set([
    "في", "علي", "هل", "ما", "من", "الي", "عن", "مع", "لو", "لي", "لك", "لها",
    "هو", "هي", "هم", "هن", "و", "ف", "ثم", "او", "كيف", "متي", "اين", "ايه",
    "عايز", "عاوزه", "ممكن", "عاوز", "اللي", "ده", "دي", "دا", "انا", "هوه",
    "the", "is", "are", "a", "an", "of", "in", "on", "at", "to", "for", "it", "its",
    "how", "what", "when", "where", "can", "could", "should", "please"
].map(normalizeForSearch));

// تطبيق قاموس تحويل الكلمات العامية والفرانكو إلى مرادفات رسمية (Colloquial & Franco Resolver)
function applyColloquialMapping(query) {
    let cleanQuery = String(query || "").trim();
    if (!cleanQuery) return "";

    // 1. تحويل Franco-Arabic الشائع للغة العربية
    const francoMap = {
        "visa": "فيزا",
        "card": "بطاقة",
        "loan": "قرض",
        "faida": "فائدة",
        "fees": "رسوم",
        "elbank": "البنك",
        "cif": "cif",
        "kyc": "kyc"
    };

    Object.entries(francoMap).forEach(([franco, arabic]) => {
        const regex = new RegExp(`\\b${franco}\\b`, "gi");
        cleanQuery = cleanQuery.replace(regex, arabic);
    });

    // 2. تطبيق قاموس العامية المصرية (من الإعدادات)
    const map = KNOWLEDGE_BOT_CONFIG.COLLOQUIAL_MAP || {};
    let words = cleanQuery.split(/\s+/);
    words = words.map(word => {
        const norm = normalizeForSearch(word);
        if (map[norm]) return map[norm];
        
        // البحث عن تطابق الكلمة بدون إضافات (مثل الـ أو وـ)
        for (let key in map) {
            if (norm.startsWith("ال") && norm.slice(2) === key) {
                return "ال" + map[key];
            }
        }
        return word;
    });

    return words.join(" ");
}

// توسيع الكلمات البحثية بالمرادفات
function expandSearchToken(token) {
    const variants = new Set([token]);
    const prefixes = ["ال", "وال", "بال", "كال", "فال", "لل", "ل", "ب", "و", "ف"];
    const suffixes = ["ها", "هم", "نا", "كم", "ك", "ه", "ي", "ين", "ون", "ات", "ان"];

    // إزالة السوابق
    prefixes.forEach(prefix => {
        if (token.startsWith(prefix) && token.length - prefix.length >= 3) {
            variants.add(token.slice(prefix.length));
        }
    });

    // إزالة اللواحق
    suffixes.forEach(suffix => {
        if (token.endsWith(suffix) && token.length - suffix.length >= 3) {
            variants.add(token.slice(0, -suffix.length));
        }
    });

    // إضافة مرادفات من إعدادات البوت والقاموس البنكي
    const synonyms = {
        "حساب": ["account", "اكونت", "اكاونت"],
        "اكونت": ["account", "حساب"],
        "كارت": ["card", "بطاقه", "فيزا", "مشتريات"],
        "بطاقه": ["card", "كارت", "فيزا"],
        "شكوي": ["complaint", "اعتراض", "مشكله"],
        "مشكله": ["issue", "problem", "شكوي"],
        "رسوم": ["fees", "charges", "مصروفات", "عموله"],
        "عميل": ["customer", "client"],
        "قرض": ["loan", "تمويل", "شخصي"],
        "تمويل": ["loan", "قرض"],
        "فرع": ["branch"],
        "رقم": ["number", "mobile", "phone"],
        "باسورد": ["password", "pin", "كلمه", "مرور"],
        "تفعيل": ["activate", "activation"],
        "الغاء": ["cancel", "cancellation"],
        "تحويل": ["transfer"],
        "سحب": ["withdrawal"],
        "ايداع": ["deposit"]
    };

    const synonymList = synonyms[token] || [];
    synonymList.forEach(s => variants.add(normalizeForSearch(s)));

    // حقن القاموس البنكي HDB
    const glossary = KNOWLEDGE_BOT_CONFIG.GLOSSARY_HDB || {};
    for (let key in glossary) {
        if (token === key || token === normalizeForSearch(key)) {
            variants.add(normalizeForSearch(glossary[key]));
        }
    }

    return [...variants];
}

function tokenizeForSearch(text) {
    const resolvedText = applyColloquialMapping(text);
    const normalized = normalizeForSearch(resolvedText);
    const rawTokens = normalized.split(" ").filter(Boolean);
    const expanded = [];

    rawTokens.forEach(token => {
        if (token.length < 2 || KB_STOP_WORDS.has(token)) return;
        expanded.push(...expandSearchToken(token));
    });

    return [...new Set(expanded)].filter(t => t.length > 1 && !KB_STOP_WORDS.has(t));
}

function getChunkSearchText(chunk) {
    const pathText = Array.isArray(chunk.sourcePath) ? chunk.sourcePath.join(" ") : (chunk.sourcePath || "");
    const columnsText = chunk.columns ? Object.entries(chunk.columns).map(([k, v]) => `${k} ${v}`).join(" ") : "";
    const sourceProfile = cachedSourceProfiles.get(chunk.sourceId)?.profile || {};
    const profileText = [
        sourceProfile.documentType,
        ...(sourceProfile.mainTopics || []).map(t => t.topic || t),
        ...(sourceProfile.keyEntities || []).map(e => e.term || e),
        ...(sourceProfile.generatedQuestions || []),
        ...(sourceProfile.relations || []).map(r => `${r.subject || ""} ${r.relation || ""} ${r.object || ""}`)
    ].filter(Boolean).join(" ");
    const narrativeText = chunk.narrative || ""; // النص السردي المولد للإكسيل

    return [
        chunk.content,
        chunk.answer,
        chunk.question,
        chunk.topic,
        chunk.sourceName,
        chunk.sheetName,
        chunk.pageNumber ? `page ${chunk.pageNumber}` : "",
        chunk.rowNumber ? `row ${chunk.rowNumber}` : "",
        pathText,
        columnsText,
        narrativeText,
        profileText
    ].filter(Boolean).join(" ");
}

function normalizeVector(values) {
    if (!Array.isArray(values)) return [];
    return values.map(v => Number(v) || 0);
}

function cosineSimilarity(a, b) {
    const va = normalizeVector(a);
    const vb = normalizeVector(b);
    const len = Math.min(va.length, vb.length);
    if (!len) return 0;

    let dot = 0;
    let magA = 0;
    let magB = 0;
    for (let i = 0; i < len; i++) {
        dot += va[i] * vb[i];
        magA += va[i] * va[i];
        magB += vb[i] * vb[i];
    }

    if (!magA || !magB) return 0;
    return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

function getEmbeddingTextForChunk(chunk) {
    // نعتمد على النص السردي ومحتوى الجدول عند بناء فيكتور البحث لرفع دقته
    return getChunkSearchText(chunk).slice(0, 6000);
}

async function callGeminiEndpoint({ model, action, payload, abortSignal }) {
    const proxyUrl = (KNOWLEDGE_BOT_CONFIG.AI_PROXY_URL || "").trim();
    
    const requestOptions = {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(proxyUrl ? { provider: "gemini", model, action, payload } : payload)
    };

    // ربط الـ signal لو متوفر لإتاحة إيقاف السؤال
    if (abortSignal) {
        requestOptions.signal = abortSignal;
    }

    if (proxyUrl) {
        const response = await fetch(proxyUrl, requestOptions);
        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData?.error?.message || errData?.message || `Proxy HTTP ${response.status}`);
        }
        return response;
    }

    if (!KNOWLEDGE_BOT_CONFIG.AI_API_KEY) {
        throw new Error("AI API key is missing.");
    }

    const base = action === "batchEmbedContents"
        ? `https://generativelanguage.googleapis.com/v1beta/${model}:${action}`
        : `https://generativelanguage.googleapis.com/v1beta/models/${model}:${action}`;

    return fetch(`${base}?key=${KNOWLEDGE_BOT_CONFIG.AI_API_KEY}`, requestOptions);
}

async function embedTexts(texts, taskType = "RETRIEVAL_DOCUMENT") {
    if (!KNOWLEDGE_BOT_CONFIG.ENABLE_VECTOR_SEARCH) return [];
    if (!KNOWLEDGE_BOT_CONFIG.AI_API_KEY && !KNOWLEDGE_BOT_CONFIG.AI_PROXY_URL) return [];

    const cleanTexts = texts.map(t => String(t || "").trim()).filter(Boolean);
    if (cleanTexts.length === 0) return [];

    const modelName = `models/${KNOWLEDGE_BOT_CONFIG.EMBEDDING_MODEL || "text-embedding-004"}`;
    const payload = {
        requests: cleanTexts.map(text => ({
            model: modelName,
            content: { parts: [{ text }] },
            taskType
        }))
    };

    const response = await callGeminiEndpoint({
        model: modelName,
        action: "batchEmbedContents",
        payload
    });

    if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData?.error?.message || `Embedding HTTP ${response.status}`);
    }

    const data = await response.json();
    return (data.embeddings || []).map(e => normalizeVector(e.values || []));
}

async function embedQueryText(text) {
    const vectors = await embedTexts([text], "RETRIEVAL_QUERY");
    return vectors[0] || [];
}

async function enrichChunksWithEmbeddings(chunks, onProgress) {
    if (!KNOWLEDGE_BOT_CONFIG.ENABLE_VECTOR_SEARCH || !KNOWLEDGE_BOT_CONFIG.AI_API_KEY) {
        return { chunks, embeddedCount: 0, failed: true, error: "Vector search is disabled or API key is missing." };
    }

    const batchSize = KNOWLEDGE_BOT_CONFIG.EMBEDDING_BATCH_SIZE || 12;
    let embeddedCount = 0;

    try {
        for (let i = 0; i < chunks.length; i += batchSize) {
            const batch = chunks.slice(i, i + batchSize);
            const vectors = await embedTexts(batch.map(getEmbeddingTextForChunk), "RETRIEVAL_DOCUMENT");

            batch.forEach((chunk, idx) => {
                const embedding = vectors[idx] || [];
                if (embedding.length) {
                    chunk.embedding = embedding;
                    chunk.embeddingModel = KNOWLEDGE_BOT_CONFIG.EMBEDDING_MODEL || "text-embedding-004";
                    embeddedCount += 1;
                }
            });

            if (typeof onProgress === "function") {
                onProgress(Math.min(chunks.length, i + batch.length), chunks.length);
            }
        }

        return { chunks, embeddedCount, failed: false };
    } catch (err) {
        console.warn("Vector embedding failed. Falling back to lexical search:", err.message);
        return { chunks, embeddedCount, failed: true, error: err.message };
    }
}

// حساب سكور التطابق النصي والكلمات المفتاحية
function scoreChunkAgainstQuery(chunk, query) {
    const normalizedQuery = normalizeForSearch(query);
    const queryTokens = tokenizeForSearch(query);
    const text = normalizeForSearch(getChunkSearchText(chunk));
    const question = normalizeForSearch(chunk.question || "");
    const answer = normalizeForSearch(chunk.answer || "");
    const topic = normalizeForSearch([chunk.topic, chunk.sheetName, chunk.sourceName].filter(Boolean).join(" "));

    if (!text || queryTokens.length === 0) return 0;

    let score = 0;
    if (normalizedQuery.length > 4 && text.includes(normalizedQuery)) score += 30;
    if (normalizedQuery.length > 4 && question.includes(normalizedQuery)) score += 40;

    let matched = 0;
    queryTokens.forEach(token => {
        if (text.includes(token)) {
            matched += 1;
            score += 3;
        }
        if (question.includes(token)) score += 7;
        if (answer.includes(token)) score += 4;
        if (topic.includes(token)) score += 5;
    });

    const coverage = matched / queryTokens.length;
    score += coverage * 25;

    // مكافأة الجمل المركبة المتتالية
    for (let i = 0; i < queryTokens.length - 1; i++) {
        const phrase = `${queryTokens[i]} ${queryTokens[i + 1]}`;
        if (text.includes(phrase)) score += 8;
    }

    const lengthPenalty = Math.min(text.length / 6000, 3);
    let finalScore = score - lengthPenalty;

    // Excel Boost & Column Guided Search
    if (chunk.type === "excel") {
        finalScore += 12; // بونص إضافي لشيتات الإكسل لتعويض قصر الفقرات
        if (chunk.columns) {
            const keys = Object.keys(chunk.columns).map(normalizeForSearch);
            queryTokens.forEach(t => {
                if (keys.some(k => k.includes(t))) finalScore += 7; // بونص تطابق رأس العمود
            });
        }
    }

    return Math.max(0, finalScore);
}

// فرز وترتيب أولوي للفقرات نصياً
function rankChunks(query) {
    if (!query || !query.trim() || cachedChunks.length === 0) return [];

    const scored = cachedChunks
        .map(chunk => ({ chunk, score: scoreChunkAgainstQuery(chunk, query) }))
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score);

    if (scored.length > 0) return scored;

    if (typeof Fuse !== "undefined") {
        const fuse = new Fuse(cachedChunks, {
            keys: ["question", "content", "answer", "topic", "sheetName", "sourceName", "narrative"],
            includeScore: true,
            threshold: 0.72,
            ignoreLocation: true,
            minMatchCharLength: 2
        });

        return fuse.search(query)
            .map(r => ({ chunk: r.item, score: Math.max(1, (1 - (r.score || 1)) * 25) }))
            .filter(item => item.score > 0)
            .sort((a, b) => b.score - a.score);
    }

    return [];
}

// فرز دلالي بالفيكتورز
async function rankChunksByVector(query) {
    if (!KNOWLEDGE_BOT_CONFIG.ENABLE_VECTOR_SEARCH || cachedChunks.length === 0) return [];

    try {
        const queryEmbedding = await embedQueryText(query);
        if (!queryEmbedding.length) return [];

        const minSimilarity = KNOWLEDGE_BOT_CONFIG.VECTOR_MIN_SIMILARITY || 0.62;
        return cachedChunks
            .filter(chunk => Array.isArray(chunk.embedding) && chunk.embedding.length)
            .map(chunk => ({
                chunk,
                score: cosineSimilarity(queryEmbedding, chunk.embedding)
            }))
            .filter(item => item.score >= minSimilarity)
            .sort((a, b) => b.score - a.score);
    } catch (err) {
        console.warn("Vector retrieval failed. Continuing with lexical retrieval:", err.message);
        return [];
    }
}

// دمج نتائج البحث الدلالي والنصي بالأوزان (Hybrid Retrieval RRF)
function mergeHybridRankings(vectorRanked, lexicalRanked, maxChunks) {
    const vectorWeight = KNOWLEDGE_BOT_CONFIG.VECTOR_WEIGHT || 0.62;
    const lexicalWeight = KNOWLEDGE_BOT_CONFIG.LEXICAL_WEIGHT || 0.38;
    const lexicalMax = lexicalRanked.length ? Math.max(...lexicalRanked.map(i => i.score || 0), 1) : 1;
    const merged = new Map();

    vectorRanked.forEach((item, index) => {
        const id = item.chunk.id || `${item.chunk.sourceId || "source"}_${item.chunk.chunkIndex || index}`;
        merged.set(id, {
            chunk: item.chunk,
            vectorScore: item.score,
            lexicalScore: 0,
            score: (item.score * vectorWeight) + ((1 / (index + 8)) * 0.04)
        });
    });

    lexicalRanked.forEach((item, index) => {
        const id = item.chunk.id || `${item.chunk.sourceId || "source"}_${item.chunk.chunkIndex || index}`;
        const normalizedLexical = Math.min(1, (item.score || 0) / lexicalMax);
        const existing = merged.get(id) || {
            chunk: item.chunk,
            vectorScore: 0,
            lexicalScore: 0,
            score: 0
        };

        existing.lexicalScore = normalizedLexical;
        existing.score += (normalizedLexical * lexicalWeight) + ((1 / (index + 10)) * 0.03);
        merged.set(id, existing);
    });

    return [...merged.values()]
        .sort((a, b) => b.score - a.score)
        .slice(0, maxChunks);
}

// دالة Reranking الذكية لتصفية Chunks واختيار أفضلهم لـ Gemini
function rerankChunks(rankedItems, query) {
    if (!KNOWLEDGE_BOT_CONFIG.RERANK_ENABLED || rankedItems.length <= 3) {
        return rankedItems.map(item => item.chunk);
    }

    const queryTokens = tokenizeForSearch(query);
    
    // حساب سكور إضافي للـ Rerank بناء على مدى ترابط وتكامل كلمات السؤال في الفقرة
    const reranked = rankedItems.map(item => {
        const chunkText = normalizeForSearch(getChunkSearchText(item.chunk));
        let matchStreak = 0;
        let bonus = 0;
        
        queryTokens.forEach(token => {
            if (chunkText.includes(token)) {
                matchStreak++;
            } else {
                matchStreak = 0;
            }
            if (matchStreak >= 2) {
                bonus += 0.05 * matchStreak; // بونص عند وجود كلمات السؤال متتالية في النص المسترجع
            }
        });

        // زيادة الأولوية للقطع التي تملك سياقاً هرمياً أحدث أو أسئلة مطابقة
        if (item.chunk.question && normalizeForSearch(item.chunk.question).includes(queryTokens[0])) {
            bonus += 0.1;
        }

        return {
            ...item,
            rerankScore: item.score + bonus
        };
    });

    return reranked
        .sort((a, b) => b.rerankScore - a.rerankScore)
        .map(item => item.chunk);
}

async function retrieveRelevantChunks(question) {
    const maxChunks = KNOWLEDGE_BOT_CONFIG.MAX_CHUNKS || 10;
    
    // 1. تشغيل البحث النصي والبحث الدلالي
    const lexicalRanked = rankChunks(question);
    const vectorRanked = await rankChunksByVector(question);
    
    // 2. الدمج بالنظام الهجين
    let hybridRanked = mergeHybridRankings(vectorRanked, lexicalRanked, maxChunks * 2);

    // 3. تطبيق نظام فرز وإعادة الترتيب (Reranking)
    let finalChunks = rerankChunks(hybridRanked, question).slice(0, maxChunks);

    // 4. تطبيق الـ Parent-Child Chunking واسترجاع الأسطر المجاورة للإكسيل
    if (finalChunks.length > 0) {
        finalChunks = await enrichWithParentAndNeighborContext(finalChunks);
    }

    return finalChunks;
}

// دالة جلب السياق الكامل للـ chunks المسترجعة (Parent Context & Excel Neighbors)
async function enrichWithParentAndNeighborContext(chunks) {
    const enriched = [];
    
    for (let chunk of chunks) {
        // أ) جلب السطر السابق واللاحق للإكسيل (Excel Neighboring Rows)
        if (chunk.type === "excel" && chunk.rowNumber && typeof chunk.rowNumber === "number") {
            const nextRow = chunk.rowNumber + 1;
            const prevRow = chunk.rowNumber - 1;
            
            const neighbors = cachedChunks.filter(c => 
                c.sourceId === chunk.sourceId && 
                c.sheetName === chunk.sheetName && 
                (c.rowNumber === prevRow || c.rowNumber === nextRow)
            );
            
            let combinedContent = "";
            const prevChunk = neighbors.find(n => n.rowNumber === prevRow);
            const nextChunk = neighbors.find(n => n.rowNumber === nextRow);
            
            if (prevChunk) {
                combinedContent += `--- السطر السابق (${prevRow}) ---\n${prevChunk.content || ""}\n`;
            }
            combinedContent += `--- السطر المطابق (${chunk.rowNumber}) ---\n${chunk.content}\n`;
            if (nextChunk) {
                combinedContent += `--- السطر التالي (${nextRow}) ---\n${nextChunk.content || ""}\n`;
            }
            
            enriched.push({
                ...chunk,
                content: combinedContent,
                originalContent: chunk.content
            });
        } 
        // ب) جلب الـ Parent Chunk الأصلي للـ PDF لو متوفر
        else if (chunk.type === "pdf" && KNOWLEDGE_BOT_CONFIG.PARENT_CHILD_ENABLED && chunk.parentId) {
            try {
                const parentDoc = await db.collection("knowledge_bot_chunks").doc(chunk.parentId).get();
                if (parentDoc.exists) {
                    const parentData = parentDoc.data();
                    enriched.push({
                        ...chunk,
                        content: parentData.content, // استبدال محتوى الـ child بسياق الـ parent الأكبر
                        childPreview: chunk.content
                    });
                } else {
                    enriched.push(chunk);
                }
            } catch (e) {
                console.warn("Failed to retrieve parent chunk:", e);
                enriched.push(chunk);
            }
        } else {
            enriched.push(chunk);
        }
    }
    return enriched;
}

// دالة حماية وتصفية البيانات الحساسة للعملاء (PII Redactor)
function maskPIIData(text) {
    if (!KNOWLEDGE_BOT_CONFIG.PII_MASKING_ENABLED) return text;
    let cleanText = String(text || "");

    const patterns = KNOWLEDGE_BOT_CONFIG.PII_MASK_PATTERNS || [];
    patterns.forEach(p => {
        cleanText = cleanText.replace(p.regex, p.mask);
    });

    return cleanText;
}

function shouldAskClarifyingQuestion(question, chunks) {
    const tokens = tokenizeForSearch(question);
    if (tokens.length === 0) return false;

    const vagueTokens = new Set(["مشكله", "مشكل", "حساب", "كارت", "بطاقه", "رسوم", "عميل", "خدمه", "طلب", "اجراء", "ايه", "ازاي", "account", "card", "issue", "problem"]);
    const isShort = tokens.length <= 3;
    const mostlyVague = tokens.filter(t => vagueTokens.has(t)).length >= Math.max(1, tokens.length - 1);

    if (!isShort || !mostlyVague || !chunks || chunks.length < 3) return false;

    const topics = new Set(chunks.map(c => c.topic || c.sheetName || (Array.isArray(c.sourcePath) ? c.sourcePath.slice(-1)[0] : "")).filter(Boolean));
    return topics.size >= 3;
}

function buildClarifyingQuestion(question, chunks) {
    const options = [...new Set(chunks
        .map(c => c.topic || c.sheetName || (Array.isArray(c.sourcePath) ? c.sourcePath.slice(-1)[0] : ""))
        .filter(Boolean))]
        .slice(0, 5);

    const optionsText = options.length
        ? options.map((o, i) => `${i + 1}. ${o}`).join("\n")
        : "1. نوع المشكلة\n2. المنتج أو الخدمة\n3. الإجراء المطلوب";

    return `السؤال محتاج تحديد بسيط عشان أجيب إجابة دقيقة من المصادر.\n\nتقصد أنهي نقطة من دول؟\n${optionsText}\n\nاكتبلي اختيارك أو وضّح المشكلة بجملة قصيرة، وأنا أجيب لك الإجابة من المصدر المناسب.`;
}

// ─── 3. Call Gemini API with Memory & AbortController ────────────────
async function askGemini(question, relevantChunks, chatHistory = []) {
    if (!KNOWLEDGE_BOT_CONFIG.ENABLED) return { text: "البوت معطل حالياً.", sources: [] };

    // 1. حماية بيانات العميل الحساسة
    const maskedQuestion = maskPIIData(question);

    if (!relevantChunks || relevantChunks.length === 0) {
        return { text: KNOWLEDGE_BOT_CONFIG.FALLBACK_MESSAGE, sources: [] };
    }

    // بناء سياق المراجع والمصادر المسترجعة
    let contextString = "";
    const citations = [];

    relevantChunks.forEach((chunk, idx) => {
        const num = idx + 1;
        let loc = "";
        const sourcePath = Array.isArray(chunk.sourcePath) ? chunk.sourcePath.join(" -> ") : (chunk.sourcePath || "");
        if (chunk.type === "pdf")     loc = `[PDF: ${chunk.sourceName}, Page ${chunk.pageNumber || 1}${sourcePath ? `, Path: ${sourcePath}` : ""}]`;
        else if (chunk.type === "excel") loc = `[Excel: ${chunk.sourceName}, Sheet: ${chunk.sheetName || "Sheet1"}, Row: ${chunk.rowNumber || "?"}${sourcePath ? `, Path: ${sourcePath}` : ""}]`;
        else                           loc = `[Manual: ${chunk.topic || "General"}]`;

        const text = chunk.content || chunk.answer || "";
        contextString += `--- [Source ${num}] ${loc} ---\n${text}\n\n`;
        citations.push({
            ref: num, sourceName: chunk.sourceName, type: chunk.type,
            pageNumber: chunk.pageNumber, sheetName: chunk.sheetName,
            rowNumber: chunk.rowNumber, topic: chunk.topic,
            sourcePath: chunk.sourcePath,
            preview: (chunk.originalContent || text).substring(0, 150)
        });
    });

    // بناء تاريخ وجلسة المحادثة (Memory Context) لآخر 5 حركات
    let historyString = "";
    if (chatHistory && chatHistory.length > 0) {
        const limit = KNOWLEDGE_BOT_CONFIG.HISTORY_TURNS_LIMIT || 5;
        const recentHistory = chatHistory.slice(-limit * 2); // سؤال وجواب
        recentHistory.forEach(h => {
            historyString += `${h.sender === "user" ? "Agent" : "Assistant"}: ${h.text}\n`;
        });
    }

    const systemPrompt = `You are HDB Quality Assistant — a highly advanced Senior Quality Assurance and Policy Analyst for Housing & Development Bank (HDB) call center and quality agents.
Your ONLY job: answer the agent's question using the knowledge sources below. NEVER truncate, cut your answer short, or summarize unless requested.

=== VERIFY-THEN-ANSWER RULES (ANTI-HALLUCINATION GUARDRAILS) ===
- You must read and double check the "Knowledge Sources" before writing.
- Do NOT make up any numbers, interest rates, interest calculations, or fees.
- If the sources do not contain the answer, you MUST respond exactly with: "${KNOWLEDGE_BOT_CONFIG.FALLBACK_MESSAGE}". Do not add other general advice.
- When answering from tables or spreadsheets, preserve all constraints, dates, and brackets.

=== ARABIC RESPONSE FORMAT RULES ===
Structure your response in beautiful, highly readable Arabic, using these exact sections when applicable:
1. 🛡️ الملخص والإجراء الأساسي:
   - أجب على سؤال الأيجنت مباشرةً وبوضوح تام.
   - لو السؤال عن بيانات إكسيل، ابدأ بالإجابة المختصرة والمباشرة.
2. 📋 التفاصيل والبيانات المنظمة:
   - قدّم القوائم أو الخطوات بتنسيق واضح.
   - **مهم جداً:** لو البيانات من إكسيل (صفوف وأعمدة)، عرضها كجدول Markdown كامل هكذا:
     | العمود 1 | العمود 2 | العمود 3 |
     | --- | --- | --- |
     | قيمة 1 | قيمة 2 | قيمة 3 |
     - أكمل الجدول بالكامل، لا تختصر أو تحذف أي صف.
3. ⚠️ ملاحظات هامة وشروط:
   - اذكر أي قيود أو شروط أو رسوم مهمة من المصادر.
4. 🗣️ سيناريو مقترح للأيجنت:
   - جملة مقترحة بالعامية المصرية يقولها الأيجنت للعميل مباشرة.

=== القواعد العامة ===
- لو الرسالة تحية أو مجاملة (مثل "أهلاً", "شكراً", "السلام عليكم")، رد بطريقة ودية ومرحبة وعرّف نفسك كـ HDB Quality Assistant.
- اذكر المصدر باستخدام [المصدر X] في نهاية الجمل التي تستخدم معلوماته.
- لا تخترع أرقاماً أو رسوماً أو قواعد غير موجودة في المصادر.
- **أكمل إجابتك بالكامل** ولا تقطعها في المنتصف.

=== تاريخ المحادثة السابقة ===
${historyString || "لا توجد محادثات سابقة."}

=== مصادر المعرفة ===
${contextString}
=== نهاية المصادر ===

سؤال الأيجنت: "${maskedQuestion}"

أجب بالعربية مع اتباع التنسيق المطلوب:`;

    const payload = {
        contents: [{ role: "user", parts: [{ text: systemPrompt }] }],
        generationConfig: { temperature: 0.05, maxOutputTokens: 2500, topP: 0.85 },
        safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT",        threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_HATE_SPEECH",       threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
        ]
    };

    // قائمة الأولويات للموديلات المتاحة لـ Gemini
    const modelQueue = [
        KNOWLEDGE_BOT_CONFIG.AI_MODEL,
        "gemini-2.5-flash",
        "gemini-3.5-flash",
        "gemini-2.0-flash",
        "gemini-2.0-flash-lite",
        "gemini-flash-latest"
    ].filter((m, i, arr) => arr.indexOf(m) === i && m);

    // تجهيز AbortController لإتاحة إيقاف السؤال أثناء التوليد
    if (currentAbortController) {
        currentAbortController.abort();
    }
    currentAbortController = new AbortController();
    const signal = currentAbortController.signal;

    for (const model of modelQueue) {
        try {
            console.log(`🚀 Trying model: ${model}`);

            let attempt = 0;
            let response = null;

            // حلقة إعادة المحاولة لـ 429
            while (attempt < 3) {
                if (signal.aborted) {
                    return { text: "تم إيقاف عملية الاستعلام بطلب منك 🛑", sources: [] };
                }

                response = await callGeminiEndpoint({
                    model,
                    action: "generateContent",
                    payload,
                    abortSignal: signal
                });

                if (response.status === 429) {
                    attempt++;
                    if (attempt < 3) {
                        const waitSec = attempt * 8; // 8s ثم 16s
                        console.warn(`⏳ Rate limit on ${model} — waiting ${waitSec}s (attempt ${attempt}/3)`);
                        await new Promise((resolve, reject) => {
                            const timer = setTimeout(resolve, waitSec * 1000);
                            signal.addEventListener('abort', () => {
                                clearTimeout(timer);
                                reject(new DOMException("Aborted", "AbortError"));
                            });
                        });
                        continue;
                    } else {
                        console.warn(`⚠️ Rate limit on ${model} after 3 retries — trying next model`);
                        break;
                    }
                }
                break;
            }

            if (!response || response.status === 429) continue;

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                const errMsg = errData?.error?.message || `HTTP ${response.status}`;
                if (!KNOWLEDGE_BOT_CONFIG.AI_PROXY_URL && response.status === 404) {
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
                if (reason === "SAFETY") continue;
                throw new Error(`Empty response (${reason})`);
            }

            console.log(`✅ Got response from ${model}`);
            KNOWLEDGE_BOT_CONFIG.AI_MODEL = model;

            const isFallback = text.includes(KNOWLEDGE_BOT_CONFIG.FALLBACK_MESSAGE);
            const tokens = Math.ceil((systemPrompt.length + text.length) / 4);
            logQuery(question, text, !isFallback, tokens);

            // حساب نسبة الثقة التقديرية بناءً على أعلى سكور RAG
            let confidence = 1.0;
            const confidenceReasons = [];
            if (relevantChunks.length > 0) {
                // نعتمد على نسبة التشابه
                confidence = Math.max(...relevantChunks.map(c => c.score || 0.6));
                const sourceCount = new Set(relevantChunks.map(c => c.sourceId || c.sourceName).filter(Boolean)).size;
                const hasProfile = relevantChunks.some(c => cachedSourceProfiles.get(c.sourceId)?.profile?.documentType);
                const hasExactRows = relevantChunks.some(c => c.type === "excel" && c.rowNumber);
                const hasParentContext = relevantChunks.some(c => c.type === "pdf" && (c.parentId || c.childPreview));

                confidenceReasons.push(`${relevantChunks.length} retrieved knowledge chunk(s) were used.`);
                if (sourceCount > 1) confidenceReasons.push(`${sourceCount} different sources support or contextualize the answer.`);
                if (hasProfile) confidenceReasons.push("Source file profile was available for topic/type awareness.");
                if (hasExactRows) confidenceReasons.push("Exact Excel row context was available.");
                if (hasParentContext) confidenceReasons.push("PDF parent/page context was available.");
                if (confidence < (KNOWLEDGE_BOT_CONFIG.LOW_CONFIDENCE_THRESHOLD || 0.45)) {
                    confidenceReasons.push("Retrieval confidence is below the configured threshold; answer should be reviewed.");
                }
            }

            return {
                text: text.trim(),
                sources: isFallback ? [] : citations,
                confidence: isFallback ? 0 : confidence,
                confidenceReasons: isFallback ? ["No reliable supporting source was found."] : confidenceReasons
            };

        } catch (err) {
            if (err.name === 'AbortError') {
                console.log("🛑 API Request Aborted successfully.");
                return { text: "تم إيقاف عملية الاستعلام بطلب منك 🛑", sources: [] };
            }
            console.error(`❌ Error with model ${model}:`, err.message);
        }
    }

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
