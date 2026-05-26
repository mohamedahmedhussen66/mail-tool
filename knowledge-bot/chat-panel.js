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
    
    // تحميل الحجم والموقع المحفوظ من LocalStorage
    const savedW = localStorage.getItem("kbChatWidth");
    const savedH = localStorage.getItem("kbChatHeight");
    const savedR = localStorage.getItem("kbChatRight");
    const savedB = localStorage.getItem("kbChatBottom");
    if (savedW) panel.style.width = savedW;
    if (savedH) panel.style.height = savedH;
    if (savedR) panel.style.right = savedR;
    if (savedB) panel.style.bottom = savedB;

    panel.innerHTML = `
        <!-- مقابض السحب لتغيير الحجم من الجهات الأربع والزوايا -->
        <div class="kb-resize-edge kb-resize-t" data-direction="t" title="اسحب لتغيير الحجم"></div>
        <div class="kb-resize-edge kb-resize-b" data-direction="b" title="اسحب لتغيير الحجم"></div>
        <div class="kb-resize-edge kb-resize-l" data-direction="l" title="اسحب لتغيير الحجم"></div>
        <div class="kb-resize-edge kb-resize-r" data-direction="r" title="اسحب لتغيير الحجم"></div>
        <div class="kb-resize-corner kb-resize-tl" data-direction="tl" title="اسحب لتغيير الحجم من الزاوية">
            <svg viewBox="0 0 10 10" fill="currentColor"><path d="M0 10L10 0M0 5L5 0M5 10L10 5" stroke="currentColor" stroke-width="1.5"/></svg>
        </div>
        <div class="kb-resize-corner kb-resize-tr" data-direction="tr" title="اسحب لتغيير الحجم من الزاوية"></div>
        <div class="kb-resize-corner kb-resize-bl" data-direction="bl" title="اسحب لتغيير الحجم من الزاوية"></div>
        <div class="kb-resize-corner kb-resize-br" data-direction="br" title="اسحب لتغيير الحجم من الزاوية"></div>

        <div class="kb-chat-header">
            <div class="kb-chat-header-title">
                <span class="kb-bot-avatar">🤖</span>
                <div>
                    <h4 style="margin:0; font-size:14px; font-weight:700; color:#2ecc71;">HDB Quality Assistant</h4>
                    <span style="font-size:9px; color:rgba(255,255,255,0.45); letter-spacing:0.5px; text-transform:uppercase;">AI Knowledge Base</span>
                </div>
            </div>
            <div style="display:flex;align-items:center;gap:6px;">
                <button id="kbClearChatBtn" title="مسح المحادثة" style="background:none;border:none;color:rgba(255,255,255,0.3);font-size:14px;cursor:pointer;padding:2px 6px;border-radius:6px;transition:all 0.2s;">🗑️</button>
                <button id="kbChatCloseBtn" class="kb-chat-close-btn">&times;</button>
            </div>
        </div>

        <div class="kb-chat-messages" id="kbChatMessages">
            <div class="kb-message kb-msg-bot">
                <div class="kb-msg-bubble">
                    Welcome! I'm the <strong>HDB Quality Assistant</strong>. Ask me anything about our bank policies, scripts, or guidelines — I'll answer directly from the approved knowledge base.
                </div>
                <span class="kb-msg-time">${getCurrentTimeStr()}</span>
            </div>
        </div>
        <button class="kb-scroll-btn" id="kbScrollToBottomBtn" title="انزل للأسفل">↓</button>

        <div class="kb-chat-quick-suggestions" id="kbDynamicSuggestions"></div>

        <div class="kb-chat-input-area">
            <input type="text" id="kbChatInput" placeholder="اكتب سؤالك هنا..." dir="auto">
            <button id="kbChatSendBtn" class="kb-chat-send-btn" title="إرسال">
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
let kbChatHistory = []; // ذاكرة المحادثة لـ 5 رسايل (10 عناصر)

function setupChatPanelActions() {
    const closeBtn = document.getElementById("kbChatCloseBtn");
    const sendBtn = document.getElementById("kbChatSendBtn");
    const input = document.getElementById("kbChatInput");
    const clearBtn = document.getElementById("kbClearChatBtn");
    const scrollBtn = document.getElementById("kbScrollToBottomBtn");
    const messages = document.getElementById("kbChatMessages");

    if (closeBtn) closeBtn.addEventListener("click", () => toggleChatPanel(false));
    if (sendBtn) sendBtn.addEventListener("click", handleChatSend);
    if (input) {
        input.addEventListener("keypress", (e) => {
            if (e.key === "Enter") handleChatSend();
        });
    }

    // زرار مسح المحادثة
    if (clearBtn) clearBtn.addEventListener("click", () => {
        const msgs = document.getElementById("kbChatMessages");
        if (msgs) {
            msgs.innerHTML = `<div class="kb-message kb-msg-bot"><div class="kb-msg-bubble">تم مسح المحادثة ✅ أنا جاهز لأسئلتك!</div><span class="kb-msg-time">${getCurrentTimeStr()}</span></div>`;
        }
        kbChatHistory = []; // مسح الذاكرة
    });

    // زرار Scroll to Bottom
    if (scrollBtn && messages) {
        scrollBtn.addEventListener("click", () => {
            messages.scrollTop = messages.scrollHeight;
        });
        messages.addEventListener("scroll", () => {
            const isNearBottom = messages.scrollHeight - messages.scrollTop - messages.clientHeight < 80;
            scrollBtn.classList.toggle("visible", !isNearBottom);
        });
    }

    // ─── Resize Handles Logic ───────────────────────────────────
    const panel = document.getElementById("kbChatPanel");
    const resizeElements = panel ? panel.querySelectorAll(".kb-resize-edge, .kb-resize-corner") : [];

    resizeElements.forEach(el => {
        el.addEventListener("mousedown", (e) => {
            e.preventDefault();
            const direction = el.getAttribute("data-direction");
            if (!direction) return;

            const startX = e.clientX;
            const startY = e.clientY;
            const startW = panel.offsetWidth;
            const startH = panel.offsetHeight;
            const startRight = parseInt(window.getComputedStyle(panel).right) || 25;
            const startBottom = parseInt(window.getComputedStyle(panel).bottom) || 95;

            const vw = window.innerWidth;
            const vh = window.innerHeight;

            function onMouseMove(ev) {
                const dx = ev.clientX - startX;
                const dy = ev.clientY - startY;

                let newW = startW;
                let newH = startH;
                let newRight = startRight;
                let newBottom = startBottom;

                // التكبير الأفقي
                if (direction.includes("l")) {
                    newW = Math.max(300, Math.min(vw * 0.9, startW - dx));
                } else if (direction.includes("r")) {
                    newW = Math.max(300, Math.min(vw * 0.9, startW + dx));
                    newRight = startRight - dx;
                }

                // التكبير الرأسي
                if (direction.includes("t")) {
                    newH = Math.max(380, Math.min(vh * 0.9, startH - dy));
                } else if (direction.includes("b")) {
                    newH = Math.max(380, Math.min(vh * 0.9, startH + dy));
                    newBottom = startBottom - dy;
                }

                panel.style.width = newW + "px";
                panel.style.height = newH + "px";
                panel.style.right = newRight + "px";
                panel.style.bottom = newBottom + "px";

                // حفظ الأبعاد والموقع في LocalStorage
                localStorage.setItem("kbChatWidth", newW + "px");
                localStorage.setItem("kbChatHeight", newH + "px");
                localStorage.setItem("kbChatRight", newRight + "px");
                localStorage.setItem("kbChatBottom", newBottom + "px");
            }

            function onMouseUp() {
                document.removeEventListener("mousemove", onMouseMove);
                document.removeEventListener("mouseup", onMouseUp);
            }

            document.addEventListener("mousemove", onMouseMove);
            document.addEventListener("mouseup", onMouseUp);
        });
    });

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

    // 1. الأولوية للأسئلة الحقيقية من Q&A (مع خلط عشوائي لإظهار تنوع)
    const questions = cachedChunks
        .map(c => c.question)
        .filter(q => q && q.trim().length > 5)
        .map(q => q.trim());
    const uniqueQ = [...new Set(questions)];

    // نختار 4 أسئلة بشكل شبه عشوائي من الـ pool
    if (uniqueQ.length > 0) {
        const shuffled = uniqueQ.sort(() => Math.random() - 0.5);
        suggestions = shuffled.slice(0, 4);
    } else {
        // fallback: نستخدم موضوعات الـ topics وليس أسماء الملفات
        const topics = cachedChunks
            .map(c => c.topic)
            .filter(t => t && t.trim().length > 3 && !t.includes(".pdf") && !t.includes(".xlsx"))
            .map(t => t.trim());
        const uniqueT = [...new Set(topics)];
        if (uniqueT.length > 0) {
            suggestions = uniqueT.sort(() => Math.random() - 0.5).slice(0, 4);
        } else {
            // last fallback: اقتراحات ثابتة ذكية
            suggestions = [
                "ما هي شروط تغيير رقم الموبايل؟",
                "ما رسوم الحساب الجاري؟",
                "كيف أساعد العميل في فتح حساب؟",
                "ما خطوات التحقق من هوية العميل؟"
            ];
        }
    }

    if (suggestions.length === 0) {
        container.style.display = "none";
        return;
    }

    container.style.display = "flex";
    container.innerHTML = suggestions.map(s => {
        const label = s.length > 35 ? s.substring(0, 32) + "..." : s;
        const safe = s.replace(/'/g, "&#039;").replace(/"/g, "&quot;");
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
function setChatStateLoading(isLoading) {
    const input = document.getElementById("kbChatInput");
    const sendBtn = document.getElementById("kbChatSendBtn");
    if (!input || !sendBtn) return;

    if (isLoading) {
        input.disabled = true;
        sendBtn.disabled = false; // نخليه متاح للضغط عشان يقدر يكنسل
        sendBtn.classList.add("kb-loading");
        sendBtn.title = "إيقاف التفكير 🛑";
        sendBtn.innerHTML = `
            <svg class="kb-stop-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:16px; height:16px; color:#e74c3c; display:block; margin:auto;">
                <rect x="5" y="5" width="14" height="14" rx="2" fill="currentColor"></rect>
            </svg>
        `;
        showTypingIndicator(true, 1);
    } else {
        input.disabled = false;
        sendBtn.disabled = false;
        sendBtn.classList.remove("kb-loading");
        sendBtn.title = "إرسال";
        sendBtn.innerHTML = `
            <svg class="kb-send-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M11.5003 12H5.41872M5.24634 12.7972L4.24158 15.7986C3.69122 17.4424 3.41604 18.2643 3.61359 18.7704C3.78506 19.21 4.15335 19.5432 4.6078 19.6701C5.13111 19.8161 5.92151 19.4604 7.50231 18.7491L17.5489 14.2281C19.3051 13.4378 20.1832 13.0427 20.4548 12.4874C20.6909 12.0049 20.6909 11.4468 20.4548 10.9643C20.1832 10.409 19.3051 10.0139 17.5489 9.22354L7.50231 4.70258C5.92151 3.99125 5.13111 3.63558 4.6078 3.78154C4.15335 3.9085 3.78506 4.24172 3.61359 4.68132C3.41604 5.18738 3.69122 6.00931 4.24158 7.65313L5.24634 10.6545C5.35249 10.9716 5.40557 11.1302 5.42643 11.2949C5.44491 11.4407 5.44491 11.5878 5.42643 11.7337C5.40557 11.8983 5.35249 12.0569 5.24634 12.7972Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
        `;
        showTypingIndicator(false);
        setTimeout(() => input.focus(), 50);
    }
}

async function handleChatSend() {
    const input = document.getElementById("kbChatInput");
    const sendBtn = document.getElementById("kbChatSendBtn");
    if (!input || !sendBtn) return;

    // كنسلة الطلب أثناء التفكير
    if (sendBtn.classList.contains("kb-loading")) {
        if (typeof currentAbortController !== "undefined" && currentAbortController) {
            currentAbortController.abort();
        }
        setChatStateLoading(false);
        appendMessage("🛑 تم إيقاف عملية الاستعلام بطلب منك.", "bot");
        return;
    }

    const question = input.value.trim();
    if (!question) return;

    input.value = "";
    appendMessage(question, "user");
    
    // حفظ في الذاكرة (سؤال الموظف)
    kbChatHistory.push({ sender: "user", text: question });
    if (kbChatHistory.length > 10) kbChatHistory = kbChatHistory.slice(-10);

    setChatStateLoading(true);

    try {
        // الخطوة 1: فحص PII وحماية البيانات
        showTypingIndicator(true, 1);
        await new Promise(r => setTimeout(r, 450)); 

        // الخطوة 2: استرجاع
        showTypingIndicator(true, 2);
        let chunks = [];
        if (typeof retrieveRelevantChunks === "function") {
            chunks = await retrieveRelevantChunks(question);
        } else if (typeof searchChunks === "function") {
            chunks = searchChunks(question);
        }

        console.log(`🔍 لقيت ${chunks.length} قطعة متعلقة بالسؤال`);

        // الخطوة 3: Reranking وتصفية
        showTypingIndicator(true, 3);
        await new Promise(r => setTimeout(r, 400));

        let reply = { text: "الخدمة غير متوفرة حالياً.", sources: [] };
        if (typeof shouldAskClarifyingQuestion === "function" && shouldAskClarifyingQuestion(question, chunks)) {
            reply = { text: buildClarifyingQuestion(question, chunks), sources: [] };
            if (typeof logQuery === "function") logQuery(question, reply.text, false, 0);
            
            // حفظ في الذاكرة
            kbChatHistory.push({ sender: "assistant", text: reply.text });
            if (kbChatHistory.length > 10) kbChatHistory = kbChatHistory.slice(-10);

            setChatStateLoading(false);
            appendMessage(reply.text, "bot", reply.sources);
            return;
        }

        // الخطوة 4: التوليد وصياغة الرد
        showTypingIndicator(true, 4);
        if (typeof askGemini === "function") {
            reply = await askGemini(question, chunks, kbChatHistory);
        }

        // حفظ في الذاكرة
        kbChatHistory.push({ sender: "assistant", text: reply.text });
        if (kbChatHistory.length > 10) kbChatHistory = kbChatHistory.slice(-10);

        setChatStateLoading(false);
        appendMessage(reply.text, "bot", reply.sources, reply.confidence, reply.confidenceReasons);

    } catch (err) {
        console.error("خطأ في معالجة السؤال:", err);
        setChatStateLoading(false);
        if (err.name === 'AbortError' || err.message === 'Aborted') {
            return;
        }
        appendMessage("حدث خطأ أثناء معالجة سؤالك، يرجى المحاولة مجدداً.", "bot");
    }
}

// ─── 8. إضافة رسالة للشات ────────────────────────────────────────────────────
function escapeKbHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function formatBotText(text) {
    // تحويل Markdown tables إلى HTML جداول حقيقية
    function parseMarkdownTable(md) {
        const lines = md.split("\n");
        const tableLines = [];
        let inTable = false;
        let result = "";

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line.startsWith("|") && line.endsWith("|")) {
                if (!inTable) { inTable = true; tableLines.length = 0; }
                tableLines.push(line);
            } else {
                if (inTable) {
                    result += buildHtmlTable(tableLines) + "\n";
                    tableLines.length = 0;
                    inTable = false;
                }
                result += line + "\n";
            }
        }
        if (inTable && tableLines.length > 0) result += buildHtmlTable(tableLines);
        return result;
    }

    function buildHtmlTable(lines) {
        // Filter separator rows (like | --- | --- |)
        const dataLines = lines.filter(l => !l.replace(/[|:\-\s]/g, "").match(/^$/));
        if (dataLines.length === 0) return "";

        const rows = dataLines.map(l =>
            l.split("|")
             .slice(1, -1)
             .map(c => escapeKbHtml(c.trim()))
        );

        let html = "<table>";
        rows.forEach((row, idx) => {
            html += "<tr>";
            row.forEach(cell => {
                const tag = idx === 0 ? "th" : "td";
                html += `<${tag}>${cell}</${tag}>`;
            });
            html += "</tr>";
        });
        html += "</table>";
        return html;
    }

    // نطبق تحويل الجداول أولاً
    let t = parseMarkdownTable(escapeKbHtml(text));

    // تحويل Markdown العادي
    t = t
        .replace(/\n/g, "<br>")
        .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
        .replace(/\*([^*]+)\*/g, "<em>$1</em>")
        .replace(/#{1,4} (.+)/g, "<strong style='color:#2ecc71;font-size:13px;'>$1</strong>")
        .replace(/^[-•] (.+)/gm, "<span style='margin-right:6px;'>•</span>$1");

    // نظف الـ <br> الزيادة قبل وبعد الجداول
    t = t.replace(/<br>(<table>)/g, "$1").replace("(<\/table>)<br>", "$1");

    return t;
}

function appendMessage(text, sender, sources = [], confidence = null, confidenceReasons = []) {
    const container = document.getElementById("kbChatMessages");
    if (!container) return;

    const msgDiv = document.createElement("div");
    msgDiv.className = `kb-message kb-msg-${sender} kb-animate-pop`;

    // تنسيق النص
    let contentHtml = (sender === 'bot') ? formatBotText(text) : escapeKbHtml(text).replace(/\n/g, "<br>");

    // شريط تنبيه الشك وضعف المطابقة
    let warningBanner = "";
    if (sender === "bot" && confidence !== null && confidence < 0.45 && sources && sources.length > 0) {
        warningBanner = `
            <div class="kb-warning-banner">
                <span>⚠️ تنبيه: نسبة مطابقة المصادر مع سؤالك ضعيفة (${Math.round(confidence * 100)}%). يرجى مراجعة وتدقيق الإجابة.</span>
            </div>
        `;
        contentHtml = warningBanner + contentHtml;
    }

    if (sender === "bot" && confidenceReasons && confidenceReasons.length > 0 && sources && sources.length > 0) {
        const reasonItems = confidenceReasons.slice(0, 4)
            .map(reason => `<li>${escapeKbHtml(reason)}</li>`)
            .join("");
        contentHtml += `
            <div class="kb-confidence-reasons">
                <strong>Confidence notes</strong>
                <ul>${reasonItems}</ul>
            </div>
        `;
    }

    // عرض المراجع بتنسيق كروت بريميوم وتفاعلية
    let sourceHtml = "";
    if (sources && sources.length > 0) {
        sourceHtml = `
            <div class="kb-sources-wrapper">
                <div class="kb-sources-header" onclick="toggleCitationsContainer(this)">
                    <span>📂 المصادر والمراجع المعتمدة (${sources.length})</span>
                    <span class="kb-toggle-arrow">▼</span>
                </div>
                <div class="kb-sources-list kb-collapsed">
                    ${sources.map(src => {
                        const icon = src.type === "pdf" ? "📄" : src.type === "excel" ? "📊" : "📝";
                        let title = "";
                        let location = "";
                        if (src.type === "pdf") {
                            title = src.sourceName;
                            location = `صفحة ${src.pageNumber || 1}`;
                        } else if (src.type === "excel") {
                            title = src.sourceName;
                            location = `شيت: ${src.sheetName || 'Sheet1'} • صف ${src.rowNumber || '?'}`;
                        } else {
                            title = "مدخل يدوي";
                            location = src.topic || "عام";
                        }
                        
                        return `
                            <div class="kb-source-card">
                                <div class="kb-source-card-main" onclick="toggleSourcePreview(this)">
                                    <div class="kb-source-badge">${escapeKbHtml(src.ref)}</div>
                                    <div class="kb-source-info">
                                        <div class="kb-source-title">${icon} ${escapeKbHtml(title)}</div>
                                        <div class="kb-source-loc">${escapeKbHtml(location)}</div>
                                    </div>
                                    <span class="kb-card-arrow">▼</span>
                                </div>
                                <div class="kb-source-preview-box kb-collapsed">
                                    <div class="kb-preview-header">نص المستند الأصلي:</div>
                                    <pre class="kb-preview-text">${escapeKbHtml(src.preview || 'لا يوجد نص معاينة متوفر.')}...</pre>
                                </div>
                            </div>
                        `;
                    }).join("")}
                </div>
            </div>`;
    }

    // زرار النسخ للرسائل الطويلة من البوت
    const copyBtn = sender === "bot" && text.length > 80
        ? `<button class="kb-copy-btn" type="button" title="نسخ الإجابة">📋 نسخ</button>`
        : "";

    msgDiv.innerHTML = `
        <div class="kb-msg-bubble">
            ${contentHtml}
            ${sourceHtml}
        </div>
        ${copyBtn}
        <span class="kb-msg-time">${getCurrentTimeStr()}</span>
    `;

    container.appendChild(msgDiv);
    const copyButton = msgDiv.querySelector(".kb-copy-btn");
    if (copyButton) {
        copyButton.addEventListener("click", () => kbCopyText(copyButton, text));
    }
    container.scrollTop = container.scrollHeight;
}

// ─── 9. دوال مساعدة ──────────────────────────────────────────────────────────
window.toggleCitationsContainer = function (el) {
    const list = el.nextElementSibling;
    const arrow = el.querySelector(".kb-toggle-arrow");
    if (!list || !arrow) return;

    list.classList.toggle("kb-collapsed");
    arrow.innerText = list.classList.contains("kb-collapsed") ? "▼" : "▲";
};

window.toggleSourcePreview = function (el) {
    const card = el.parentElement;
    const preview = card.querySelector(".kb-source-preview-box");
    const arrow = el.querySelector(".kb-card-arrow");
    if (!preview || !arrow) return;

    preview.classList.toggle("kb-collapsed");
    arrow.innerText = preview.classList.contains("kb-collapsed") ? "▼" : "▲";
};

window.kbSuggestQuestion = function (text) {
    const input = document.getElementById("kbChatInput");
    if (input) {
        // فك تشفير HTML entities
        const ta = document.createElement("textarea");
        ta.innerHTML = text;
        input.value = ta.value;
        input.focus();
    }
};

window.kbCopyText = function (btn, text) {
    navigator.clipboard.writeText(String(text || "")).then(() => {
        const orig = btn.innerHTML;
        btn.innerHTML = '✅ تم النسخ';
        btn.style.color = '#2ecc71';
        btn.style.borderColor = 'rgba(46,204,113,0.4)';
        setTimeout(() => { btn.innerHTML = orig; btn.style.color = ''; btn.style.borderColor = ''; }, 2000);
    }).catch(() => {
        // fallback
        const ta = document.createElement('textarea');
        ta.value = String(text || "");
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
        btn.innerHTML = '✅ تم';
        setTimeout(() => { btn.innerHTML = '📋 نسخ'; }, 1500);
    });
};

function showTypingIndicator(show, step = 1) {
    const container = document.getElementById("kbChatMessages");
    if (!container) return;

    let indicator = document.getElementById("kbTypingIndicator");

    if (show) {
        let stepText = "Searching knowledge base...";
        let percentage = "20%";
        if (step === 1) {
            stepText = "🔍 جاري حماية البيانات وفحص القاموس...";
            percentage = "25%";
        } else if (step === 2) {
            stepText = "📂 جاري البحث الدلالي في المستندات والإكسيل...";
            percentage = "50%";
        } else if (step === 3) {
            stepText = "🧠 جاري تصفية وتصنيف الفقرات (Reranking)...";
            percentage = "75%";
        } else if (step === 4) {
            stepText = "✍️ جاري صياغة الإجابة المعتمدة ومنع الهلوسة...";
            percentage = "90%";
        }

        if (!indicator) {
            indicator = document.createElement("div");
            indicator.id = "kbTypingIndicator";
            indicator.className = "kb-message kb-msg-bot kb-typing-indicator";
            container.appendChild(indicator);
        }

        indicator.innerHTML = `
            <div class="kb-msg-bubble" style="display:flex; flex-direction:column; gap:8px; min-width: 240px;">
                <div style="display:flex; align-items:center; justify-content:space-between; font-size:11px; color:#2ecc71;">
                    <span class="kb-typing-step-text" style="font-weight:600;">${stepText}</span>
                    <span style="font-size:10px; color:rgba(255,255,255,0.4);">${percentage}</span>
                </div>
                <div style="width:100%; height:4px; background:rgba(255,255,255,0.1); border-radius:2px; overflow:hidden; position:relative;">
                    <div class="kb-typing-progress-bar" style="width:${percentage}; height:100%; background:#2ecc71; border-radius:2px; transition:width 0.3s ease;"></div>
                </div>
                <div style="display:flex; align-items:center; gap:4px; justify-content:center; opacity:0.6;">
                    <span class="kb-dot" style="font-size:14px; color:#2ecc71;">&#8226;</span>
                    <span class="kb-dot" style="font-size:14px; color:#2ecc71; animation-delay: 0.2s;">&#8226;</span>
                    <span class="kb-dot" style="font-size:14px; color:#2ecc71; animation-delay: 0.4s;">&#8226;</span>
                </div>
            </div>`;
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
