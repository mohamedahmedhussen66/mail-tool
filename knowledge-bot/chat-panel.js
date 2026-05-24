// 💬 شاشة الشات العائمة للـ Agent والأدمن - HDB Quality Assistant

document.addEventListener("DOMContentLoaded", function () {
    if (!KNOWLEDGE_BOT_CONFIG.ENABLED) return;

    // بنحقن HTML الشات في الصفحة
    injectChatPanelHtml();

    // بنربط الأزرار بالأحداث
    setupChatPanelActions();

    // بنحاول نضيف الزرار للـ watermark menu لو موجود (صفحة الـ Agent)
    // وإلا بنعمل Floating Action Button مستقل
    tryIntegrateWithWatermarkMenu();

    // بنحدث الاقتراحات
    updateDynamicSuggestions();
});

// ─── 1. بناء HTML لوحة الشات ────────────────────────────────────────────────
function injectChatPanelHtml() {
    const panel = document.createElement("div");
    panel.id = "kbChatPanel";
    panel.className = "kb-chat-panel-container kb-hidden";
    panel.innerHTML = `
        <div class="kb-chat-header">
            <div class="kb-chat-header-title">
                <span class="kb-bot-avatar">🤖</span>
                <div>
                    <h4 style="margin:0; font-size:14px; font-weight:700; color:#2ecc71;">HDB Quality Assistant</h4>
                    <span style="font-size:9px; color:rgba(255,255,255,0.45); letter-spacing:0.5px; text-transform:uppercase;">AI Knowledge Base</span>
                </div>
            </div>
            <button id="kbChatCloseBtn" class="kb-chat-close-btn">&times;</button>
        </div>

        <div class="kb-chat-messages" id="kbChatMessages">
            <div class="kb-message kb-msg-bot">
                <div class="kb-msg-bubble">
                    Welcome! I'm the <strong>HDB Quality Assistant</strong>. Ask me anything about our bank policies, scripts, or guidelines — I'll answer directly from the approved knowledge base.
                </div>
                <span class="kb-msg-time">${getCurrentTimeStr()}</span>
            </div>
        </div>

        <div class="kb-chat-quick-suggestions" id="kbDynamicSuggestions"></div>

        <div class="kb-chat-input-area">
            <input type="text" id="kbChatInput" placeholder="Ask a question..." dir="auto">
            <button id="kbChatSendBtn" class="kb-chat-send-btn" title="Send">
                <svg class="kb-send-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M11.5003 12H5.41872M5.24634 12.7972L4.24158 15.7986C3.69122 17.4424 3.41604 18.2643 3.61359 18.7704C3.78506 19.21 4.15335 19.5432 4.6078 19.6701C5.13111 19.8161 5.92151 19.4604 7.50231 18.7491L17.5489 14.2281C19.3051 13.4378 20.1832 13.0427 20.4548 12.4874C20.6909 12.0049 20.6909 11.4468 20.4548 10.9643C20.1832 10.409 19.3051 10.0139 17.5489 9.22354L7.50231 4.70258C5.92151 3.99125 5.13111 3.63558 4.6078 3.78154C4.15335 3.9085 3.78506 4.24172 3.61359 4.68132C3.41604 5.18738 3.69122 6.00931 4.24158 7.65313L5.24634 10.6545C5.35249 10.9716 5.40557 11.1302 5.42643 11.2949C5.44491 11.4407 5.44491 11.5878 5.42643 11.7337C5.40557 11.8983 5.35249 12.0569 5.24634 12.7972Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            </button>
        </div>
    `;
    document.body.appendChild(panel);

    // نضيف الـ FAB Button (زرار العائم المستقل) دايماً
    injectFabButton();
}

