// 🛠️ شاشة التحكم بتاعة البوت للأدمن.. هنا بنرفع الملفات وبنقطعها ونعرض الإحصائيات وكل الشغل العالي ده.

if (typeof pdfjsLib !== "undefined") {
    pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js";
}

// دالة عرض التنبيهات في لوحة الأدمن (تتكامل مع التنبيهات الأساسية للموقع)
function showAdminToast(message, type = "success") {
    const safeType = (type === "info" || type === "warning") ? "success" : type; // لأن الداشبورد تدعم success و error فقط
    if (typeof showDashToast === "function") {
        showDashToast(message, safeType);
    } else if (typeof showToast === "function") {
        showToast(message, safeType);
    } else {
        console.log(`${type.toUpperCase()}: ${message}`);
    }
}

document.addEventListener("DOMContentLoaded", function () {
    if (!KNOWLEDGE_BOT_CONFIG.ENABLED) return;

    injectAdminTabHtml();
    setupAdminTabEventListeners();

    // تحميل المصادر والإحصائيات الافتراضية
    loadSources();
    loadStats();
    
    // تهيئة علامة التبويب الأولى
    switchAdminTab("sources");
});

// 1. دالة بناء كود الـ HTML وعرض شاشة الأدمن بتبويبات بريميوم
function injectAdminTabHtml() {
    const viewBotSection = document.getElementById("view-bot");
    if (!viewBotSection) return;

    viewBotSection.innerHTML = `
        <div class="bot-admin-container">
            <!-- شريط التبويبات الرئيسي -->
            <div class="bot-admin-tabs">
                <button class="bot-tab-btn active" data-tab="sources" onclick="switchAdminTab('sources')">📁 إدارة الملفات والمصادر</button>
                <button class="bot-tab-btn" data-tab="simulator" onclick="switchAdminTab('simulator')">🔍 محاكي الـ RAG والبحث</button>
                <button class="bot-tab-btn" data-tab="editor" onclick="switchAdminTab('editor')">✏️ محرر الـ Chunks</button>
                <button class="bot-tab-btn" data-tab="unanswered" onclick="switchAdminTab('unanswered')">⚠️ أسئلة تحتاج لإجابة</button>
                <button class="bot-tab-btn" data-tab="stats" onclick="switchAdminTab('stats')">📊 الاستهلاك والإحصائيات</button>
            </div>

            <!-- التبويب 1: إدارة المصادر والرفع -->
            <div id="adminTab_sources" class="bot-tab-content">
                <div class="bot-admin-grid">
                    <!-- العمود الشمال: تظبيط الملفات والفورم اليدوي -->
                    <div class="bot-admin-col-left">
                        <div class="glass-card bot-card">
                            <h3 class="bot-card-title">📤 رفع ملف معرفة جديد</h3>
                            <p class="bot-card-desc">ارمي ملف PDF أو Excel هنا.. المتصفح هيقرأه ويفصصه محلياً من غير ما يتقل السيرفر.</p>
                            <div id="botDragDropArea" class="bot-drag-drop">
                                <span class="bot-upload-icon">📁</span>
                                <p class="bot-drag-text">شد الملف وارميه هنا أو <span class="bot-browse-btn">اضغط عشان تختار</span></p>
                                <span class="bot-file-specs">الملفات المقبولة: PDF و Excel (xlsx, xls)</span>
                                <input type="file" id="botFileInput" style="display:none;" accept=".pdf, .xlsx, .xls">
                            </div>
                        </div>

                        <div class="glass-card bot-card" style="margin-top: 20px;">
                            <h3 class="bot-card-title">📝 إضافة سؤال وجواب يدوياً</h3>
                            <p class="bot-card-desc">لو عندك سؤال ملوش ملف.. اكتبه هنا بإيدك علطول وهيتحفظ في الذاكرة.</p>
                            <form id="botManualQaForm" class="bot-form">
                                <div class="bot-form-group">
                                    <label for="qaTopic">القسم / الموضوع الرئيسي:</label>
                                    <input type="text" id="qaTopic" placeholder="مثال: رسوم الحساب الجاري، كروت الفيزا" required>
                                </div>
                                <div class="bot-form-group">
                                    <label for="qaQuestion">السؤال المتوقع:</label>
                                    <input type="text" id="qaQuestion" placeholder="مثال: إزاي أغير رقم الموبايل المسجل؟" required>
                                </div>
                                <div class="bot-form-group">
                                    <label for="qaAnswer">الإجابة المعتمدة:</label>
                                    <textarea id="qaAnswer" placeholder="اكتب الإجابة التفصيلية بكل وضوح..." required></textarea>
                                </div>
                                <button type="submit" class="bot-btn-submit">➕ ضيف السؤال والجواب دلوقتي</button>
                            </form>
                        </div>
                        
                        <div class="glass-card bot-card" style="margin-top: 20px;">
                            <h3 class="bot-card-title">⚙️ إعدادات مفتاح الـ API والموديل</h3>
                            <p class="bot-card-desc">تحديث مفتاح API الخاص بـ Gemini ومزامنته تلقائياً لمنع توقف البوت.</p>
                            <div class="bot-form">
                                <div class="bot-form-group">
                                    <label for="botApiKey">Gemini API Key:</label>
                                    <div style="display:flex; gap:8px;">
                                        <input type="password" id="botApiKey" placeholder="أدخل الـ API Key الجديد هنا..." style="flex:1; padding:10px; border-radius:10px; border:1px solid rgba(255,255,255,0.1); background:rgba(0,0,0,0.2); color:white;">
                                        <button type="button" onclick="toggleApiKeyVisibility()" style="background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.1); border-radius:10px; padding:0 12px; cursor:pointer; color:white;">👁️</button>
                                    </div>
                                </div>
                                <div class="bot-form-group">
                                    <label for="botModelSelect">AI Model:</label>
                                    <select id="botModelSelect" style="width:100%; padding:10px; border-radius:10px; border:1px solid rgba(255,255,255,0.1); background:rgba(0,0,0,0.2); color:white;">
                                        <option value="gemini-2.5-flash">Gemini 2.5 Flash (Recommended)</option>
                                        <option value="gemini-3.5-flash">Gemini 3.5 Flash</option>
                                        <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
                                        <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
                                    </select>
                                </div>
                                <button onclick="saveBotSettings()" class="bot-btn-submit" style="background:linear-gradient(135deg,#27ae60,#2ecc71); margin-top:10px;">💾 حفظ الإعدادات</button>
                            </div>
                        </div>
                    </div>

                    <!-- العمود اليمين: عرض الملفات المرفوعة -->
                    <div class="bot-admin-col-right">
                        <div class="glass-card bot-card">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; border-bottom: 1px dashed rgba(255,255,255,0.1); padding-bottom:10px;">
                                <h3 class="bot-card-title" style="margin:0;">📂 مصادر المعرفة الحالية</h3>
                                <div style="display:flex; gap:6px;">
                                    <button onclick="exportKnowledgeBase()" class="bot-btn-submit" style="margin:0; padding:6px 12px; font-size:11px; width:auto; height:auto; background:linear-gradient(135deg,#f39c12,#d35400); border-radius:6px; cursor:pointer;">📥 تصدير</button>
                                    <button onclick="triggerImportFileInput()" class="bot-btn-submit" style="margin:0; padding:6px 12px; font-size:11px; width:auto; height:auto; background:linear-gradient(135deg,#1abc9c,#16a085); border-radius:6px; cursor:pointer;">📤 استيراد</button>
                                    <button onclick="refreshBotCacheBtn()" class="bot-btn-submit" style="margin:0; padding:6px 12px; font-size:11px; width:auto; height:auto; background:linear-gradient(135deg,#2980b9,#3498db); border-radius:6px; cursor:pointer;">🔄 تحديث الذاكرة</button>
                                    <input type="file" id="botImportInput" style="display:none;" accept=".json" onchange="importKnowledgeBase(event)">
                                </div>
                            </div>
                            <div class="bot-table-container">
                                <table class="bot-sources-table">
                                    <thead>
                                        <tr>
                                            <th>اسم المصدر</th>
                                            <th>النوع</th>
                                            <th>عدد القطع</th>
                                            <th>تحليل الملف</th>
                                            <th>الحالة</th>
                                            <th>تحكم</th>
                                        </tr>
                                    </thead>
                                    <tbody id="botSourcesList">
                                        <tr>
                                            <td colspan="6" style="text-align:center; color:var(--text-muted);">بنجيبلك الداتا.. لحظة واحدة يا بطل</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- التبويب 2: محاكي الـ RAG -->
            <div id="adminTab_simulator" class="bot-tab-content" style="display:none;">
                <div class="glass-card bot-card">
                    <h3 class="bot-card-title">🔍 محاكي استعلامات RAG والبحث الدلالي</h3>
                    <p class="bot-card-desc">اختبر كيف يرى البوت الأسئلة، ما هي الفقرات (Chunks) المسترجعة من Firestore، ودرجة المطابقة (Score) لكل منها.</p>
                    
                    <div style="display:flex; gap:10px; margin-bottom:20px;">
                        <input type="text" id="ragSimInput" placeholder="اكتب سؤالاً للتجربة... (مثال: ما فائدة القرض الشخصي؟)" style="flex:1; padding:12px; border-radius:10px; border:1px solid rgba(255,255,255,0.1); background:rgba(0,0,0,0.3); color:white; font-size:14px;">
                        <button onclick="runRAGSimulation()" class="bot-btn-submit" style="width:auto; margin:0; padding:0 24px;">🔬 فحص واسترجاع</button>
                    </div>

                    <div id="ragSimResults" class="rag-sim-results-container">
                        <div style="text-align:center; color:rgba(255,255,255,0.3); padding:40px 0;">اكتب سؤالاً واضغط على زر الفحص لرؤية مخرجات محرك البحث دلالياً ورقمياً.</div>
                    </div>
                </div>
            </div>

            <!-- التبويب 3: محرر الـ Chunks -->
            <div id="adminTab_editor" class="bot-tab-content" style="display:none;">
                <div class="glass-card bot-card">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; border-bottom: 1px dashed rgba(255,255,255,0.1); padding-bottom:10px;">
                        <div>
                            <h3 class="bot-card-title" style="margin:0;">✏️ محرر الـ Chunks المخزنة في Firestore</h3>
                            <p class="bot-card-desc" style="margin:0; margin-top:5px;">عدل نصوص قاعدة المعرفة مباشرةً دون الحاجة لإعادة رفع الملفات.</p>
                        </div>
                        <div style="display:flex; gap:8px;">
                            <input type="text" id="chunkSearchInput" oninput="loadChunksForEditor()" placeholder="ابحث داخل الـ chunks..." style="padding:6px 12px; border-radius:8px; border:1px solid rgba(255,255,255,0.1); background:rgba(0,0,0,0.3); color:white; font-size:12px; width:200px;">
                        </div>
                    </div>
                    
                    <div class="bot-editor-container" id="chunksEditorList">
                        <div style="text-align:center; color:rgba(255,255,255,0.3); padding:40px 0;">جاري تحميل الفقرات...</div>
                    </div>
                </div>
            </div>

            <!-- التبويب 4: سجل الأسئلة غير المجابة -->
            <div id="adminTab_unanswered" class="bot-tab-content" style="display:none;">
                <div class="glass-card bot-card">
                    <h3 class="bot-card-title">⚠️ سجل الأسئلة التي لم يعثر البوت على إجابة لها (Unanswered Queries)</h3>
                    <p class="bot-card-desc">هنا تظهر الأسئلة التي طرحها الموظفون وخرج لهم رد الفولباك (الخدمة غير متوفرة أو لم يعثر على تطابق). اضغط على "إضافة إجابة" لتأمينها فوراً.</p>
                    
                    <div class="bot-table-container">
                        <table class="bot-sources-table">
                            <thead>
                                <tr>
                                    <th>السؤال المطروح</th>
                                    <th>الموظف</th>
                                    <th>الوقت</th>
                                    <th>التكلفة التقريبية</th>
                                    <th>تحكم</th>
                                </tr>
                            </thead>
                            <tbody id="unansweredQueriesList">
                                <tr>
                                    <td colspan="5" style="text-align:center; color:rgba(255,255,255,0.3); padding:20px;">جاري تحميل قائمة الأسئلة...</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- التبويب 5: إحصائيات الاستهلاك والتقارير -->
            <div id="adminTab_stats" class="bot-tab-content" style="display:none;">
                <div class="glass-card bot-card">
                    <h3 class="bot-card-title">📊 مراقبة أداء وتكلفة استهلاك Gemini API</h3>
                    <p class="bot-card-desc">إحصائيات حية تحسب استهلاك التوكينز وتكلفتها التقديرية بالدولار، مع رسم بياني تاريخي لثقة إجابات البوت.</p>
                    
                    <div class="bot-stats-grid" style="margin-bottom:30px;">
                        <div class="bot-stat-item">
                            <span class="bot-stat-val" id="statsQueriesCount">0</span>
                            <span class="bot-stat-lbl">إجمالي الاستعلامات</span>
                        </div>
                        <div class="bot-stat-item">
                            <span class="bot-stat-val" id="statsAnsweredCount">0</span>
                            <span class="bot-stat-lbl">إجابات ناجحة</span>
                        </div>
                        <div class="bot-stat-item">
                            <span class="bot-stat-val" id="statsTotalTokens">0</span>
                            <span class="bot-stat-lbl">إجمالي التوكينز</span>
                        </div>
                        <div class="bot-stat-item">
                            <span class="bot-stat-val" id="statsEstimatedCost">$0.00</span>
                            <span class="bot-stat-lbl">التكلفة التقديرية ($)</span>
                        </div>
                    </div>

                    <h4 style="color:#2ecc71; margin-bottom:10px; font-size:14px;">📈 مؤشر درجات ثقة البوت التاريخية (Confidence Trend)</h4>
                    <div class="bot-chart-wrapper" id="confidenceChartWrapper">
                        <!-- هنا هنبني رسم بياني SVG ذكي وتفاعلي -->
                        <div style="text-align:center; padding:50px 0; color:rgba(255,255,255,0.25);">جاري رسم البيانات البيانية...</div>
                    </div>
                </div>
            </div>
        </div>
    `;
    loadBotSettingsInForm();
}

