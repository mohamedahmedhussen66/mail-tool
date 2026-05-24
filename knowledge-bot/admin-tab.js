// 🛠️ شاشة التحكم بتاعة البوت للأدمن.. هنا بنرفع الملفات وبنقطعها ونعرض الإحصائيات وكل الشغل العالي ده.

if (typeof pdfjsLib !== "undefined") {
    // هنا بنقول لمكتبة الـ PDF.js تروح تجيب الملف المساعد بتاعها (الـ Worker) عشان متتقلش صفحة المتصفح والموظف شغال
    pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js";
}

document.addEventListener("DOMContentLoaded", function () {
    // لو البوت مقفول من الفيوزات (bot-config.js).. مش هنعمل أي حاجة خالص ولا هنظهر الشاشة للأدمن
    if (!KNOWLEDGE_BOT_CONFIG.ENABLED) return;

    // بنحط كود الـ HTML بتاع لوحة التحكم في الحاوية بتاعتها
    injectAdminTabHtml();

    // بنفعل الحركات بتاعة شد الملفات ورميها (Drag & Drop) والفورم اليدوي
    setupAdminTabEventListeners();
});

// 1. دالة بناء كود الـ HTML وعرض شاشة الأدمن
function injectAdminTabHtml() {
    const viewBotSection = document.getElementById("view-bot");
    if (!viewBotSection) return;

    viewBotSection.innerHTML = `
        <div class="bot-admin-container">
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
                </div>

                <!-- العمود اليمين: عرض الملفات المرفوعة وإحصائيات البوت -->
                <div class="bot-admin-col-right">
                    <div class="glass-card bot-card">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; border-bottom: 1px dashed rgba(255,255,255,0.1); padding-bottom:10px;">
                            <h3 class="bot-card-title" style="margin:0;">📂 مصادر المعرفة الحالية</h3>
                            <button onclick="refreshBotCacheBtn()" class="bot-btn-submit" style="margin:0; padding:6px 12px; font-size:11px; width:auto; height:auto; background:linear-gradient(135deg,#2980b9,#3498db); border-radius:6px; cursor:pointer;">🔄 تحديث الذاكرة</button>
                        </div>
                        <div class="bot-table-container">
                            <table class="bot-sources-table">
                                <thead>
                                    <tr>
                                        <th>اسم المصدر</th>
                                        <th>النوع</th>
                                        <th>عدد القطع</th>
                                        <th>الحالة</th>
                                        <th>تحكم</th>
                                    </tr>
                                </thead>
                                <tbody id="botSourcesList">
                                    <tr>
                                        <td colspan="5" style="text-align:center; color:var(--text-muted);">بنجيبلك الداتا.. لحظة واحدة يا بطل</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div class="glass-card bot-card" style="margin-top: 20px;">
                        <h3 class="bot-card-title">📊 مراقبة أداء وأسئلة البوت</h3>
                        <div class="bot-stats-grid">
                            <div class="bot-stat-item">
                                <span class="bot-stat-val" id="statTotalQueries">0</span>
                                <span class="bot-stat-lbl">إجمالي الأسئلة</span>
                            </div>
                            <div class="bot-stat-item">
                                <span class="bot-stat-val" id="statAnswerRate">0%</span>
                                <span class="bot-stat-lbl">نسبة الإجابة</span>
                            </div>
                            <div class="bot-stat-item">
                                <span class="bot-stat-val" id="statTokens">0k</span>
                                <span class="bot-stat-lbl">توكنز مستهلكة</span>
                            </div>
                        </div>
                        
                        <h4 style="margin-top:20px; font-size:13px; color:var(--primary); border-bottom: 1px dashed rgba(255,255,255,0.1); padding-bottom:5px;">📜 آخر أسئلة سألوها الـ Agents</h4>
                        <div class="bot-logs-list" id="botLogsList">
                            <span style="color:var(--text-muted); font-size:12px;">مفيش حد سأل البوت لسة.. مستنيين أول سؤال!</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// 2. دالة ربط المستمعين للأحداث (الأزرار والشد والإفلات)
function setupAdminTabEventListeners() {
    const dropArea = document.getElementById("botDragDropArea");
    const fileInput = document.getElementById("botFileInput");
    const qaForm = document.getElementById("botManualQaForm");

    if (dropArea && fileInput) {
        dropArea.addEventListener("click", () => fileInput.click()); // تفتح نافذة اختيار الملف علطول
        
        dropArea.addEventListener("dragover", (e) => {
            e.preventDefault();
            dropArea.classList.add("dragover"); // شكل منور وجميل لما تشد الملف فوق الصندوق
        });

        dropArea.addEventListener("dragleave", () => {
            dropArea.classList.remove("dragover");
        });

        dropArea.addEventListener("drop", (e) => {
            e.preventDefault();
            dropArea.classList.remove("dragover");
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                handleUploadedFile(files[0]); // شغل معالجة الملف علطول
            }
        });

        fileInput.addEventListener("change", (e) => {
            if (fileInput.files.length > 0) {
                handleUploadedFile(fileInput.files[0]);
                fileInput.value = ""; // نصفر المدخل عشان يشتغل تاني لو غيرنا الملف
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
            qaForm.reset(); // نفضي الفورم بعد الإضافة بنجاح
        });
    }
}



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
        const author = (currentUser && currentUser.username) ? currentUser.username : "Admin";
        
        // بنسجل اسم الملف في الفايربيز وتجهيز حالته كـ "تحت المعالجة"
        const sourceDoc = await db.collection("knowledge_bot_sources").add({
            name: name,
            type: extension === "pdf" ? "pdf" : "excel",
            uploadedAt: firebase.firestore.FieldValue.serverTimestamp(),
            uploadedBy: author,
            status: "Processing",
            chunkCount: 0
        });

        // بنشوف لو ملف PDF ولا إكسيل ونوجهه للمستخرج الخاص بيه
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

// 5. استخراج نصوص PDF محلياً
async function processPDFLocal(file, name, sourceId) {
    const reader = new FileReader();
    reader.onload = async function (e) {
        try {
            const typedarray = new Uint8Array(e.target.result);
            
            if (typeof pdfjsLib === "undefined") {
                throw new Error("مكتبة قراءة الـ PDF مش شغالة أو متحملتش.. يرجى التحقق من النت.");
            }
            
            const pdf = await pdfjsLib.getDocument(typedarray).promise;
            const chunks = [];

            // بنلف على صفحة صفحة ونقرا الكلام اللي جواها
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();
                const text = textContent.items.map(item => item.str).join(" ");

                if (text.trim() === "") continue; // صفحة بيضاء.. عديها علطول

                // بنقطع نصوص الصفحة لقطع متداخلة طولها 500 حرف عشان تناسب سياق الذكاء الاصطناعي
                const pageChunks = splitTextIntoChunks(text, 500, 100);
                pageChunks.forEach((cText, idx) => {
                    chunks.push({
                        sourceId: sourceId,
                        sourceName: name,
                        type: "pdf",
                        content: cText,
                        pageNumber: i,
                        chunkIndex: idx
                    });
                });
            }

            if (chunks.length === 0) {
                throw new Error("ملقناش أي نصوص مكتوبة جوا ملف الـ PDF ده عشان نسجلها.");
            }

            // بنحفظ الداتا في الفايربيز على دفعات سريعة
            await saveChunksToDb(chunks);
            // بنعلم على الملف في القائمة إنه "جاهز" ونعرض عدد القطع
            await updateSourceStatus(sourceId, "Ready", chunks.length);
            showAdminToast(`تم تفكيك الـ PDF لـ ${chunks.length} جزء وحفظه في الذاكرة بنجاح!`, "success");
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

// 6. استخراج جداول Excel محلياً - كل صف بيتحول لقطعة ذكية مستقلة مع اسم العمود كسياق
async function processExcelLocal(file, name, sourceId) {
    const reader = new FileReader();
    reader.onload = async function (e) {
        try {
            const data = new Uint8Array(e.target.result);

            if (typeof XLSX === "undefined") {
                throw new Error("مكتبة قراءة الـ Excel مش متحملة.. اتأكد من توفر المكتبة.");
            }

            const workbook = XLSX.read(data, { type: "array" });
            const chunks = [];

            workbook.SheetNames.forEach(sheetName => {
                const sheet = workbook.Sheets[sheetName];

                // بنجيب الداتا كـ JSON عشان نعرف أسماء العواميد ديناميكياً
                const rows = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });

                if (rows.length === 0) {
                    // لو مفيش صفوف، بنجرب CSV كاحتياط
                    const csvText = XLSX.utils.sheet_to_csv(sheet);
                    if (csvText.trim() !== "") {
                        const textChunks = splitTextIntoChunks(csvText, 600, 100);
                        textChunks.forEach((cText, idx) => {
                            chunks.push({
                                sourceId, sourceName: name, type: "excel",
                                content: `شيت: ${sheetName}\n${cText}`,
                                sheetName, rowNumber: idx + 1
                            });
                        });
                    }
                    return;
                }

                // بنشوف لو في عواميد اسمها سؤال/إجابة عشان نعاملها بشكل خاص
                const headers = Object.keys(rows[0]);
                const qCols = headers.filter(h => /سؤال|سوال|question|q\b/i.test(h));
                const aCols = headers.filter(h => /إجابة|جواب|اجابه|answer|a\b|response/i.test(h));
                const isQA = qCols.length > 0 && aCols.length > 0;

                rows.forEach((row, rowIdx) => {
                    // تجاهل الصفوف الفاضية
                    const vals = Object.values(row).map(v => String(v).trim());
                    if (vals.every(v => v === "")) return;

                    let content = "";

                    if (isQA) {
                        const q = qCols.map(c => row[c]).filter(Boolean).join(" ").trim();
                        const a = aCols.map(c => row[c]).filter(Boolean).join(" ").trim();
                        if (!q && !a) return;
                        content = `سؤال: ${q}\nإجابة: ${a}`;
                        // نضيف باقي العواميد كسياق إضافي
                        const extras = headers
                            .filter(h => !qCols.includes(h) && !aCols.includes(h))
                            .map(h => `${h}: ${String(row[h]).trim()}`)
                            .filter(s => !s.endsWith(": "))
                            .join(" | ");
                        if (extras) content += `\nبيانات إضافية: ${extras}`;
                    } else {
                        // كل عمود بيبقى سطر "اسم العمود: القيمة"
                        const lines = headers
                            .map(h => {
                                const val = String(row[h] || "").trim();
                                return val ? `${h}: ${val}` : null;
                            })
                            .filter(Boolean);
                        if (lines.length === 0) return;
                        content = `شيت: ${sheetName} | صف: ${rowIdx + 2}\n${lines.join("\n")}`;
                    }

                    if (content.trim().length < 5) return;

                    // لو محتوى الصف طويل جداً نقسمه
                    if (content.length > 800) {
                        splitTextIntoChunks(content, 600, 80).forEach((sc, idx) => {
                            chunks.push({ sourceId, sourceName: name, type: "excel", content: sc, sheetName, rowNumber: rowIdx + 2, chunkIndex: idx });
                        });
                    } else {
                        chunks.push({ sourceId, sourceName: name, type: "excel", content, sheetName, rowNumber: rowIdx + 2 });
                    }
                });
            });

            if (chunks.length === 0) {
                throw new Error("ملف الإكسل فاضي أو ملقناش فيه نصوص قابلة للقراءة.");
            }

            await saveChunksToDb(chunks);
            await updateSourceStatus(sourceId, "Ready", chunks.length);
            showAdminToast(`✅ تم تحليل وحفظ الـ Excel بنجاح! ${chunks.length} قطعة معلومات جاهزة للبحث.`, "success");
            loadSources();
            if (typeof fetchAndCacheChunks === "function") fetchAndCacheChunks(true);

        } catch (err) {
            console.error("خطأ قراءة الـ Excel:", err);
            await updateSourceStatus(sourceId, "Failed", 0);
            showAdminToast("فشلت قراءة ملف الـ Excel: " + err.message, "error");
            loadSources();
        }
    };
    reader.readAsArrayBuffer(file);
}

// 7. معالجة وحفظ السؤال والجواب اليدوي
async function handleManualQaSubmit(topic, question, answer) {
    showAdminToast("جاري حفظ سؤالك اليدوي...", "info");
    try {
        const author = (currentUser && currentUser.username) ? currentUser.username : "Admin";
        
        // بندور لو فيه ملف مجمع للمدخلات اليدوية اتعمل قبل كده عشان نحط السؤال جواه وميعملش ملفات كتير
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

        // بنسجل السؤال والجواب كحلقة تابعة للمصدر اليدوي
        await db.collection("knowledge_bot_chunks").add({
            sourceId: sourceId,
            sourceName: "Manual Q&A Entries",
            type: "qa_manual",
            content: `الموضوع: ${topic}\nالسؤال: ${question}\nالإجابة: ${answer}`,
            topic: topic,
            question: question,
            answer: answer
        });

        // بنزود العداد بتاع الأسئلة اليدوية المرفوعة
        await updateSourceStatus(sourceId, "Ready", currentCount + 1);
        
        showAdminToast("تم حفظ السؤال والجواب في قاعدة بيانات البوت بنجاح!", "success");
        loadSources();
        if (typeof fetchAndCacheChunks === "function") fetchAndCacheChunks(true);
        
    } catch (err) {
        console.error("فشل حفظ السؤال والجواب اليدوي:", err);
        showAdminToast("فشل الحفظ: " + err.message, "error");
    }
}

// دالة تقطيع الكلام لفقرات متناسقة متداخلة مع بعضها
function splitTextIntoChunks(text, size = 500, overlap = 100) {
    const chunks = [];
    let i = 0;
    while (i < text.length) {
        let end = i + size;
        if (end < text.length) {
            // بنحاول نقطع من المسافة عشان مقطعش الكلمة نصين
            const lastSpace = text.lastIndexOf(" ", end);
            if (lastSpace > i + size - 100) {
                end = lastSpace;
            }
        }
        chunks.push(text.substring(i, end).trim());
        i = end - overlap;
        if (i < 0) i = 0;
        if (end >= text.length) break;
    }
    return chunks.filter(c => c.length > 8);
}

// دالة الحفظ بالدفعات لـ Firestore (بحد أقصى 400 عملية حفظ لكل باتش عشان الحد الأقصى لجوجل)
async function saveChunksToDb(chunks) {
    const chunkCollection = db.collection("knowledge_bot_chunks");
    const batchSize = 400;
    
    for (let i = 0; i < chunks.length; i += batchSize) {
        const batch = db.batch();
        const batchSlice = chunks.slice(i, i + batchSize);
        
        batchSlice.forEach(chunk => {
            const docRef = chunkCollection.doc();
            batch.set(docRef, chunk);
        });
        
        await batch.commit();
    }
}

// دالة تحديث حالة مصدر المعرفة
async function updateSourceStatus(sourceId, status, chunkCount) {
    await db.collection("knowledge_bot_sources").doc(sourceId).update({
        status: status,
        chunkCount: chunkCount
    });
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
                    <td colspan="5" style="text-align:center; color:var(--text-muted); padding: 15px;">مفيش أي مصادر معرفة مرفوعة لغاية دلوقتي.. ضيفلك كام ملف فوق يا بطل!</td>
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

            return `
                <tr>
                    <td class="bot-td-name" title="${s.name || ''}">${s.name || "بدون اسم"}</td>
                    <td>${displayType}</td>
                    <td>${s.chunkCount || 0} حتة</td>
                    <td><span class="${badgeClass}">${s.status === 'Ready' ? 'جاهز' : s.status === 'Processing' ? 'جاري المعالجة' : 'فشل'}</span></td>
                    <td>
                        <button class="bot-action-btn-del" onclick="deleteKnowledgeSource('${id}')">🗑️ احذف</button>
                    </td>
                </tr>
            `;
        }).join("");

    } catch (err) {
        console.error("فشل جلب مصادر المعرفة:", err);
        container.innerHTML = `
            <tr>
                <td colspan="5" style="text-align:center; color:var(--danger);">حصل مشكلة واحنا بنحمل ملفات المعرفة.</td>
            </tr>
        `;
    }
}

// دالة مسح وحذف المصدر والقطع التابعة له بالكامل من الفايربيز
window.deleteKnowledgeSource = async function (sourceId) {
    if (!confirm("هل أنت متأكد تماماً إنك عاوز تحذف الملف ده وكل الحتت اللي استخرجناها منه؟ الخطوة دي ملهاش رجعة!")) return;

    showAdminToast("جاري حذف الملف وجميع الأجزاء التابعة له...", "info");
    try {
        // نمسح السجل الرئيسي للملف
        await db.collection("knowledge_bot_sources").doc(sourceId).delete();

        // نجيب كل الحتت التابعة للملف ده عشان نمسحها هي كمان
        const chunksSnapshot = await db.collection("knowledge_bot_chunks")
            .where("sourceId", "==", sourceId)
            .get();

        const docs = chunksSnapshot.docs;
        const batchSize = 400;

        // نمسحهم على دفعات
        for (let i = 0; i < docs.length; i += batchSize) {
            const batch = db.batch();
            const slice = docs.slice(i, i + batchSize);
            slice.forEach(doc => {
                batch.delete(doc.ref);
            });
            await batch.commit();
        }

        showAdminToast("تم حذف ملف المعرفة وكل محتوياته بالكامل.", "success");
        loadSources();
        
        // نحدث كاش البحث
        if (typeof fetchAndCacheChunks === "function") {
            fetchAndCacheChunks(true);
        }

    } catch (err) {
        console.error("فشل حذف مصدر المعرفة:", err);
        showAdminToast("حذف الملف فشل: " + err.message, "error");
    }
};

window.refreshBotCacheBtn = async function() {
    showAdminToast("جاري مزامنة وتحديث ذاكرة البحث التلقائية...", "info");
    try {
        if (typeof fetchAndCacheChunks === "function") {
            await fetchAndCacheChunks(true);
            showAdminToast("تم تحديث ذاكرة البحث والكاش بنجاح!", "success");
        } else {
            showAdminToast("تعذر الوصول لمحرك البوت لتحديث الكاش.", "error");
        }
    } catch(err) {
        showAdminToast("فشل تحديث الكاش: " + err.message, "error");
    }
};

// 9. تحميل إحصائيات الاستخدام والأسئلة الأخيرة
async function loadStats() {
    const totalEl = document.getElementById("statTotalQueries");
    const rateEl = document.getElementById("statAnswerRate");
    const tokensEl = document.getElementById("statTokens");
    const logsList = document.getElementById("botLogsList");

    if (!totalEl || !rateEl || !tokensEl || !logsList) return;

    try {
        const snapshot = await db.collection("knowledge_bot_logs")
            .orderBy("timestamp", "desc")
            .limit(100)
            .get();

        if (snapshot.empty) {
            totalEl.innerText = "0";
            rateEl.innerText = "100%";
            tokensEl.innerText = "0k";
            logsList.innerHTML = `<span style="color:var(--text-muted); font-size:12px;">مفيش أي أسئلة اتسجلت لغاية دلوقتي.</span>`;
            return;
        }

        const logs = snapshot.docs.map(d => d.data());
        const total = logs.length;
        const answered = logs.filter(l => l.answered === true).length;
        const answerRate = Math.round((answered / total) * 100);
        
        let totalTokens = 0;
        logs.forEach(l => {
            totalTokens += l.tokensEstimated || 0;
        });

        totalEl.innerText = total;
        rateEl.innerText = answerRate + "%";
        tokensEl.innerText = (totalTokens / 1000).toFixed(1) + "k";

        // بنعرض آخر 5 عمليات شات اتسألت للبوت
        const recentLogs = logs.slice(0, 5);
        logsList.innerHTML = recentLogs.map(log => {
            const date = log.timestamp ? log.timestamp.toDate().toLocaleTimeString() : "دلوقتي حالا";
            const answerClass = log.answered ? "log-lbl-answered" : "log-lbl-fallback";
            
            return `
                <div class="bot-log-row">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <span class="bot-log-user">👤 العميل: ${log.username || "agent"}</span>
                        <span class="bot-log-time">${date}</span>
                    </div>
                    <p class="bot-log-q" style="direction:rtl; text-align:right;">السؤال: ${log.question || ""}</p>
                    <span class="${answerClass}">${log.answered ? "لقي إجابة معتمدة" : "ملاقااش إجابة"}</span>
                </div>
            `;
        }).join("");

    } catch (err) {
        console.error("فشل جلب إحصائيات البوت:", err);
    }
}

// دالة عرض رسائل التنبيه والنجاح
function showAdminToast(msg, type = "success") {
    if (typeof showDashToast === "function") {
        showDashToast(msg, type);
        return;
    }
    alert(`${type === 'success' ? '✅' : '❌'} ${msg}`);
}