// ─── 2. إضافة Floating Action Button مستقل ──────────────────────────────────
function injectFabButton() {
    // بنشيك مش بنضيفه أكتر من مرة
    if (document.getElementById("kbFabBtn")) return;

    const fab = document.createElement("button");
    fab.id = "kbFabBtn";
    fab.className = "kb-fab-btn";
    fab.title = "HDB Quality Assistant";
    fab.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2C6.48 2 2 6.01 2 11c0 2.56 1.08 4.87 2.83 6.54L4 22l4.88-1.29C10.16 21.56 11.06 21.73 12 21.73c5.52 0 10-4.01 10-8.96S17.52 2 12 2z" fill="currentColor" opacity="0.15"/>
            <path d="M21 11.5C21 16.75 16.52 21 11 21C9.82 21 8.69 20.8 7.64 20.43L3 22L4.25 17.74C3.47 16.49 3 15.05 3 13.5C3 8.25 7.48 4 13 4C16.3 4 19.22 5.56 21 8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M8 11H16M8 15H13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
        <span class="kb-fab-label">Ask AI</span>
    `;
    fab.onclick = () => toggleChatPanel();
    document.body.appendChild(fab);
}

// ─── 3. محاولة دمج الزرار مع watermark menu إذا كان موجوداً ─────────────────
function tryIntegrateWithWatermarkMenu() {
    // بنستنى شوية عشان الصفحة تتحمل بالكامل
    setTimeout(() => {
        const menu = document.getElementById("watermarkMenu");
        if (!menu) return; // مفيش watermark menu - الـ FAB بيكفي

        // بنشيك إنه ما اتضافش قبل كده
        if (menu.querySelector(".item-bot")) return;

        const item = document.createElement("div");
        item.className = "menu-item item-bot";
        item.innerHTML = `🤖 Knowledge Bot`;
        item.onclick = function () {
            toggleChatPanel();
            // بنقفل الـ watermark menu
            menu.classList.remove("show");
        };

        // بنحطه في أول القائمة
        menu.insertBefore(item, menu.firstChild);

        // بنشغل sync بالصلاحيات لو موجود
        if (typeof syncWatermarkMenuByRole === "function") {
            syncWatermarkMenuByRole();
        }
    }, 800);
}

// ─── 4. ربط أزرار الشات بالمستمعين ──────────────────────────────────────────
function setupChatPanelActions() {
    const closeBtn = document.getElementById("kbChatCloseBtn");
    const sendBtn = document.getElementById("kbChatSendBtn");
    const input = document.getElementById("kbChatInput");

    if (closeBtn) closeBtn.addEventListener("click", () => toggleChatPanel(false));
    if (sendBtn) sendBtn.addEventListener("click", handleChatSend);
    if (input) {
        input.addEventListener("keypress", (e) => {
            if (e.key === "Enter") handleChatSend();
        });
    }

    // بنحمل الكاش مسبقاً في الخلفية
    if (typeof fetchAndCacheChunks === "function") {
        fetchAndCacheChunks();
    }
}

// ─── 5. تحديث الاقتراحات الديناميكية ────────────────────────────────────────
function updateDynamicSuggestions() {
    const container = document.getElementById("kbDynamicSuggestions");
    if (!container) return;

    if (!cachedChunks || cachedChunks.length === 0) {
        container.style.display = "none";
        return;
    }

    let suggestions = [];

    // أسئلة من Q&A entries
    const questions = cachedChunks
        .map(c => c.question)
        .filter(Boolean)
        .map(q => q.trim());
    const uniqueQ = [...new Set(questions)];

    if (uniqueQ.length > 0) {
        suggestions = uniqueQ.slice(0, 3);
    } else {
        // أسماء الملفات كاقتراحات
        const topics = cachedChunks
            .map(c => c.topic || c.sourceName)
            .filter(Boolean)
            .map(t => t.replace(/\.[a-zA-Z0-9]+$/, "").replace("Manual Q&A Entries", "مدخلات يدوية").trim());
        const uniqueT = [...new Set(topics)];
        suggestions = uniqueT.slice(0, 3);
    }

    if (suggestions.length === 0) {
        container.style.display = "none";
        return;
    }

    container.style.display = "flex";
    container.innerHTML = suggestions.map(s => {
        const label = s.length > 28 ? s.substring(0, 25) + "..." : s;
        const safe = s.replace(/'/g, "\\'").replace(/"/g, "&quot;");
        return `<span class="kb-suggest-chip" onclick="kbSuggestQuestion('${safe}')" title="${s}">${label}</span>`;
    }).join("");
}

// ─── 6. فتح وإغلاق لوحة الشات ───────────────────────────────────────────────
function toggleChatPanel(forceState) {
    const panel = document.getElementById("kbChatPanel");
    if (!panel) return;

    const isHidden = panel.classList.contains("kb-hidden");
    const shouldShow = (forceState !== undefined) ? forceState : isHidden;

    if (shouldShow) {
        panel.classList.remove("kb-hidden");
        setTimeout(() => document.getElementById("kbChatInput")?.focus(), 100);

        // بنحدث الكاش لما نفتح عشان الموظف يلاقي آخر التحديثات علطول
        if (typeof fetchAndCacheChunks === "function") fetchAndCacheChunks(true);
    } else {
        panel.classList.add("kb-hidden");
    }
}

// ─── 7. إرسال السؤال ─────────────────────────────────────────────────────────
async function handleChatSend() {
    const input = document.getElementById("kbChatInput");
    if (!input) return;

    const question = input.value.trim();
    if (!question) return;

    input.value = "";
    appendMessage(question, "user");
    showTypingIndicator(true);

    try {
        // بندور في الكاش على القطع المتعلقة بالسؤال
        let chunks = [];
        if (typeof searchChunks === "function") {
            chunks = searchChunks(question);
        }

        console.log(`🔍 لقيت ${chunks.length} قطعة متعلقة بالسؤال`);

        // بنبعت لـ Gemini
        let reply = { text: "الخدمة غير متوفرة حالياً.", sources: [] };
        if (typeof askGemini === "function") {
            reply = await askGemini(question, chunks);
        }

        showTypingIndicator(false);
        appendMessage(reply.text, "bot", reply.sources);

    } catch (err) {
        console.error("خطأ في معالجة السؤال:", err);
        showTypingIndicator(false);
        appendMessage("حدث خطأ أثناء معالجة سؤالك، يرجى المحاولة مجدداً.", "bot");
    }
}

// ─── 8. إضافة رسالة للشات ────────────────────────────────────────────────────
function appendMessage(text, sender, sources = []) {
    const container = document.getElementById("kbChatMessages");
    if (!container) return;

    const msgDiv = document.createElement("div");
    msgDiv.className = `kb-message kb-msg-${sender} kb-animate-pop`;

    // تنسيق النص
    let cleanText = text
        .replace(/\n/g, "<br>")
        .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
        .replace(/\*(.*?)\*/g, "<em>$1</em>");

    // عرض المراجع
    let sourceHtml = "";
    if (sources && sources.length > 0) {
        sourceHtml = `
            <div class="kb-sources-citations">
                <span class="kb-citation-title" onclick="toggleCitations(this)">📂 Sources & References (${sources.length}) ▼</span>
                <div class="kb-citation-body kb-citation-collapsed">
                    ${sources.map(src => {
                        let label = "";
                        if (src.type === "pdf") label = `📄 ${src.sourceName} — Page ${src.pageNumber}`;
                        else if (src.type === "excel") label = `📊 ${src.sourceName} — Sheet: ${src.sheetName}, Row ${src.rowNumber}`;
                        else label = `📝 Manual: ${src.topic}`;
                        return `<div class="kb-citation-item" title="${src.preview || ''}">${label}</div>`;
                    }).join("")}
                </div>
            </div>`;
    }

    msgDiv.innerHTML = `
        <div class="kb-msg-bubble">
            ${cleanText}
            ${sourceHtml}
        </div>
        <span class="kb-msg-time">${getCurrentTimeStr()}</span>
    `;

    container.appendChild(msgDiv);
    container.scrollTop = container.scrollHeight;
}

// ─── 9. دوال مساعدة ──────────────────────────────────────────────────────────
window.toggleCitations = function (el) {
    const body = el.nextElementSibling;
    if (!body) return;
    body.classList.toggle("kb-citation-collapsed");
    el.innerText = el.innerText.replace(
        body.classList.contains("kb-citation-collapsed") ? "▲" : "▼",
        body.classList.contains("kb-citation-collapsed") ? "▼" : "▲"
    );
};

window.kbSuggestQuestion = function (text) {
    const input = document.getElementById("kbChatInput");
    if (input) { input.value = text; input.focus(); }
};

function showTypingIndicator(show) {
    const container = document.getElementById("kbChatMessages");
    if (!container) return;

    let indicator = document.getElementById("kbTypingIndicator");

    if (show) {
        if (!indicator) {
            indicator = document.createElement("div");
            indicator.id = "kbTypingIndicator";
            indicator.className = "kb-message kb-msg-bot kb-typing-indicator";
            indicator.innerHTML = `
                <div class="kb-msg-bubble" style="display:flex;align-items:center;gap:5px;">
                    <span class="kb-dot">&#8226;</span>
                    <span class="kb-dot">&#8226;</span>
                    <span class="kb-dot">&#8226;</span>
                    <span style="font-size:11px;color:rgba(255,255,255,0.45);margin-right:4px;">Searching knowledge base...</span>
                </div>`;
            container.appendChild(indicator);
        }
        container.scrollTop = container.scrollHeight;
    } else {
        if (indicator) indicator.remove();
    }
}

function getCurrentTimeStr() {
    const d = new Date();
    let h = d.getHours(), m = d.getMinutes();
    const ampm = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    return `${h}:${m < 10 ? "0" + m : m} ${ampm}`;
}