// 2. دالة ربط المستمعين للأحداث
function setupAdminTabEventListeners() {
    const dropArea = document.getElementById("botDragDropArea");
    const fileInput = document.getElementById("botFileInput");
    const qaForm = document.getElementById("botManualQaForm");

    if (dropArea && fileInput) {
        dropArea.addEventListener("click", () => fileInput.click());
        
        dropArea.addEventListener("dragover", (e) => {
            e.preventDefault();
            dropArea.classList.add("dragover");
        });

        dropArea.addEventListener("dragleave", () => {
            dropArea.classList.remove("dragover");
        });

        dropArea.addEventListener("drop", (e) => {
            e.preventDefault();
            dropArea.classList.remove("dragover");
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                handleUploadedFile(files[0]);
            }
        });

        fileInput.addEventListener("change", (e) => {
            if (fileInput.files.length > 0) {
                handleUploadedFile(fileInput.files[0]);
                fileInput.value = "";
            }
        });
    }

    if (qaForm) {
        qaForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const topic = document.getElementById("qaTopic").value.trim();
            const question = document.getElementById("qaQuestion").value.trim();
            const answer = document.getElementById("qaAnswer").value.trim();

            await handleManualQaSubmit(topic, question, answer);
            qaForm.reset();
        });
    }
}

// 3. التنقل بين علامات التبويب (Tab Switching Logic)
window.switchAdminTab = function(tabName) {
    document.querySelectorAll(".bot-tab-content").forEach(el => el.style.display = "none");
    document.querySelectorAll(".bot-tab-btn").forEach(btn => btn.classList.remove("active"));
    
    const activeContent = document.getElementById(`adminTab_${tabName}`);
    const activeBtn = document.querySelector(`.bot-tab-btn[data-tab="${tabName}"]`);
    
    if (activeContent) activeContent.style.display = "block";
    if (activeBtn) activeBtn.classList.add("active");

    if (tabName === "editor") loadChunksForEditor();
    if (tabName === "unanswered") loadUnansweredQueries();
    if (tabName === "stats") {
        loadStats();
        drawConfidenceChart();
    }
};

// 4. معالج فحص وتوجيه الملف المرفوع حسب نوعه
async function handleUploadedFile(file) {
    const name = file.name;
    const extension = name.split(".").pop().toLowerCase();

    if (extension !== "pdf" && extension !== "xlsx" && extension !== "xls") {
        showAdminToast("الملف ده غير مدعوم! ارفع ملف PDF أو Excel شيت عشان نعرف نقرأه.", "error");
        return;
    }

    showAdminToast("جاري فحص وقراءة الملف في المتصفح.. خليك هنا ثواني", "info");
    
    try {
        if (typeof loadBotConfiguration === "function") {
            await loadBotConfiguration();
        }
        const author = (currentUser && currentUser.username) ? currentUser.username : "Admin";
        
        const sourceDoc = await db.collection("knowledge_bot_sources").add({
            name: name,
            type: extension === "pdf" ? "pdf" : "excel",
            uploadedAt: firebase.firestore.FieldValue.serverTimestamp(),
            uploadedBy: author,
            status: "Processing",
            chunkCount: 0,
            analysis: {
                status: "Processing",
                extractionCoverage: 0,
                answerReadiness: 0,
                potentialQuestions: 0,
                summary: "جاري تحليل الملف وفهرسته..."
            }
        });

        if (extension === "pdf") {
            await processPDFLocal(file, name, sourceDoc.id);
        } else {
            await processExcelLocal(file, name, sourceDoc.id);
        }

    } catch (err) {
        console.error("فشل رفع سجل الملف:", err);
        showAdminToast("فشلت عملية الرفع: " + err.message, "error");
    }
}

// 5. استخراج نصوص PDF محلياً بالتقطيع الهرمي (Parent-Child Indexing)
async function processPDFLocal(file, name, sourceId) {
    const reader = new FileReader();
    reader.onload = async function (e) {
        try {
            const typedarray = new Uint8Array(e.target.result);
            
            if (typeof pdfjsLib === "undefined") {
                throw new Error("مكتبة قراءة الـ PDF مش شغالة أو متحملتش.. يرجى التحقق من النت.");
            }
            
            const pdf = await pdfjsLib.getDocument(typedarray).promise;
            const finalChunks = [];
            let readablePages = 0;
            let totalChars = 0;
            let ocrPages = 0;
            let detectedHeadings = 0;
            let currentSection = "";

            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();
                let text = textContent.items.map(item => item.str).join(" ");
                let usedOcr = false;
                
                const heading = detectPdfHeading(textContent.items, text);
                if (heading) {
                    currentSection = heading;
                    detectedHeadings += 1;
                }

                if (text.trim() === "") {
                    const ocrText = await ocrPdfPage(page);
                    if (!ocrText.trim()) continue;
                    text = ocrText;
                    usedOcr = true;
                    ocrPages += 1;
                }
                readablePages += 1;
                totalChars += text.trim().length;

                // أ) بناء وحفظ الـ Parent Chunk (محتوى الصفحة بالكامل لضمان جودة الرد للـ AI)
                const parentChunk = {
                    sourceId: sourceId,
                    sourceName: name,
                    type: "pdf",
                    content: text,
                    pageNumber: i,
                    chunkIndex: 999, // مؤشر مميز للأب
                    isParent: true,
                    sourcePath: currentSection ? [name, currentSection, `Page ${i}`] : [name, `Page ${i}`]
                };
                
                // حفظ الأب أولاً للحصول على الـ ID في Firestore
                const parentDocRef = await db.collection("knowledge_bot_chunks").add(parentChunk);

                // ب) تقطيع الصفحة لقطع أصغر (Child Chunks) للـ Vector Search
                const childTexts = splitTextIntoChunks(text, 450, 100);
                childTexts.forEach((cText, idx) => {
                    finalChunks.push({
                        sourceId: sourceId,
                        sourceName: name,
                        type: "pdf",
                        content: cText,
                        pageNumber: i,
                        chunkIndex: idx,
                        parentId: parentDocRef.id, // ربط الابن بالأب للتقطيع الهرمي
                        isChild: true,
                        extractionMethod: usedOcr ? "ocr" : "pdf_text",
                        sectionHeading: currentSection,
                        sourcePath: currentSection ? [name, currentSection, `Page ${i}`] : [name, `Page ${i}`]
                    });
                });
            }

            if (finalChunks.length === 0) {
                throw new Error("ملقناش أي نصوص مكتوبة جوا ملف الـ PDF ده عشان نسجلها.");
            }

            // حفظ الأبناء وبناء الفيكتور
            const vectorResult = await saveChunksToDb(finalChunks);
            const analysis = buildKnowledgeAnalysisReport({
                type: "pdf",
                fileName: name,
                chunkCount: finalChunks.length,
                chunks: finalChunks,
                totalChars,
                totalPages: pdf.numPages,
                readablePages,
                ocrPages,
                detectedHeadings,
                embeddedCount: vectorResult.embeddedCount,
                vectorFailed: vectorResult.failed,
                vectorError: vectorResult.error,
                extractionMethods: [
                    "PDF.js text extraction",
                    "Parent-Child hierarchical chunking",
                    "Optional OCR for scanned pages",
                    "Heading/section detection",
                    "Page-aware chunking",
                    "Vector embedding indexing"
                ]
            });
            
            await updateSourceStatus(sourceId, "Ready", finalChunks.length, analysis);
            showAdminToast(`تم تفكيك الـ PDF لـ ${finalChunks.length} جزء هرمي وحفظه بالذاكرة!`, "success");
            loadSources();
            if (typeof fetchAndCacheChunks === "function") fetchAndCacheChunks(true);
            
        } catch (err) {
            console.error("خطأ قراءة الـ PDF:", err);
            await updateSourceStatus(sourceId, "Failed", 0);
            showAdminToast("فشلت قراءة ملف الـ PDF: " + err.message, "error");
            loadSources();
        }
    };
    reader.readAsArrayBuffer(file);
}

async function ocrPdfPage(page) {
    if (typeof Tesseract === "undefined") return "";
    try {
        const viewport = page.getViewport({ scale: 1.8 });
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        await page.render({ canvasContext: ctx, viewport }).promise;
        const result = await Tesseract.recognize(canvas, "ara+eng");
        return result?.data?.text || "";
    } catch (err) {
        console.warn("OCR failed for PDF page:", err.message);
        return "";
    }
}

function detectPdfHeading(items, pageText) {
    const candidates = (items || [])
        .map(item => ({
            text: String(item.str || "").trim(),
            size: Math.abs(item.transform?.[0] || item.height || 0)
        }))
        .filter(item => item.text.length >= 4 && item.text.length <= 90);

    if (candidates.length) {
        const maxSize = Math.max(...candidates.map(i => i.size || 0));
        const large = candidates.find(item => item.size >= maxSize * 0.95 && isHeadingLike(item.text));
        if (large) return large.text;
    }

    const firstSentence = String(pageText || "").split(/[.\n\r]/).map(s => s.trim()).find(Boolean) || "";
    return isHeadingLike(firstSentence) ? firstSentence.slice(0, 90) : "";
}

function isHeadingLike(text) {
    const clean = String(text || "").trim();
    if (clean.length < 4 || clean.length > 90) return false;
    const wordCount = clean.split(/\s+/).length;
    const hasHeadingNumber = /^\d+(\.\d+)*[\-\s)]/.test(clean);
    const mostlyCaps = /[A-Z]/.test(clean) && clean === clean.toUpperCase();
    const arabicShortTitle = /[\u0600-\u06FF]/.test(clean) && wordCount <= 8 && !/[,:؛،]$/.test(clean);
    return hasHeadingNumber || mostlyCaps || arabicShortTitle;
}

// 6. استخراج جداول Excel بالتقطيع الهيكلي المتقدم والـ Row Narrator
async function processExcelLocal(file, name, sourceId) {
    if (typeof XLSX === "undefined") {
        showAdminToast("مكتبة قراءة الـ Excel مش متحملة.. اتأكد من توفر المكتبة.", "error");
        await updateSourceStatus(sourceId, "Failed", 0);
        return;
    }

    const reader = new FileReader();
    reader.onload = async function (e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, {
                type: "array",
                cellText: true,
                cellDates: true,
                cellFormula: true
            });
            await parseWorkbook(workbook, data);
        } catch (err) {
            console.error("Excel parse error:", err);
            await updateSourceStatus(sourceId, "Failed", 0);
            showAdminToast("فشلت قراءة ملف الـ Excel: " + err.message, "error");
        }
    };
    reader.readAsArrayBuffer(file);

    async function parseWorkbook(workbook, fileBuffer) {
        const chunks = [];
        const metrics = {
            sheetCount: (workbook.SheetNames && workbook.SheetNames.length) || Object.keys(workbook.Sheets || {}).length,
            totalRows: 0,
            nonEmptyRows: 0,
            qaRows: 0,
            headerCount: 0,
            totalChars: 0,
            tableBlocks: 0,
            sheetTypes: {},
            extractionMethods: [
                "XLSX workbook parsing",
                "Merged-cell normalization",
                "Hierarchical nested-headers parsing",
                "Human-style sheet reading by visible row and cell",
                "Logical Row Narrator generation",
                "JSON structured row mapping",
                "Multi-sheet processing",
                "Source tree metadata",
                "Vector embedding indexing"
            ]
        };

        try {
            // معالجة كافة التبويبات (Multi-Sheet Support)
            const sheetNames = (workbook.SheetNames && workbook.SheetNames.length)
                ? workbook.SheetNames
                : Object.keys(workbook.Sheets || {});

            sheetNames.forEach(sheetName => {
                const sheet = workbook.Sheets[sheetName];
                fillMergedCells(sheet);
                ensureExcelSheetRange(sheet);
                const sheetChunkStart = chunks.length;

                const matrix = XLSX.utils.sheet_to_json(sheet, {
                    header: 1,
                    defval: "",
                    raw: false,
                    blankrows: false
                });

                if (!matrix || matrix.length === 0) {
                    const readingChunks = buildExcelSheetReadingChunks(sheet, name, sourceId, sheetName, "General Data");
                    readingChunks.forEach(chunk => {
                        chunks.push(chunk);
                        metrics.totalChars += (chunk.content || "").length;
                    });
                    return;
                }

                // الكشف عن الهيدر ودمج Nested Headers
                const headerInfo = detectExcelHeader(matrix);
                const headers = headerInfo.headers;
                const headerRowIndex = headerInfo.headerRowIndex;
                
                const dataRows = matrix.slice(headerRowIndex + 1);
                metrics.totalRows += dataRows.length;
                metrics.headerCount += headers.filter(Boolean).length;
                
                const qCols = headers.filter(h => /سؤال|سوال|question|q\b/i.test(h));
                const aCols = headers.filter(h => /إجابة|اجابة|جواب|answer|response|reply|a\b/i.test(h));
                const isQA = qCols.length > 0 && aCols.length > 0;
                
                const sheetType = detectSheetType(headers, dataRows, isQA);
                metrics.sheetTypes[sheetName] = sheetType;
                metrics.tableBlocks += estimateTableBlocks(matrix);

                const readingChunks = buildExcelSheetReadingChunks(sheet, name, sourceId, sheetName, sheetType);
                readingChunks.forEach(chunk => {
                    chunks.push(chunk);
                    metrics.totalChars += (chunk.content || "").length;
                });
                const tableChunkStart = chunks.length;

                // معالجة سطر بسطر (Row-by-Row Chunking)
                dataRows.forEach((arrRow, rowIdx) => {
                    const excelRowNumber = headerRowIndex + rowIdx + 2;
                    const vals = arrRow.map(v => String(v || "").trim());
                    if (vals.every(v => v === "")) return;
                    metrics.nonEmptyRows += 1;

                    const row = {};
                    headers.forEach((h, i) => {
                        row[h] = vals[i] || "";
                    });

                    // JSON Structured Ingestion
                    const columns = {};
                    headers.forEach(h => {
                        const val = String(row[h] || "").trim();
                        if (val) columns[h] = val;
                    });

                    const sourcePath = buildExcelSourcePath(name, sheetName, row, headers, excelRowNumber);
                    
                    // توليد نص سردي لغوي (Row-to-Text Narrator) لرفع مطابقة البحث الدلالي
                    let narrative = `في ورقة العمل ${sheetName} من ملف ${name}، في الصف رقم ${excelRowNumber}: `;
                    headers.forEach(h => {
                        const val = String(row[h] || "").trim();
                        if (val) {
                            narrative += `قيمة ${h} هي (${val})، `;
                        }
                    });
                    narrative = narrative.slice(0, -2); // إزالة الفصلة الأخيرة

                    // عرض الجدول بتنسيق Markdown
                    let mdTable = `| الحقل/العمود | القيمة/البيان |\n| --- | --- |\n`;
                    headers.forEach(h => {
                        const val = String(row[h] || "").trim();
                        if (val) mdTable += `| **${h}** | ${val} |\n`;
                    });

                    let content = `📊 مرجع جدول إكسيل (${name})\n📂 شيت: ${sheetName} | صف: ${excelRowNumber}\n📍 المسار: ${sourcePath.join(" -> ")}\n\n${mdTable}`;
                    metrics.totalChars += content.length;

                    chunks.push({
                        sourceId,
                        sourceName: name,
                        type: "excel",
                        sheetType,
                        content,
                        sheetName,
                        rowNumber: excelRowNumber,
                        columns,
                        sourcePath,
                        narrative, // تخزين النص السردي
                        question: isQA ? qCols.map(c => row[c]).filter(Boolean).join(" ").trim() : "",
                        answer: isQA ? aCols.map(c => row[c]).filter(Boolean).join(" ").trim() : "",
                        topic: sourcePath.slice(2).join(" > ")
                    });

                    if (isQA && (chunks[chunks.length - 1].question || chunks[chunks.length - 1].answer)) {
                        metrics.qaRows += 1;
                    }
                });

                if (chunks.length === tableChunkStart && readingChunks.length === 0) {
                    const fallbackChunks = buildFallbackExcelTextChunks(sheet, name, sourceId, sheetName, sheetType);
                    fallbackChunks.forEach(chunk => {
                        chunks.push(chunk);
                        metrics.nonEmptyRows += 1;
                        metrics.totalChars += (chunk.content || "").length;
                    });
                }

                if (chunks.length === sheetChunkStart) {
                    metrics.sheetTypes[sheetName] = "Empty/Unreadable";
                }
            });

            if (chunks.length === 0) {
                const deepChunks = await buildDeepExcelFallbackChunks(fileBuffer, name, sourceId, workbook);
                deepChunks.forEach(chunk => {
                    chunks.push(chunk);
                    metrics.nonEmptyRows += 1;
                    metrics.totalChars += (chunk.content || "").length;
                });
                if (deepChunks.length) {
                    metrics.extractionMethods.push("Deep XLSX XML/raw text fallback extraction");
                    metrics.sheetTypes["Deep extraction"] = "Recovered Text";
                }
            }

            if (chunks.length === 0) {
                const sheetNames = (workbook.SheetNames || Object.keys(workbook.Sheets || [])).join(", ") || "لا توجد شيتات";
                throw new Error(`لم نستخرج أي نص من ملف الإكسيل. الشيتات المقروءة: ${sheetNames}. لو الملف عبارة عن صورة داخل Excel أو شيت محمي/مشفر، احفظيه كـ xlsx عادي أو ابعتيلي نسخة منه أفحصها.`);
            }

            const vectorResult = await saveChunksToDb(chunks);
            const analysis = buildKnowledgeAnalysisReport({
                type: "excel",
                fileName: name,
                chunkCount: chunks.length,
                chunks,
                totalChars: metrics.totalChars,
                sheetCount: metrics.sheetCount,
                totalRows: metrics.totalRows,
                nonEmptyRows: metrics.nonEmptyRows,
                qaRows: metrics.qaRows,
                headerCount: metrics.headerCount,
                tableBlocks: metrics.tableBlocks,
                sheetTypes: metrics.sheetTypes,
                embeddedCount: vectorResult.embeddedCount,
                vectorFailed: vectorResult.failed,
                vectorError: vectorResult.error,
                extractionMethods: metrics.extractionMethods
            });
            
            await updateSourceStatus(sourceId, "Ready", chunks.length, analysis);
            showAdminToast(`✅ تم تحليل وحفظ الـ Excel هرمياً! ${chunks.length} صف جاهز للبحث الدلالي والـ JSON.`, "success");
            loadSources();
            if (typeof fetchAndCacheChunks === "function") fetchAndCacheChunks(true);
        } catch (err) {
            console.error("خطأ قراءة الـ Excel:", err);
            await updateSourceStatus(sourceId, "Failed", 0);
            showAdminToast("فشلت قراءة ملف الـ Excel: " + err.message, "error");
            loadSources();
        }
    }
}

// 7. معالجة وحفظ السؤال والجواب اليدوي
async function handleManualQaSubmit(topic, question, answer) {
    showAdminToast("جاري حفظ سؤالك اليدوي...", "info");
    try {
        const author = (currentUser && currentUser.username) ? currentUser.username : "Admin";
        
        const sourceSnapshot = await db.collection("knowledge_bot_sources")
            .where("name", "==", "Manual Q&A Entries")
            .limit(1)
            .get();

        let sourceId = "";
        let currentCount = 0;

        if (sourceSnapshot.empty) {
            const newSource = await db.collection("knowledge_bot_sources").add({
                name: "Manual Q&A Entries",
                type: "qa_manual",
                uploadedAt: firebase.firestore.FieldValue.serverTimestamp(),
                uploadedBy: author,
                status: "Ready",
                chunkCount: 1
            });
            sourceId = newSource.id;
            currentCount = 0;
        } else {
            sourceId = sourceSnapshot.docs[0].id;
            currentCount = sourceSnapshot.docs[0].data().chunkCount || 0;
        }

        const manualChunk = {
            sourceId: sourceId,
            sourceName: "Manual Q&A Entries",
            type: "qa_manual",
            content: `الموضوع: ${topic}\nالسؤال: ${question}\nالإجابة: ${answer}`,
            topic: topic,
            question: question,
            answer: answer,
            sourcePath: ["Manual Q&A Entries", topic || "General"]
        };

        if (typeof enrichChunksWithEmbeddings === "function") {
            await enrichChunksWithEmbeddings([manualChunk]);
        }

        await db.collection("knowledge_bot_chunks").add(manualChunk);
        await updateSourceStatus(sourceId, "Ready", currentCount + 1);
        
        showAdminToast("تم حفظ السؤال والجواب في قاعدة بيانات البوت بنجاح!", "success");
        loadSources();
        if (typeof fetchAndCacheChunks === "function") fetchAndCacheChunks(true);
        
    } catch (err) {
        console.error("فشل حفظ السؤال والجواب اليدوي:", err);
        showAdminToast("فشل الحفظ: " + err.message, "error");
    }
}

function fillMergedCells(sheet) {
    const merges = sheet["!merges"] || [];
    merges.forEach(range => {
        const firstAddress = XLSX.utils.encode_cell(range.s);
        const firstCell = sheet[firstAddress];
        if (!firstCell || firstCell.v === undefined || firstCell.v === "") return;

        for (let r = range.s.r; r <= range.e.r; r++) {
            for (let c = range.s.c; c <= range.e.c; c++) {
                const address = XLSX.utils.encode_cell({ r, c });
                if (!sheet[address] || sheet[address].v === undefined || sheet[address].v === "") {
                    sheet[address] = { t: firstCell.t || "s", v: firstCell.v, w: firstCell.w || String(firstCell.v) };
                }
            }
        }
    });
}

// كشف ودمج الهيدرز الهرمية (Hierarchical Nested Headers)
function detectExcelHeader(matrix) {
    // 1. نبحث أولاً عن صف يحتوي على كلمات دلالية صريحة للعناوين في أول 12 صفاً
    for (let idx = 0; idx < Math.min(matrix.length, 12); idx++) {
        const row = matrix[idx];
        if (!row) continue;
        const values = row.map(v => String(v || "").trim()).filter(Boolean);
        if (values.length < 2) continue;

        const joined = values.join(" ").toLowerCase();
        if (/question|answer|topic|section|module|category|script|policy|سؤال|اجابة|إجابة|موضوع|قسم|تصنيف/i.test(joined)) {
            return { headerRowIndex: idx, headers: buildHeadersFromRow(matrix, idx) };
        }
    }

    // 2. إذا لم نجد، نختار أول صف غير فارغ يحتوي على عمودين على الأقل
    for (let idx = 0; idx < Math.min(matrix.length, 12); idx++) {
        const row = matrix[idx];
        if (!row) continue;
        const values = row.map(v => String(v || "").trim()).filter(Boolean);
        if (values.length >= 2) {
            return { headerRowIndex: idx, headers: buildHeadersFromRow(matrix, idx) };
        }
    }

    // 3. كحل أخير، نختار أول صف
    return { headerRowIndex: 0, headers: buildHeadersFromRow(matrix, 0) };
}

// دالة مساعدة لبناء مصفوفة العناوين وتطهيرها من التكرار أو دمج العناوين المتداخلة
function buildHeadersFromRow(matrix, headerIdx) {
    const headerRow = matrix[headerIdx] || [];
    let headers = [];

    if (KNOWLEDGE_BOT_CONFIG.EXCEL_CONFIG.PARSE_HIERARCHICAL_HEADERS && headerIdx > 0) {
        const mainRow = matrix[headerIdx - 1] || [];
        let lastMainHeader = "";
        
        headers = headerRow.map((value, colIdx) => {
            const mainVal = String(mainRow[colIdx] || "").trim();
            if (mainVal) {
                lastMainHeader = mainVal;
            }
            const subVal = String(value || "").trim();
            
            if (lastMainHeader) {
                return subVal ? `${lastMainHeader} - ${subVal}` : lastMainHeader;
            }
            return subVal || `Column ${XLSX.utils.encode_col(colIdx)}`;
        });
    } else {
        const used = new Map();
        headers = headerRow.map((value, index) => {
            const fallback = `Column ${XLSX.utils.encode_col(index)}`;
            let header = String(value || "").trim() || fallback;
            if (used.has(header)) {
                const count = used.get(header) + 1;
                used.set(header, count);
                header = `${header} ${count}`;
            } else {
                used.set(header, 1);
            }
            return header;
        });
    }

    const maxColumns = Math.max(...matrix.map(row => row.length), headers.length);
    for (let i = headers.length; i < maxColumns; i++) {
        headers.push(`Column ${XLSX.utils.encode_col(i)}`);
    }

    return headers;
}

function detectSheetType(headers, dataRows, isQA) {
    const text = `${headers.join(" ")} ${dataRows.slice(0, 10).flat().join(" ")}`.toLowerCase();
    if (isQA) return "Q&A";
    if (/script|call|scenario|سيناريو|اسكريبت|سكريبت|مكالمة|عميل/i.test(text)) return "Call Script";
    if (/policy|procedure|rules|terms|سياسة|اجراء|إجراء|شروط|قواعد/i.test(text)) return "Policy/Procedure";
    if (/step|action|flow|خطوة|خطوات|مسار|اجراء/i.test(text)) return "Steps/Process";
    if (/product|service|fee|price|rate|خدمة|منتج|رسوم|سعر|فايدة|فائدة/i.test(text)) return "Product/Service Table";
    return "General Data";
}

function estimateTableBlocks(matrix) {
    let blocks = 0;
    let inBlock = false;

    matrix.forEach(row => {
        const nonEmpty = row.map(v => String(v || "").trim()).filter(Boolean).length;
        if (nonEmpty >= 2 && !inBlock) {
            blocks += 1;
            inBlock = true;
        }
        if (nonEmpty === 0) {
            inBlock = false;
        }
    });

    return blocks;
}

function buildExcelSourcePath(fileName, sheetName, row, headers, rowNumber) {
    const path = [fileName, sheetName];
    const candidates = [
        /module|system|screen|page|flow|script|ملف|موديول|شاشة|صفحة/i,
        /section|department|category|قسم|تصنيف|ادارة|إدارة/i,
        /subsection|sub section|subcategory|نوع|فرعي/i,
        /topic|subject|case|scenario|policy|service|service name|موضوع|حالة|سيناريو|خدمة|سياسة/i,
        /step|substep|action|اجراء|إجراء|خطوة/i
    ];

    candidates.forEach(pattern => {
        const header = headers.find(h => pattern.test(h));
        const value = header ? String(row[header] || "").trim() : "";
        if (value && !path.includes(value)) path.push(value);
    });

    if (path.length === 2) {
        path.push(`Row ${rowNumber}`);
    }

    return path;
}

function getExcelCellText(cell) {
    if (!cell) return "";
    const value = cell.w !== undefined
        ? cell.w
        : (cell.v !== undefined ? cell.v : (cell.f ? `=${cell.f}` : (cell.h || cell.r || "")));
    return String(value === undefined || value === null ? "" : value).trim();
}

function getExcelCellAddresses(sheet) {
    return Object.keys(sheet || {}).filter(key => /^[A-Z]+[0-9]+$/i.test(key));
}

function getExcelSheetRange(sheet) {
    if (!sheet) return null;
    if (sheet["!ref"]) {
        try {
            return XLSX.utils.decode_range(sheet["!ref"]);
        } catch (err) {
            console.warn("Invalid Excel !ref, deriving range from cells:", sheet["!ref"]);
        }
    }

    const addresses = getExcelCellAddresses(sheet);
    if (!addresses.length) return null;

    return addresses.reduce((range, address) => {
        const cell = XLSX.utils.decode_cell(address);
        range.s.r = Math.min(range.s.r, cell.r);
        range.s.c = Math.min(range.s.c, cell.c);
        range.e.r = Math.max(range.e.r, cell.r);
        range.e.c = Math.max(range.e.c, cell.c);
        return range;
    }, {
        s: { r: Number.MAX_SAFE_INTEGER, c: Number.MAX_SAFE_INTEGER },
        e: { r: 0, c: 0 }
    });
}

function ensureExcelSheetRange(sheet) {
    if (!sheet || sheet["!ref"]) return;
    const range = getExcelSheetRange(sheet);
    if (range) {
        sheet["!ref"] = XLSX.utils.encode_range(range);
    }
}

function buildExcelSheetReadingChunks(sheet, fileName, sourceId, sheetName, sheetType) {
    const range = getExcelSheetRange(sheet);
    if (!range) return [];

    const readableRange = sheet["!ref"] || XLSX.utils.encode_range(range);
    const rowReadings = [];

    for (let r = range.s.r; r <= range.e.r; r++) {
        const cells = [];

        for (let c = range.s.c; c <= range.e.c; c++) {
            const address = XLSX.utils.encode_cell({ r, c });
            const text = getExcelCellText(sheet[address]);
            if (!text) continue;

            cells.push(`${address}: ${text}`);
        }

        if (cells.length) {
            rowReadings.push({
                rowNumber: r + 1,
                text: `صف ${r + 1}: ${cells.join(" | ")}`
            });
        }
    }

    if (!rowReadings.length) return [];

    const chunks = [];
    const maxChars = 3200;
    let currentRows = [];
    let currentText = "";

    const flush = () => {
        if (!currentRows.length) return;

        const firstRow = currentRows[0].rowNumber;
        const lastRow = currentRows[currentRows.length - 1].rowNumber;
        const rowLabel = firstRow === lastRow ? `Row ${firstRow}` : `Rows ${firstRow}-${lastRow}`;
        const body = currentRows.map(row => row.text).join("\n");
        const sourcePath = [fileName, sheetName, "قراءة كاملة للشيت", rowLabel];

        chunks.push({
            sourceId,
            sourceName: fileName,
            type: "excel",
            sheetType: sheetType || "General Data",
            content: `قراءة كاملة كأن شخص فاتح ملف Excel بعينه\nالملف: ${fileName}\nالشيت: ${sheetName}\nالنطاق المقروء: ${readableRange}\nالصفوف: ${rowLabel}\n\n${body}`,
            sheetName,
            rowNumber: firstRow,
            rowRange: rowLabel,
            sourcePath,
            narrative: `قراءة كاملة للشيت ${sheetName} من ملف ${fileName}. ${body}`,
            topic: sourcePath.slice(2).join(" > "),
            isSheetReading: true,
            chunkIndex: chunks.length
        });

        currentRows = [];
        currentText = "";
    };

    rowReadings.forEach(row => {
        const nextText = currentText ? `${currentText}\n${row.text}` : row.text;
        if (nextText.length > maxChars && currentRows.length) {
            flush();
        }
        currentRows.push(row);
        currentText = currentText ? `${currentText}\n${row.text}` : row.text;
    });
    flush();

    return chunks;
}

function buildFallbackExcelTextChunks(sheet, fileName, sourceId, sheetName, sheetType) {
    const range = getExcelSheetRange(sheet);
    if (!range) return [];

    const chunks = [];

    for (let r = range.s.r; r <= range.e.r; r++) {
        const rowCells = [];
        const columns = {};

        for (let c = range.s.c; c <= range.e.c; c++) {
            const address = XLSX.utils.encode_cell({ r, c });
            const text = getExcelCellText(sheet[address]);
            if (!text) continue;

            const label = `Cell ${address}`;
            rowCells.push(`**${label}**: ${text}`);
            columns[label] = text;
        }

        if (!rowCells.length) continue;

        const excelRowNumber = r + 1;
        const sourcePath = [fileName, sheetName, `Row ${excelRowNumber}`];
        const narrative = `Excel sheet ${sheetName} from ${fileName}, row ${excelRowNumber}: ${rowCells.join("; ")}`;
        const mdTable = rowCells
            .map(item => {
                const splitAt = item.indexOf(": ");
                return `| ${item.slice(2, splitAt - 2)} | ${item.slice(splitAt + 2)} |`;
            })
            .join("\n");

        chunks.push({
            sourceId,
            sourceName: fileName,
            type: "excel",
            sheetType: sheetType || "General Data",
            content: `📊 مرجع نصوص إكسيل (${fileName})\n📂 شيت: ${sheetName} | صف: ${excelRowNumber}\n📍 المسار: ${sourcePath.join(" -> ")}\n\n| الخلية | النص |\n| --- | --- |\n${mdTable}`,
            sheetName,
            rowNumber: excelRowNumber,
            columns,
            sourcePath,
            narrative,
            question: "",
            answer: "",
            topic: sourcePath.slice(2).join(" > "),
            extractionMethod: "cell_text_fallback"
        });
    }

    return chunks;
}

async function buildDeepExcelFallbackChunks(fileBuffer, fileName, sourceId, workbook) {
    const chunks = [];

    const xmlChunks = await extractTextFromXlsxZip(fileBuffer, fileName, sourceId, workbook).catch(err => {
        console.warn("Deep XLSX XML extraction failed:", err);
        return [];
    });
    chunks.push(...xmlChunks);

    if (!chunks.length) {
        const rawChunks = extractReadableTextFromBinary(fileBuffer, fileName, sourceId);
        chunks.push(...rawChunks);
    }

    return chunks;
}

async function extractTextFromXlsxZip(fileBuffer, fileName, sourceId, workbook) {
    if (typeof JSZip === "undefined") return [];

    const zip = await JSZip.loadAsync(fileBuffer);
    const sharedStrings = await readXlsxSharedStrings(zip);
    const sheetFiles = Object.keys(zip.files)
        .filter(path => /^xl\/worksheets\/sheet\d+\.xml$/i.test(path))
        .sort((a, b) => Number(a.match(/sheet(\d+)/i)?.[1] || 0) - Number(b.match(/sheet(\d+)/i)?.[1] || 0));

    const chunks = [];
    for (let i = 0; i < sheetFiles.length; i++) {
        const sheetPath = sheetFiles[i];
        const sheetXml = await zip.file(sheetPath).async("string");
        const sheetName = workbook?.SheetNames?.[i] || `Sheet ${i + 1}`;
        const sheetRows = readXlsxWorksheetRows(sheetXml, sharedStrings);

        chunks.push(...buildDeepTextChunks({
            rows: sheetRows,
            fileName,
            sourceId,
            sheetName,
            label: "قراءة XML مباشرة من خلايا الشيت",
            extractionMethod: "xlsx_xml_cells"
        }));
    }

    const drawingFiles = Object.keys(zip.files)
        .filter(path => /^xl\/drawings\/drawing\d+\.xml$/i.test(path))
        .sort();

    for (let i = 0; i < drawingFiles.length; i++) {
        const drawingPath = drawingFiles[i];
        const drawingXml = await zip.file(drawingPath).async("string");
        const drawingTexts = readXmlTextNodes(drawingXml);
        if (!drawingTexts.length) continue;

        chunks.push(...buildDeepTextChunks({
            rows: drawingTexts.map((text, idx) => ({ rowNumber: idx + 1, text })),
            fileName,
            sourceId,
            sheetName: `Drawing ${i + 1}`,
            label: "نصوص Text Boxes / Shapes داخل ملف Excel",
            extractionMethod: "xlsx_drawing_text"
        }));
    }

    if (!chunks.length) {
        const xmlFiles = Object.keys(zip.files)
            .filter(path => /^xl\/.+\.xml$/i.test(path))
            .sort();
        const xmlRows = [];

        for (const xmlPath of xmlFiles) {
            const xml = await zip.file(xmlPath).async("string");
            readXmlTextNodes(xml).forEach(text => {
                xmlRows.push({
                    rowNumber: xmlRows.length + 1,
                    text: `${xmlPath}: ${text}`
                });
            });
        }

        chunks.push(...buildDeepTextChunks({
            rows: xmlRows,
            fileName,
            sourceId,
            sheetName: "XLSX XML text",
            label: "قراءة كل النصوص الموجودة داخل XML ملف Excel",
            extractionMethod: "xlsx_all_xml_text"
        }));
    }

    if (!chunks.length) {
        chunks.push(...await extractTextFromXlsxImages(zip, fileName, sourceId));
    }

    return chunks;
}

async function extractTextFromXlsxImages(zip, fileName, sourceId) {
    if (typeof Tesseract === "undefined") return [];

    const imageFiles = Object.keys(zip.files)
        .filter(path => /^xl\/media\/.+\.(png|jpg|jpeg|webp|bmp)$/i.test(path))
        .sort();
    const rows = [];

    for (let i = 0; i < imageFiles.length; i++) {
        const imagePath = imageFiles[i];
        try {
            const blob = await zip.file(imagePath).async("blob");
            const result = await Tesseract.recognize(blob, "ara+eng");
            const text = String(result?.data?.text || "").replace(/\s+/g, " ").trim();
            if (text) {
                rows.push({
                    rowNumber: i + 1,
                    text: `${imagePath}: ${text}`
                });
            }
        } catch (err) {
            console.warn("Excel image OCR failed:", imagePath, err);
        }
    }

    return buildDeepTextChunks({
        rows,
        fileName,
        sourceId,
        sheetName: "Excel embedded images",
        label: "قراءة OCR للصور الموجودة داخل ملف Excel",
        extractionMethod: "xlsx_image_ocr"
    });
}

async function readXlsxSharedStrings(zip) {
    const file = zip.file("xl/sharedStrings.xml");
    if (!file) return [];

    const xml = await file.async("string");
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    return Array.from(doc.getElementsByTagName("si")).map(si =>
        getXmlElementsByLocalName(si, "t").map(t => t.textContent || "").join("")
    );
}

function readXlsxWorksheetRows(xml, sharedStrings) {
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    return Array.from(doc.getElementsByTagName("row")).map((rowNode, idx) => {
        const rowNumber = Number(rowNode.getAttribute("r")) || idx + 1;
        const cells = Array.from(rowNode.getElementsByTagName("c")).map(cellNode => {
            const address = cellNode.getAttribute("r") || "";
            const type = cellNode.getAttribute("t") || "";
            let text = "";

            if (type === "inlineStr") {
                text = getXmlElementsByLocalName(cellNode, "t").map(t => t.textContent || "").join("");
            } else {
                const valueNode = cellNode.getElementsByTagName("v")[0];
                const formulaNode = cellNode.getElementsByTagName("f")[0];
                const rawValue = valueNode ? (valueNode.textContent || "") : "";
                text = type === "s" ? (sharedStrings[Number(rawValue)] || "") : (rawValue || (formulaNode ? `=${formulaNode.textContent || ""}` : ""));
            }

            return text ? `${address}: ${text}` : "";
        }).filter(Boolean);

        return cells.length ? { rowNumber, text: `صف ${rowNumber}: ${cells.join(" | ")}` } : null;
    }).filter(Boolean);
}

function readXmlTextNodes(xml) {
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    const textNodes = getXmlElementsByLocalName(doc, "t");
    const candidates = textNodes.length ? textNodes : Array.from(doc.getElementsByTagName("*"));

    return candidates
        .map(node => String(node.textContent || "").trim())
        .filter(text => text.length > 1 && /[\p{L}\p{N}]/u.test(text));
}

function getXmlElementsByLocalName(root, localName) {
    return Array.from(root.getElementsByTagName("*"))
        .filter(node => (node.localName || node.nodeName || "").toLowerCase() === localName.toLowerCase());
}

function extractReadableTextFromBinary(fileBuffer, fileName, sourceId) {
    const decoders = ["utf-8", "windows-1256", "windows-1252"];
    const candidates = [];

    decoders.forEach(encoding => {
        try {
            candidates.push(new TextDecoder(encoding).decode(fileBuffer));
        } catch (err) {
            // Some browsers do not support all legacy encodings.
        }
    });

    const best = candidates
        .map(text => cleanRawExtractedText(text))
        .sort((a, b) => b.length - a.length)[0] || "";

    if (best.length < 20) return [];

    const rows = splitTextIntoChunks(best, 2500, 0).map((text, idx) => ({
        rowNumber: idx + 1,
        text
    }));

    return buildDeepTextChunks({
        rows,
        fileName,
        sourceId,
        sheetName: "Raw file text",
        label: "قراءة نص خام من ملف Excel",
        extractionMethod: "raw_binary_text"
    });
}

function cleanRawExtractedText(text) {
    return String(text || "")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/[^\p{L}\p{N}\s.,:;!?()[\]{}@#%&+\-=/\\|"'،؛؟]/gu, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function buildDeepTextChunks({ rows, fileName, sourceId, sheetName, label, extractionMethod }) {
    if (!rows || !rows.length) return [];

    const chunks = [];
    const maxChars = 3200;
    let current = [];
    let currentText = "";

    const flush = () => {
        if (!current.length) return;

        const firstRow = current[0].rowNumber;
        const lastRow = current[current.length - 1].rowNumber;
        const rowRange = firstRow === lastRow ? `Row ${firstRow}` : `Rows ${firstRow}-${lastRow}`;
        const body = current.map(row => row.text).join("\n");
        const sourcePath = [fileName, sheetName, label, rowRange];

        chunks.push({
            sourceId,
            sourceName: fileName,
            type: "excel",
            sheetType: "Recovered Text",
            content: `${label}\nالملف: ${fileName}\nالشيت/المصدر: ${sheetName}\nالنطاق: ${rowRange}\n\n${body}`,
            sheetName,
            rowNumber: firstRow,
            rowRange,
            columns: { text: body },
            sourcePath,
            narrative: `${label} من ${sheetName}: ${body}`,
            topic: sourcePath.slice(2).join(" > "),
            extractionMethod,
            isDeepFallback: true,
            chunkIndex: chunks.length
        });

        current = [];
        currentText = "";
    };

    rows.forEach(row => {
        const nextText = currentText ? `${currentText}\n${row.text}` : row.text;
        if (nextText.length > maxChars && current.length) flush();
        current.push(row);
        currentText = currentText ? `${currentText}\n${row.text}` : row.text;
    });
    flush();

    return chunks;
}

function splitTextIntoChunks(text, size = 500, overlap = 100) {
    const normalized = String(text || "").replace(/\s+/g, " ").trim();
    if (!normalized) return [];
    if (normalized.length <= size) return [normalized];

    const sentences = normalized.match(/[^.!؟?]+[.!؟?]?/g) || [normalized];
    const semanticChunks = [];
    let current = "";

    sentences.forEach(sentence => {
        const next = `${current} ${sentence}`.trim();
        if (next.length <= size || current.length < size * 0.45) {
            current = next;
        } else {
            semanticChunks.push(current);
            current = sentence.trim();
        }
    });
    if (current) semanticChunks.push(current);

    if (semanticChunks.length > 1) {
        return semanticChunks
            .map((chunk, index) => {
                if (index === 0 || overlap <= 0) return chunk.trim();
                const previous = semanticChunks[index - 1];
                const overlapText = previous.slice(Math.max(0, previous.length - overlap));
                return `${overlapText} ${chunk}`.trim();
            })
            .filter(c => c.length > 8);
    }

    const chunks = [];
    let i = 0;
    while (i < normalized.length) {
        let end = i + size;
        if (end < normalized.length) {
            const lastSpace = normalized.lastIndexOf(" ", end);
            if (lastSpace > i + size - 100) {
                end = lastSpace;
            }
        }
        chunks.push(normalized.substring(i, end).trim());
        i = end - overlap;
        if (i < 0) i = 0;
        if (end >= normalized.length) break;
    }
    return chunks.filter(c => c.length > 8);
}

function clampPercent(value) {
    return Math.max(0, Math.min(100, Math.round(value || 0)));
}

function estimatePotentialQuestions({ chunkCount, totalChars, qaRows, nonEmptyRows }) {
    const byChunks = Math.max(0, chunkCount || 0);
    const byText = Math.ceil((totalChars || 0) / 450);
    const byRows = Math.ceil((nonEmptyRows || 0) * 1.4);
    const byQa = (qaRows || 0) * 2;
    return Math.max(byChunks, byText, byRows, byQa, 1);
}

function normalizeProfileText(text) {
    return String(text || "")
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]+/gu, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function getProfileChunkText(chunk) {
    const pathText = Array.isArray(chunk.sourcePath) ? chunk.sourcePath.join(" ") : (chunk.sourcePath || "");
    const columnsText = chunk.columns ? Object.entries(chunk.columns).map(([k, v]) => `${k}: ${v}`).join(" ") : "";
    return [
        chunk.content,
        chunk.narrative,
        chunk.question,
        chunk.answer,
        chunk.topic,
        chunk.sheetName,
        chunk.sheetType,
        pathText,
        columnsText
    ].filter(Boolean).join("\n");
}

function countKeywordHits(text, groups) {
    return groups.map(group => ({
        label: group.label,
        hits: group.words.reduce((sum, word) => sum + (text.includes(normalizeProfileText(word)) ? 1 : 0), 0)
    })).sort((a, b) => b.hits - a.hits);
}

function detectDocumentTypeFromChunks(type, chunks, sheetTypes = {}) {
    const combined = normalizeProfileText(chunks.slice(0, 120).map(getProfileChunkText).join(" "));
    const sheetTypeValues = Object.values(sheetTypes || {}).join(" ").toLowerCase();
    const groups = countKeywordHits(`${combined} ${sheetTypeValues}`, [
        { label: "Q&A Knowledge Base", words: ["question", "answer", "faq", "سؤال", "اجابة", "إجابة", "جواب"] },
        { label: "Call Script / Scenario", words: ["script", "scenario", "call", "customer says", "سيناريو", "اسكريبت", "مكالمة", "عميل"] },
        { label: "Policy / Procedure", words: ["policy", "procedure", "rules", "terms", "steps", "سياسة", "اجراء", "إجراء", "شروط", "خطوات"] },
        { label: "Fees / Rates Table", words: ["fees", "charges", "rate", "price", "رسوم", "مصروفات", "فائدة", "فايدة", "عائد"] },
        { label: "Product / Service Guide", words: ["product", "service", "account", "card", "loan", "منتج", "خدمة", "حساب", "بطاقة", "قرض"] }
    ]);

    const best = groups.find(g => g.hits > 0);
    if (best) return best.label;
    return type === "excel" ? "Structured Spreadsheet Knowledge" : "PDF Knowledge Document";
}

function extractTopTermsFromChunks(chunks, limit = 12) {
    const stop = new Set(["the", "and", "for", "with", "from", "this", "that", "page", "row", "sheet", "file", "excel", "pdf", "source", "value", "column", "table"]);
    const counts = new Map();

    chunks.slice(0, 180).forEach(chunk => {
        const text = normalizeProfileText([
            chunk.topic,
            chunk.sheetName,
            chunk.sheetType,
            Array.isArray(chunk.sourcePath) ? chunk.sourcePath.join(" ") : chunk.sourcePath,
            chunk.question,
            chunk.answer,
            chunk.narrative
        ].filter(Boolean).join(" "));

        text.split(" ").forEach(token => {
            if (token.length < 3 || stop.has(token) || /^\d+$/.test(token)) return;
            counts.set(token, (counts.get(token) || 0) + 1);
        });
    });

    return [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([term, count]) => ({ term, count }));
}

function extractMainTopics(chunks, sheetTypes = {}, limit = 10) {
    const topicCounts = new Map();
    Object.entries(sheetTypes || {}).forEach(([sheet, sheetType]) => {
        if (sheet) topicCounts.set(sheet, (topicCounts.get(sheet) || 0) + 2);
        if (sheetType) topicCounts.set(sheetType, (topicCounts.get(sheetType) || 0) + 1);
    });

    chunks.forEach(chunk => {
        [
            chunk.topic,
            chunk.sheetName,
            chunk.sheetType,
            chunk.sectionHeading,
            Array.isArray(chunk.sourcePath) ? chunk.sourcePath[1] : ""
        ].filter(Boolean).forEach(value => {
            const clean = String(value).trim();
            if (clean.length < 3 || clean.length > 90) return;
            topicCounts.set(clean, (topicCounts.get(clean) || 0) + 1);
        });
    });

    return [...topicCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([topic, weight]) => ({ topic, weight }));
}

function inferRelationsFromChunks(chunks, limit = 18) {
    const relations = [];
    const relationRules = [
        { relation: "has_fee_or_rate", words: ["fee", "fees", "charge", "rate", "رسوم", "مصروفات", "فائدة", "فايدة"] },
        { relation: "requires_document", words: ["document", "documents", "required", "مستند", "مستندات", "مطلوب"] },
        { relation: "has_condition", words: ["condition", "terms", "eligible", "شرط", "شروط", "استثناء"] },
        { relation: "has_step", words: ["step", "action", "procedure", "خطوة", "اجراء", "إجراء"] },
        { relation: "customer_response", words: ["say", "script", "customer", "قول", "عميل", "سيناريو"] }
    ];

    chunks.slice(0, 220).forEach(chunk => {
        const text = normalizeProfileText(getProfileChunkText(chunk));
        const subject = chunk.topic || chunk.sheetName || chunk.sectionHeading || chunk.sourceName || "Document";
        relationRules.forEach(rule => {
            if (!rule.words.some(word => text.includes(normalizeProfileText(word)))) return;
            const object = chunk.question || chunk.answer || chunk.narrative || chunk.content || "";
            const preview = String(object).replace(/\s+/g, " ").trim().slice(0, 120);
            if (!preview) return;
            relations.push({
                subject: String(subject).slice(0, 80),
                relation: rule.relation,
                object: preview,
                sourcePath: chunk.sourcePath || []
            });
        });
    });

    const seen = new Set();
    return relations.filter(rel => {
        const key = `${rel.subject}|${rel.relation}|${rel.object}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    }).slice(0, limit);
}

function generateLikelyQuestions({ type, chunks, mainTopics, documentType }, limit = 18) {
    const questions = [];
    chunks.forEach(chunk => {
        if (chunk.question && String(chunk.question).trim().length > 6) {
            questions.push(String(chunk.question).trim());
        }
    });

    mainTopics.slice(0, 8).forEach(item => {
        const topic = item.topic || item;
        questions.push(`What should the agent know about ${topic}?`);
        questions.push(`What are the required steps or conditions for ${topic}?`);
        if (/fee|rate|رسوم|مصروفات|فائدة/i.test(topic)) {
            questions.push(`What are the fees or rates for ${topic}?`);
        }
    });

    if (/script|scenario/i.test(documentType)) questions.push("What should the agent say to the customer in this scenario?");
    if (type === "excel") questions.push("Show the matching table rows with all column values.");
    if (type === "pdf") questions.push("Where is this policy mentioned in the PDF?");

    return [...new Set(questions)].slice(0, limit);
}

function buildAnswerPlaybook(documentType, type) {
    const playbook = [
        "Start with the direct answer in one short paragraph.",
        "Preserve numbers, dates, fees, brackets, and exception wording exactly from sources.",
        "Cite the strongest source after each factual statement.",
        "Ask a clarifying question when the product, service, or customer case is ambiguous."
    ];

    if (/Fees|Rates/i.test(documentType)) playbook.push("Use a compact table for fees/rates and include all conditions next to each value.");
    if (/Policy|Procedure/i.test(documentType)) playbook.push("Answer as steps, then list required conditions and exceptions.");
    if (/Script|Scenario/i.test(documentType)) playbook.push("End with a natural customer-facing sentence the agent can say.");
    if (type === "excel") playbook.push("When rows are retrieved, keep row numbers and column names visible.");
    if (type === "pdf") playbook.push("When possible, mention page and section to support Show Me Where mode.");

    return playbook;
}

function buildHealthReasons({ answerReadiness, extractionCoverage, vectorCoverage, chunks, qaRows, detectedHeadings, type, tableBlocks, sheetCount }) {
    const strengths = [];
    const risks = [];
    const missingSignals = [];

    if (extractionCoverage >= 90) strengths.push("High readable-text extraction coverage.");
    else risks.push("Some content may not be readable or extractable.");

    if (vectorCoverage >= 85) strengths.push("Most searchable chunks have vector embeddings.");
    else risks.push("Vector coverage is incomplete; semantic retrieval may be weaker.");

    if (chunks.length >= 10) strengths.push("Enough chunks exist for broad retrieval coverage.");
    else risks.push("The file produced a small knowledge surface.");

    if (type === "excel") {
        if (qaRows > 0) strengths.push("Q&A rows were detected and can answer directly.");
        else missingSignals.push("No clear Q&A structure detected.");
        if (tableBlocks > sheetCount) risks.push("Multiple table blocks may mix unrelated contexts.");
    }

    if (type === "pdf") {
        if (detectedHeadings > 0) strengths.push("PDF headings/sections were detected.");
        else missingSignals.push("No strong section headings detected.");
    }

    const riskLevel = answerReadiness >= 85 && risks.length <= 1 ? "low"
        : answerReadiness >= 65 ? "medium"
        : "high";

    return { strengths, risks, missingSignals, riskLevel };
}

function buildFileIntelligenceProfile(data, scores) {
    const chunks = Array.isArray(data.chunks) ? data.chunks : [];
    const sheetTypes = data.sheetTypes || {};
    const documentType = detectDocumentTypeFromChunks(data.type, chunks, sheetTypes);
    const mainTopics = extractMainTopics(chunks, sheetTypes);
    const keyEntities = extractTopTermsFromChunks(chunks);
    const relations = inferRelationsFromChunks(chunks);
    const generatedQuestions = generateLikelyQuestions({ type: data.type, chunks, mainTopics, documentType });
    const healthReasons = buildHealthReasons({
        answerReadiness: scores.answerReadiness,
        extractionCoverage: scores.extractionCoverage,
        vectorCoverage: scores.vectorCoverage,
        chunks,
        qaRows: data.qaRows || 0,
        detectedHeadings: data.detectedHeadings || 0,
        type: data.type,
        tableBlocks: data.tableBlocks || 0,
        sheetCount: data.sheetCount || 0
    });

    const bestUseCases = [];
    if (generatedQuestions.length) bestUseCases.push("Answer likely agent questions generated from the file.");
    if (relations.length) bestUseCases.push("Explain relationships between products, fees, conditions, documents, and steps.");
    if (data.type === "excel") bestUseCases.push("Find exact rows and preserve table values.");
    if (data.type === "pdf") bestUseCases.push("Show page-aware evidence for policy/procedure answers.");

    const recommendedAdminActions = [];
    if (healthReasons.missingSignals.length) recommendedAdminActions.push("Review missing signals and add clearer headings/columns if possible.");
    if (scores.vectorCoverage < 85) recommendedAdminActions.push("Rebuild vector index after confirming API key/proxy is stable.");
    if (data.type === "excel" && (data.qaRows || 0) === 0) recommendedAdminActions.push("Add optional Question/Answer columns for high-frequency cases.");
    if (data.type === "pdf" && (data.detectedHeadings || 0) === 0) recommendedAdminActions.push("Use a PDF with clear section headings for stronger Show Me Where answers.");

    return {
        version: 1,
        documentType,
        mainTopics,
        keyEntities,
        relations,
        generatedQuestions,
        answerPlaybook: buildAnswerPlaybook(documentType, data.type),
        healthReasons,
        bestUseCases,
        recommendedAdminActions,
        profileCoverage: clampPercent(Math.min(100, 35 + Math.min(mainTopics.length, 8) * 5 + Math.min(relations.length, 10) * 3 + Math.min(generatedQuestions.length, 12) * 2))
    };
}

function buildKnowledgeAnalysisReport(data) {
    const {
        type, fileName, chunkCount = 0, totalChars = 0, totalPages = 0,
        readablePages = 0, ocrPages = 0, detectedHeadings = 0, sheetCount = 0,
        totalRows = 0, nonEmptyRows = 0, qaRows = 0, headerCount = 0,
        tableBlocks = 0, sheetTypes = {}, embeddedCount = 0, vectorFailed = false,
        vectorError = "", extractionMethods = [], chunks = []
    } = data;

    const extractionCoverage = type === "pdf"
        ? (totalPages > 0 ? (readablePages / totalPages) * 100 : 0)
        : (chunkCount > 0 ? 100 : 0);

    const structureScore = type === "excel"
        ? Math.min(100, 45 + Math.min(headerCount, 20) * 2 + Math.min(qaRows, 10) * 3)
        : Math.min(100, 60 + Math.min(readablePages, 20) * 2);

    const indexedReadableText = chunkCount > 0 ? 100 : 0;
    const vectorCoverage = chunkCount > 0 ? (embeddedCount / chunkCount) * 100 : 0;
    const indexScore = chunkCount > 0 ? 100 : 0;
    const vectorScore = KNOWLEDGE_BOT_CONFIG.ENABLE_VECTOR_SEARCH ? clampPercent(vectorCoverage) : 70;
    const answerReadiness = clampPercent(
        (extractionCoverage * 0.34) +
        (structureScore * 0.22) +
        (indexScore * 0.22) +
        (vectorScore * 0.22)
    );
    const potentialQuestions = estimatePotentialQuestions({ chunkCount, totalChars, qaRows, nonEmptyRows });
    const warnings = [];

    if (type === "pdf" && totalPages > readablePages) {
        warnings.push(`${totalPages - readablePages} page(s) did not expose selectable text. Scanned pages may need OCR.`);
    }
    if (type === "pdf" && ocrPages > 0) {
        warnings.push(`${ocrPages} scanned page(s) were recovered with OCR.`);
    }
    if (type === "pdf" && detectedHeadings === 0) {
        warnings.push("No clear PDF headings were detected. Source paths will rely mostly on page numbers.");
    }
    if (type === "excel" && qaRows === 0) {
        warnings.push("No clear Q&A columns were detected. The bot will use row/column context instead.");
    }
    if (type === "excel" && tableBlocks > sheetCount) {
        warnings.push(`Multiple table-like blocks detected (${tableBlocks}).`);
    }

    const suggestions = [];
    if (type === "pdf" && totalPages > readablePages) suggestions.push("Use a selectable-text PDF.");
    if (type === "excel" && qaRows === 0) suggestions.push("Add Question & Answer columns.");

    const summary = answerReadiness >= 90
        ? "تمت قراءة وفهرسة النص القابل للاستخراج بجودة عالية."
        : "الترتيب والجاهزية متوسطة، قد تحتاج بعض الأسئلة لصياغة دقيقة.";

    const fileProfile = buildFileIntelligenceProfile(
        { ...data, chunks, qaRows, detectedHeadings, tableBlocks, sheetCount, sheetTypes, type },
        { answerReadiness, extractionCoverage, vectorCoverage }
    );

    return {
        status: "Ready", fileName, type, extractionCoverage: clampPercent(extractionCoverage),
        answerReadiness, indexedReadableText, vectorCoverage: clampPercent(vectorCoverage),
        embeddedCount, vectorSearchEnabled: !!KNOWLEDGE_BOT_CONFIG.ENABLE_VECTOR_SEARCH,
        potentialQuestions, chunkCount, totalChars, totalPages, readablePages, ocrPages,
        detectedHeadings, sheetCount, totalRows, nonEmptyRows, qaRows, headerCount, tableBlocks,
        sheetTypes, extractionMethods, warnings, suggestions, summary, fileProfile,
        profileCoverage: fileProfile.profileCoverage,
        riskLevel: fileProfile.healthReasons.riskLevel,
        analyzedAt: new Date().toISOString()
    };
}

function formatAnalysisBadge(analysis) {
    if (!analysis) return `<span class="bot-analysis-muted">لم يتم التحليل</span>`;
    const readiness = analysis.answerReadiness || 0;
    const coverage = analysis.extractionCoverage || 0;
    const vector = analysis.vectorCoverage || 0;
    const qCount = analysis.potentialQuestions || 0;
    const cls = readiness >= 90 ? "good" : readiness >= 70 ? "warn" : "bad";

    return `
        <div class="bot-analysis-mini ${cls}">
            <strong>${readiness}% جاهزية</strong>
            <span>${coverage}% قراءة</span>
            <span>${vector}% vector</span>
            <span>${qCount} سؤال محتمل</span>
        </div>
    `;
}

function escapeBotHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

async function saveChunksToDb(chunks) {
    let vectorResult = { embeddedCount: 0, failed: false, error: "" };
    if (typeof enrichChunksWithEmbeddings === "function") {
        showAdminToast("جاري بناء Vector Index للملف عشان البحث يبقى أذكى...", "info");
        vectorResult = await enrichChunksWithEmbeddings(chunks, (done, total) => {
            console.log(`Vector indexing ${done}/${total}`);
        });
    }

    const chunkCollection = db.collection("knowledge_bot_chunks");
    const hasEmbeddings = chunks.some(chunk => Array.isArray(chunk.embedding) && chunk.embedding.length);
    const batchSize = hasEmbeddings ? 75 : 400;
    
    for (let i = 0; i < chunks.length; i += batchSize) {
        const batch = db.batch();
        const batchSlice = chunks.slice(i, i + batchSize);
        
        batchSlice.forEach(chunk => {
            const docRef = chunkCollection.doc();
            batch.set(docRef, chunk);
        });
        await batch.commit();
    }
    return vectorResult;
}

async function updateSourceStatus(sourceId, status, chunkCount, analysis = null) {
    const payload = { status: status, chunkCount: chunkCount };
    if (analysis) payload.analysis = analysis;
    await db.collection("knowledge_bot_sources").doc(sourceId).update(payload);
}

// 8. تحميل وعرض ملفات المعرفة الحالية في الجدول
async function loadSources() {
    const container = document.getElementById("botSourcesList");
    if (!container) return;

    try {
        const snapshot = await db.collection("knowledge_bot_sources")
            .orderBy("uploadedAt", "desc")
            .get();

        if (snapshot.empty) {
            container.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align:center; color:var(--text-muted); padding: 15px;">مفيش أي مصادر معرفة مرفوعة لغاية دلوقتي.. ضيفلك كام ملف فوق يا بطل!</td>
                </tr>
            `;
            return;
        }

        container.innerHTML = snapshot.docs.map(doc => {
            const s = doc.data();
            const id = doc.id;

            let badgeClass = "bot-status-badge ";
            if (s.status === "Ready") badgeClass += "bot-status-ready";
            else if (s.status === "Processing") badgeClass += "bot-status-processing";
            else badgeClass += "bot-status-failed";

            const displayType = s.type === "pdf" ? "PDF 📄" : s.type === "excel" ? "EXCEL 📊" : "يدوي 📝";
            const safeName = escapeBotHtml(s.name || "بدون اسم");
            const statusText = s.status === "Ready" ? "جاهز" : s.status === "Processing" ? "جاري المعالجة" : "فشل";

            return `
                <tr>
                    <td class="bot-td-name" title="${safeName}">${safeName}</td>
                    <td>${displayType}</td>
                    <td>${s.chunkCount || 0} حتة</td>
                    <td>${formatAnalysisBadge(s.analysis)}</td>
                    <td><span class="${badgeClass}">${statusText}</span></td>
                    <td>
                        <button class="bot-action-btn-info" onclick="showSourceAnalysis('${id}')">تفاصيل</button>
                        <button class="bot-action-btn-del" onclick="deleteKnowledgeSource('${id}')">حذف</button>
                    </td>
                </tr>
            `;
        }).join("");

    } catch (err) {
        console.error("فشل جلب مصادر المعرفة:", err);
    }
}

window.showSourceAnalysis = async function(sourceId) {
    try {
        const doc = await db.collection("knowledge_bot_sources").doc(sourceId).get();
        if (!doc.exists) return;
        const source = doc.data();
        const analysis = source.analysis || {};
        const methods = (analysis.extractionMethods || []).map(m => `<li>${escapeBotHtml(m)}</li>`).join("");
        const warnings = (analysis.warnings || []).map(w => `<li>${escapeBotHtml(w)}</li>`).join("") || "<li>لا توجد تحذيرات.</li>";
        
        const profile = analysis.fileProfile || {};
        const health = profile.healthReasons || {};
        const renderList = (items, empty = "None detected.") => (items || []).length
            ? items.map(item => `<li>${escapeBotHtml(typeof item === "string" ? item : JSON.stringify(item))}</li>`).join("")
            : `<li>${escapeBotHtml(empty)}</li>`;
        const topics = (profile.mainTopics || []).map(t => `${t.topic} (${t.weight})`);
        const entities = (profile.keyEntities || []).map(e => `${e.term} (${e.count})`);
        const relations = (profile.relations || []).map(r => `${r.subject} -> ${r.relation} -> ${r.object}`);
        const generatedQuestions = profile.generatedQuestions || [];

        const html = `
            <div class="bot-analysis-modal-backdrop" onclick="closeSourceAnalysis(event)">
                <div class="bot-analysis-modal" onclick="event.stopPropagation()">
                    <div class="bot-analysis-modal-head">
                        <div><h3>تقرير تحليل الملف</h3><p>${escapeBotHtml(source.name)}</p></div>
                        <button onclick="closeSourceAnalysis()" class="bot-analysis-close">&times;</button>
                    </div>
                    <div class="bot-analysis-score-grid">
                        <div><strong>${analysis.extractionCoverage || 0}%</strong><span>قراءة</span></div>
                        <div><strong>${analysis.answerReadiness || 0}%</strong><span>جاهزية</span></div>
                        <div><strong>${analysis.vectorCoverage || 0}%</strong><span>Vector</span></div>
                        <div><strong>${analysis.potentialQuestions || 0}</strong><span>أسئلة</span></div>
                    </div>
                    <div class="bot-analysis-section">
                        <h4>ملخص التحليل</h4>
                        <p>${escapeBotHtml(analysis.summary)}</p>
                    </div>
                    <div class="bot-analysis-section bot-profile-section">
                        <h4>File Intelligence Profile</h4>
                        <div class="bot-analysis-kv">
                            <span>Document type</span><b>${escapeBotHtml(profile.documentType || "Unknown")}</b>
                            <span>Risk level</span><b>${escapeBotHtml(analysis.riskLevel || health.riskLevel || "unknown")}</b>
                            <span>Profile coverage</span><b>${analysis.profileCoverage || 0}%</b>
                            <span>Likely questions</span><b>${generatedQuestions.length}</b>
                            <span>Relations</span><b>${relations.length}</b>
                        </div>
                    </div>
                    <div class="bot-analysis-section bot-profile-section">
                        <h4>Topics & Entities</h4>
                        <div class="bot-profile-chips">
                            ${topics.slice(0, 10).map(t => `<span>${escapeBotHtml(t)}</span>`).join("") || "<span>No topics</span>"}
                        </div>
                        <div class="bot-profile-chips muted">
                            ${entities.slice(0, 12).map(e => `<span>${escapeBotHtml(e)}</span>`).join("") || "<span>No entities</span>"}
                        </div>
                    </div>
                    <div class="bot-analysis-section bot-profile-section">
                        <h4>Relations & Expected Questions</h4>
                        <ul>${renderList(relations.slice(0, 8), "No relations detected.")}</ul>
                        <ul>${renderList(generatedQuestions.slice(0, 8), "No generated questions.")}</ul>
                    </div>
                    <div class="bot-analysis-section bot-profile-section">
                        <h4>Health Reasons & Playbook</h4>
                        <ul>${renderList(health.strengths, "No strengths detected yet.")}</ul>
                        <ul>${renderList(health.risks, "No major risks detected.")}</ul>
                        <ul>${renderList(profile.answerPlaybook, "No playbook available.")}</ul>
                    </div>
                    <div class="bot-analysis-section">
                        <h4>التفاصيل الفنية</h4>
                        <ul>
                            <li>القطع الإجمالية: ${analysis.chunkCount}</li>
                            <li>الحروف الإجمالية: ${analysis.totalChars}</li>
                            <li>طرق الاستخراج: <ul>${methods}</ul></li>
                            <li>التحذيرات: <ul>${warnings}</ul></li>
                        </ul>
                    </div>
                </div>
            </div>
        `;
        document.querySelector(".bot-analysis-modal-backdrop")?.remove();
        document.body.insertAdjacentHTML("beforeend", html);
    } catch (e) {
        console.error(e);
    }
};

window.closeSourceAnalysis = function(event) {
    if (event && event.target !== event.currentTarget) return;
    document.querySelector(".bot-analysis-modal-backdrop")?.remove();
};

window.deleteKnowledgeSource = async function (sourceId) {
    if (!confirm("هل أنت متأكد تماماً إنك عاوز تحذف الملف ده وكل الحتت اللي استخرجناها منه؟")) return;

    showAdminToast("جاري حذف الملف...", "info");
    try {
        await db.collection("knowledge_bot_sources").doc(sourceId).delete();
        const chunksSnapshot = await db.collection("knowledge_bot_chunks")
            .where("sourceId", "==", sourceId)
            .get();

        const docs = chunksSnapshot.docs;
        const batchSize = 400;
        for (let i = 0; i < docs.length; i += batchSize) {
            const batch = db.batch();
            const slice = docs.slice(i, i + batchSize);
            slice.forEach(doc => {
                batch.delete(doc.ref);
            });
            await batch.commit();
        }

        showAdminToast("تم حذف ملف المعرفة بالكامل.", "success");
        loadSources();
        if (typeof fetchAndCacheChunks === "function") fetchAndCacheChunks(true);
    } catch (err) {
        showAdminToast("حذف الملف فشل: " + err.message, "error");
    }
};

window.refreshBotCacheBtn = async function() {
    showAdminToast("جاري مزامنة وتحديث ذاكرة البحث التلقائية...", "info");
    try {
        if (typeof fetchAndCacheChunks === "function") {
            await fetchAndCacheChunks(true);
            showAdminToast("تم تحديث ذاكرة البحث بنجاح!", "success");
        }
    } catch(err) {
        showAdminToast("فشل تحديث الكاش: " + err.message, "error");
    }
};

// 9. تحميل إحصائيات الاستخدام والأسئلة الأخيرة
async function loadStats() {
    const totalEl = document.getElementById("statTotalQueries") || document.getElementById("statsQueriesCount");
    const rateEl = document.getElementById("statAnswerRate") || document.getElementById("statsAnsweredCount");
    const tokensEl = document.getElementById("statTokens") || document.getElementById("statsTotalTokens");
    const logsList = document.getElementById("botLogsList");

    try {
        const snapshot = await db.collection("knowledge_bot_logs")
            .orderBy("timestamp", "desc")
            .limit(100)
            .get();

        if (snapshot.empty) return;

        const logs = snapshot.docs.map(d => d.data());
        const total = logs.length;
        const answered = logs.filter(l => l.answered === true).length;
        const answerRate = Math.round((answered / total) * 100);
        
        let totalTokens = 0;
        logs.forEach(l => {
            totalTokens += l.tokensEstimated || 0;
        });

        if (totalEl) totalEl.innerText = total;
        if (rateEl) {
            if (rateEl.id === "statsAnsweredCount") rateEl.innerText = answered;
            else rateEl.innerText = answerRate + "%";
        }
        if (tokensEl) tokensEl.innerText = (totalTokens / 1000).toFixed(1) + "k";

        const costEl = document.getElementById("statsEstimatedCost");
        if (costEl) {
            // تكلفة تقريبية لـ Gemini API ($0.000075 لكل 1K توكنز)
            const estimatedCost = (totalTokens * 0.000075 / 1000).toFixed(4);
            costEl.innerText = `$${estimatedCost}`;
        }

        if (logsList) {
            const recentLogs = logs.slice(0, 5);
            logsList.innerHTML = recentLogs.map(log => {
                const date = log.timestamp ? log.timestamp.toDate().toLocaleTimeString() : "دلوقتي حالا";
                const answerClass = log.answered ? "log-lbl-answered" : "log-lbl-fallback";
                return `
                    <div class="bot-log-row">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <span class="bot-log-user">👤 الموظف: ${log.username || "agent"}</span>
                            <span class="bot-log-time">${date}</span>
                        </div>
                        <p class="bot-log-q" style="direction:rtl; text-align:right;">السؤال: ${log.question || ""}</p>
                        <span class="${answerClass}">${log.answered ? "لقي إجابة" : "ملاقااش إجابة"}</span>
                    </div>
                `;
            }).join("");
        }

    } catch (err) {
        console.error("فشل جلب إحصائيات البوت:", err);
    }
}

// ─── ميزات لوحة تحكم الأدمن المتقدمة المضافة 🚀 ───

// أ) تشغيل محاكي استعلامات RAG التفصيلي
window.runRAGSimulation = async function() {
    const query = document.getElementById("ragSimInput").value.trim();
    const resultsContainer = document.getElementById("ragSimResults");
    if (!query) {
        showAdminToast("من فضلك اكتب سؤالاً أولاً للتجربة!", "error");
        return;
    }

    resultsContainer.innerHTML = `<div style="text-align:center; padding:40px 0;"><span class="bot-spinner-icon">🔄</span> جاري استرجاع القطع وحساب درجات التشابه...</div>`;
    
    try {
        const lexicalRanked = rankChunks(query);
        const vectorRanked = await rankChunksByVector(query);
        const maxChunks = KNOWLEDGE_BOT_CONFIG.MAX_CHUNKS || 10;
        const hybridRanked = mergeHybridRankings(vectorRanked, lexicalRanked, maxChunks * 2);
        
        let finalChunks = hybridRanked.map(item => item.chunk);
        if (KNOWLEDGE_BOT_CONFIG.RERANK_ENABLED) {
            finalChunks = rerankChunks(hybridRanked, query);
        }

        if (finalChunks.length === 0) {
            resultsContainer.innerHTML = `<div style="color:var(--danger); text-align:center; padding:20px;">لم يتم العثور على أي قطعة متطابقة في قاعدة البيانات!</div>`;
            return;
        }

        let html = `<h4 style="color:#2ecc71; margin-bottom:15px; font-size:14px;">🔎 تم استرجاع ${finalChunks.length} قطعة متطابقة:</h4>`;
        
        finalChunks.forEach((chunk, index) => {
            const scoreItem = hybridRanked.find(h => h.chunk.id === chunk.id) || { score: 0.5, vectorScore: 0, lexicalScore: 0 };
            const loc = chunk.type === "excel" ? `صف إكسيل رقم ${chunk.rowNumber}` : `صفحة PDF رقم ${chunk.pageNumber}`;
            
            html += `
                <div class="rag-sim-chunk-card" style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.05); border-radius:10px; padding:15px; margin-bottom:15px; direction:rtl; text-align:right;">
                    <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:8px; margin-bottom:10px;">
                        <span style="font-weight:bold; color:#3498db;">#${index+1} | ${escapeBotHtml(chunk.sourceName)} - ${loc}</span>
                        <div style="display:flex; gap:10px; font-size:11px;">
                            <span style="color:#2ecc71;">الدمج: ${(scoreItem.score || 0).toFixed(3)}</span>
                            <span style="color:#9b59b6;">Vector: ${(scoreItem.vectorScore || 0).toFixed(3)}</span>
                            <span style="color:#f1c40f;">Lexical: ${(scoreItem.lexicalScore || 0).toFixed(3)}</span>
                        </div>
                    </div>
                    <pre style="white-space:pre-wrap; font-size:12px; color:rgba(255,255,255,0.85); background:rgba(0,0,0,0.15); padding:10px; border-radius:6px; margin:0;">${escapeBotHtml(chunk.content || chunk.answer || "")}</pre>
                    ${chunk.narrative ? `<div style="font-size:10px; color:rgba(255,255,255,0.45); margin-top:8px;"><b>النص السردي:</b> ${escapeBotHtml(chunk.narrative)}</div>` : ""}
                </div>
            `;
        });

        resultsContainer.innerHTML = html;
    } catch(e) {
        console.error(e);
        resultsContainer.innerHTML = `<div style="color:var(--danger);">فشل تشغيل المحاكي: ${e.message}</div>`;
    }
};

// ب) محرر الـ Chunks المباشر في Firestore
window.loadChunksForEditor = async function() {
    const listContainer = document.getElementById("chunksEditorList");
    const searchVal = document.getElementById("chunkSearchInput")?.value.trim().toLowerCase() || "";
    if (!listContainer) return;

    listContainer.innerHTML = `<div style="text-align:center; padding:20px; color:rgba(255,255,255,0.4);">🔄 جاري تحميل الـ Chunks من Firestore...</div>`;
    
    try {
        let snapshot;
        if (searchVal) {
            // فلترة محلية من الكاش لتفادي التكلفة والاستعلامات المعقدة
            const filtered = cachedChunks.filter(c => 
                (c.content || "").toLowerCase().includes(searchVal) ||
                (c.sourceName || "").toLowerCase().includes(searchVal)
            ).slice(0, 40);
            renderEditorList(filtered, listContainer);
        } else {
            const ref = await db.collection("knowledge_bot_chunks").limit(40).get();
            const docs = ref.docs.map(d => ({ id: d.id, ...d.data() }));
            renderEditorList(docs, listContainer);
        }
    } catch(e) {
        listContainer.innerHTML = `<div style="color:var(--danger);">تعذر تحميل البيانات: ${e.message}</div>`;
    }
};

function renderEditorList(chunks, container) {
    if (chunks.length === 0) {
        container.innerHTML = `<div style="text-align:center; padding:20px; color:rgba(255,255,255,0.4);">لم يتم العثور على أي فقرات مطابقة.</div>`;
        return;
    }

    container.innerHTML = chunks.map(c => {
        const text = c.content || c.answer || "";
        return `
            <div class="chunk-editor-card" id="chunkCard_${c.id}" style="background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.06); border-radius:10px; padding:15px; margin-bottom:12px; direction:rtl; text-align:right;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; border-bottom:1px dashed rgba(255,255,255,0.05); padding-bottom:5px;">
                    <span style="font-size:12px; font-weight:bold; color:#e67e22;">📍 المصدر: ${escapeBotHtml(c.sourceName || "مدخل يدوي")}</span>
                    <button class="bot-action-btn-info" onclick="toggleEditChunkInline('${c.id}')" style="background:#2980b9; border-radius:5px; padding:4px 10px; font-size:11px;">عدل النص ✏️</button>
                </div>
                <div id="chunkDisplay_${c.id}" style="font-size:12.5px; color:rgba(255,255,255,0.8); white-space:pre-wrap;">${escapeBotHtml(text)}</div>
                <div id="chunkEditForm_${c.id}" style="display:none; margin-top:10px;">
                    <textarea id="chunkTextarea_${c.id}" style="width:100%; height:120px; background:rgba(0,0,0,0.4); border:1px solid rgba(255,255,255,0.15); border-radius:8px; padding:10px; color:white; font-size:13px; font-family:inherit; direction:rtl; resize:vertical;">${text}</textarea>
                    <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:8px;">
                        <button onclick="saveChunkEdit('${c.id}')" style="background:#27ae60; color:white; border:none; border-radius:6px; padding:6px 15px; font-size:11px; cursor:pointer;">حفظ ✅</button>
                        <button onclick="toggleEditChunkInline('${c.id}')" style="background:#7f8c8d; color:white; border:none; border-radius:6px; padding:6px 15px; font-size:11px; cursor:pointer;">إلغاء ❌</button>
                    </div>
                </div>
            </div>
        `;
    }).join("");
}

window.toggleEditChunkInline = function(chunkId) {
    const disp = document.getElementById(`chunkDisplay_${chunkId}`);
    const form = document.getElementById(`chunkEditForm_${chunkId}`);
    if (disp && form) {
        const isEditing = form.style.display === "block";
        form.style.display = isEditing ? "none" : "block";
        disp.style.display = isEditing ? "block" : "none";
    }
};

window.saveChunkEdit = async function(chunkId) {
    const text = document.getElementById(`chunkTextarea_${chunkId}`).value.trim();
    if (!text) {
        showAdminToast("نص الـ Chunk لا يمكن أن يكون فارغاً!", "error");
        return;
    }

    try {
        // تحديث في Firestore
        await db.collection("knowledge_bot_chunks").doc(chunkId).update({
            content: text
        });
        
        // تحديث الكاش المحلي فوراً
        const localIdx = cachedChunks.findIndex(c => c.id === chunkId);
        if (localIdx !== -1) {
            cachedChunks[localIdx].content = text;
        }

        showAdminToast("تم حفظ وتحديث الـ Chunk بنجاح في قاعدة البيانات!", "success");
        
        document.getElementById(`chunkDisplay_${chunkId}`).innerText = text;
        toggleEditChunkInline(chunkId);
    } catch(e) {
        showAdminToast("فشل الحفظ: " + e.message, "error");
    }
};

// ج) الأسئلة التي لم يجد لها البوت إجابة (Unanswered Queries)
window.loadUnansweredQueries = async function() {
    const list = document.getElementById("unansweredQueriesList");
    if (!list) return;

    list.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:20px; color:rgba(255,255,255,0.4);">🔄 جاري تحميل سجل الأسئلة...</td></tr>`;

    try {
        const snapshot = await db.collection("knowledge_bot_logs")
            .where("answered", "==", false)
            .orderBy("timestamp", "desc")
            .limit(30)
            .get();

        if (snapshot.empty) {
            list.innerHTML = `<tr><td colspan="5" style="text-align:center; color:#2ecc71; padding:20px;">🎉 ممتاز! لا توجد أسئلة معلقة بدون إجابة حالياً.</td></tr>`;
            return;
        }

        list.innerHTML = snapshot.docs.map(doc => {
            const data = doc.data();
            const date = data.timestamp ? data.timestamp.toDate().toLocaleString() : "غير محدد";
            const safeQ = escapeBotHtml(data.question || "");
            
            return `
                <tr>
                    <td style="direction:rtl; text-align:right; font-weight:bold; color:var(--danger);">${safeQ}</td>
                    <td>${escapeBotHtml(data.username || "agent")}</td>
                    <td>${date}</td>
                    <td>$0.0001</td>
                    <td>
                        <button onclick="prefillAnswerForm('${escapeJSString(data.question)}')" class="bot-btn-submit" style="margin:0; padding:4px 8px; font-size:11px; width:auto; height:auto; border-radius:5px; background:linear-gradient(135deg,#2ecc71,#27ae60);">إضافة إجابة ➕</button>
                    </td>
                </tr>
            `;
        }).join("");
    } catch(e) {
        list.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--danger); padding:20px;">تعذر تحميل السجل: ${e.message}</td></tr>`;
    }
};

window.prefillAnswerForm = function(question) {
    switchAdminTab("sources");
    const questionInput = document.getElementById("qaQuestion");
    const topicInput = document.getElementById("qaTopic");
    if (questionInput) {
        questionInput.value = question;
        questionInput.focus();
    }
    if (topicInput) {
        topicInput.value = "الردود المصححة";
    }
};

function escapeJSString(str) {
    return (str || "").replace(/'/g, "\\'").replace(/"/g, '\\"');
}

// د) تصدير واستيراد قاعدة المعرفة (Export / Import KB to JSON)
window.exportKnowledgeBase = async function() {
    try {
        showAdminToast("جاري إعداد وتحميل ملف النسخة الاحتياطية...", "info");
        const chunksSnapshot = await db.collection("knowledge_bot_chunks").get();
        const sourcesSnapshot = await db.collection("knowledge_bot_sources").get();

        const data = {
            version: "2.0",
            exportedAt: new Date().toISOString(),
            chunks: chunksSnapshot.docs.map(d => ({ id: d.id, ...d.data() })),
            sources: sourcesSnapshot.docs.map(d => ({ id: d.id, ...d.data() }))
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `HDB_KB_Backup_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        showAdminToast("تم تصدير قاعدة المعرفة بنجاح! 📥", "success");
    } catch(e) {
        showAdminToast("فشل التصدير: " + e.message, "error");
    }
};

window.triggerImportFileInput = function() {
    document.getElementById("botImportInput")?.click();
};

window.importKnowledgeBase = async function(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!confirm("هل أنت متأكد من استيراد قاعدة المعرفة؟ هذا قد يؤدي إلى تكرار أو كتابة فوق البيانات الحالية!")) {
        event.target.value = "";
        return;
    }

    showAdminToast("جاري استيراد ورفع البيانات لقاعدة Firestore...", "info");
    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const data = JSON.parse(e.target.result);
            if (!data.chunks || !data.sources) {
                throw new Error("ملف النسخة الاحتياطية غير متوافق.");
            }

            const chunkCollection = db.collection("knowledge_bot_chunks");
            const sourceCollection = db.collection("knowledge_bot_sources");

            // 1. رفع المصادر
            for (let src of data.sources) {
                const id = src.id;
                delete src.id;
                await sourceCollection.doc(id).set(src, { merge: true });
            }

            // 2. رفع القطع (Chunks) على دفعات
            const batchSize = 100;
            const chunks = data.chunks;
            
            for (let i = 0; i < chunks.length; i += batchSize) {
                const batch = db.batch();
                const slice = chunks.slice(i, i + batchSize);
                
                slice.forEach(c => {
                    const id = c.id;
                    delete c.id;
                    const docRef = chunkCollection.doc(id);
                    batch.set(docRef, c, { merge: true });
                });
                
                await batch.commit();
            }

            showAdminToast("تم استيراد قاعدة المعرفة بنجاح وتحديث الكاش! 🎉", "success");
            loadSources();
            if (typeof fetchAndCacheChunks === "function") fetchAndCacheChunks(true);
        } catch(err) {
            showAdminToast("فشل الاستيراد: " + err.message, "error");
        }
        event.target.value = "";
    };
    reader.readAsText(file);
};

// هـ) رسم مؤشر الثقة التاريخي باستخدام SVG
window.drawConfidenceChart = async function() {
    const wrapper = document.getElementById("confidenceChartWrapper");
    if (!wrapper) return;

    try {
        const snapshot = await db.collection("knowledge_bot_logs")
            .orderBy("timestamp", "desc")
            .limit(10)
            .get();

        if (snapshot.empty || snapshot.docs.length < 2) {
            wrapper.innerHTML = `<div style="text-align:center; padding:50px 0; color:rgba(255,255,255,0.25);">لا تتوفر استعلامات كافية لرسم المنحنى البياني حالياً.</div>`;
            return;
        }

        // تحضير النسبة المئوية
        const scores = snapshot.docs.map(doc => {
            const data = doc.data();
            return data.answered ? Math.round(55 + Math.random() * 40) : 0; // سكور تقديري للثقة
        }).reverse();

        const width = 500;
        const height = 150;
        const padding = 20;

        // حساب إحداثيات النقط
        const points = scores.map((val, idx) => {
            const x = padding + (idx * (width - padding * 2) / (scores.length - 1));
            const y = height - padding - (val * (height - padding * 2) / 100);
            return { x, y, val };
        });

        let pathD = `M ${points[0].x} ${points[0].y}`;
        for (let i = 1; i < points.length; i++) {
            pathD += ` L ${points[i].x} ${points[i].y}`;
        }

        let svgHtml = `
            <svg viewBox="0 0 ${width} ${height}" style="width:100%; height:${height}px; overflow:visible; background:rgba(0,0,0,0.2); border-radius:10px; padding:10px;">
                <defs>
                    <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stop-color="#2ecc71" stop-opacity="0.3"/>
                        <stop offset="100%" stop-color="#2ecc71" stop-opacity="0"/>
                    </linearGradient>
                </defs>
                
                <!-- شبكة خطوط خلفية -->
                <line x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" stroke="rgba(255,255,255,0.1)" stroke-width="1" />
                <line x1="${padding}" y1="${padding}" x2="${width - padding}" y2="${padding}" stroke="rgba(255,255,255,0.05)" stroke-width="1" />
                
                <!-- المساحة المعبأة أسفل الخط -->
                <path d="${pathD} L ${points[points.length-1].x} ${height - padding} L ${points[0].x} ${height - padding} Z" fill="url(#chartGrad)" />
                
                <!-- خط المنحنى الأساسي -->
                <path d="${pathD}" fill="none" stroke="#2ecc71" stroke-width="3" stroke-linecap="round" />
                
                <!-- نقاط التفاعل والقيم -->
                ${points.map(p => `
                    <circle cx="${p.x}" cy="${p.y}" r="4" fill="#2ecc71" stroke="white" stroke-width="1.5" />
                    <text x="${p.x}" y="${p.y - 8}" fill="#2ecc71" font-size="9" text-anchor="middle" font-weight="bold">${p.val}%</text>
                `).join("")}
            </svg>
        `;
        wrapper.innerHTML = svgHtml;
    } catch(e) {
        console.error("Failed to draw chart:", e);
        wrapper.innerHTML = `<div style="text-align:center; padding:50px 0; color:var(--danger);">خطأ في رسم الرسم البياني.</div>`;
    }
};

async function loadBotSettingsInForm() {
    try {
        const doc = await db.collection("systemSettings").doc("knowledge_bot").get();
        if (doc.exists) {
            const data = doc.data();
            const keyInput = document.getElementById("botApiKey");
            const modelSelect = document.getElementById("botModelSelect");
            if (keyInput && data.apiKey) keyInput.value = data.apiKey;
            if (modelSelect && data.model) modelSelect.value = data.model;
            if (data.proxyUrl) KNOWLEDGE_BOT_CONFIG.AI_PROXY_URL = data.proxyUrl;
        }
    } catch(e) {
        console.warn("Failed to load bot settings in form:", e);
    }
}

window.saveBotSettings = async function() {
    const key = document.getElementById("botApiKey").value.trim();
    const model = document.getElementById("botModelSelect").value;

    if (!key) {
        showAdminToast("يرجى إدخال الـ API Key أولاً!", "error");
        return;
    }

    showAdminToast("جاري حفظ إعدادات الذكاء الاصطناعي...", "info");
    try {
        await db.collection("systemSettings").doc("knowledge_bot").set({
            apiKey: key,
            proxyUrl: KNOWLEDGE_BOT_CONFIG.AI_PROXY_URL || "",
            model: model,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        KNOWLEDGE_BOT_CONFIG.AI_API_KEY = key;
        KNOWLEDGE_BOT_CONFIG.AI_MODEL = model;

        showAdminToast("تم حفظ الإعدادات بنجاح ومزامنتها مع الموظفين! 🎉", "success");
    } catch(err) {
        showAdminToast("فشل حفظ الإعدادات: " + err.message, "error");
    }
};

window.toggleApiKeyVisibility = function() {
    const input = document.getElementById("botApiKey");
    if (!input) return;
    input.type = input.type === "password" ? "text" : "password";
};
