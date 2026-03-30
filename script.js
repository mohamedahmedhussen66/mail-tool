// 1. Firebase Config
const firebaseConfig = {
    apiKey: "AIzaSyDF8ArlHre-rdPyWsAX0PjJJ7JBY3sK2qM",
    authDomain: "mail-tool-f613a.firebaseapp.com",
    projectId: "mail-tool-f613a",
    storageBucket: "mail-tool-f613a.firebasestorage.app",
    messagingSenderId: "474574402711",
    appId: "1:474574402711:web:28238754c7a90b9bdae5d2"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

let allMails = []; 
let showingTrash = false;
// 2. ابحث عن الرادار المسؤول عن الجدول وعدله ليكون كدا:
// 1. الرادار بياخد نسخة من البيانات بس
db.collection("mails").orderBy("createdAt", "desc").onSnapshot((snapshot) => {
    const today = new Date().toISOString().split('T')[0];
    allMails = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
               .filter(m => !m.expiryDate || m.expiryDate >= today); // بيخفي المنتهي فوراً
    refreshDisplay();
});

// 2. دالة الفلترة والترتيب (دي المسؤولة عن السرعة)
function refreshDisplay() {
    let displayData = allMails.filter(m => showingTrash ? m.isDeleted : !m.isDeleted);
    if (!showingTrash) {
        displayData.sort((a, b) => (b.isPinned || false) - (a.isPinned || false));
    }
    renderTable(displayData);
}

// 3. عرض الجدول
function renderTable(data) {
    const tbody = document.getElementById("tableBody");
    tbody.innerHTML = ""; // تنظيف الجدول قبل الرسم

    data.forEach((m) => {
        let row = document.createElement("tr");
        row.style.userSelect = "none"; // منع التظليل المزعج
        
        if (m.isPinned && !showingTrash) {
            row.style.background = "rgba(46, 125, 50, 0.05)";
        }

        const colors = { "Urgent": "#e74c3c", "New Policy": "#27ae60", "Update": "#3498db", "General": "#95a5a6" };
        const badgeColor = colors[m.category] || "#95a5a6";

        // --- هنا مكان الـ row.innerHTML بالظبط ---
        row.innerHTML = `
            <td style="white-space: nowrap; width: 160px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <div style="width: 35px; display: flex; gap: 2px; justify-content: center;">
                        <span style="color:#f1c40f; font-size: 14px;">${m.isFav ? '★' : ''}</span>
                        <span style="font-size: 14px;">${m.isPinned ? '📌' : ''}</span>
                    </div>
                    
                    <span style="font-weight: bold; color: #2e7d32; min-width: 65px;">${m.code}</span>
                    
                    <span style="background:${badgeColor}; color:white; padding:2px 6px; border-radius:4px; font-size:9px; font-weight:bold;">
                        ${m.category || 'General'}
                    </span>
                </div>
            </td>
            
            <td style="font-weight: 500;">${m.topic}</td>
            <td>${m.idea || '---'}</td>
            <td>${m.sender}</td>
        `;
        // --- نهاية الـ row.innerHTML ---

        // أكشن الدبل كليك (إظهار أزرار التحكم)
        row.ondblclick = (e) => {
            e.preventDefault();
            showMailActions(e, m);
        };

        // أكشن الضغطة الواحدة (عرض المحتوى وتنبيه الـ Glow)
        row.onclick = () => {
            const glowClass = m.category === "Urgent" ? "alert-glow" : "";
            
            document.getElementById("mailBox").innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #eee; padding-bottom: 10px; margin-bottom: 15px;">
                    <div>
                        <b style="color:#2e7d32; font-size: 18px;">${m.sender}</b>
                        <div style="margin-top: 5px; color: #666; font-size: 14px;"><b>Subject:</b> ${m.topic}</div>
                    </div>
                    
<div class="${glowClass}" style="background: ${badgeColor}; padding: 5px 15px; border-radius: 5px; color: white; font-weight: bold; font-size: 12px;">
                        ${m.category || 'General'}
                    </div>
                </div>
                <div style="line-height: 1.8; font-size: 15px; color: #333; white-space: pre-wrap; padding: 10px;">${m.content}</div>
            `;
            
            document.querySelectorAll("tr").forEach(r => r.classList.remove("selected"));
            row.classList.add("selected");
        };

        tbody.appendChild(row);

        // سطر المعاينة الرمادي (Preview)
        let previewRow = document.createElement("tr");
        previewRow.className = "preview";
        let contentClean = m.content ? m.content.replace(/<[^>]*>/g, '') : "";
        previewRow.innerHTML = `<td colspan="4" style="text-align:left; color:#888; font-size:11px; padding-left:45px; opacity:0.7;">📄 ${contentClean.substring(0, 80)}...</td>`;
        tbody.appendChild(previewRow);
    });
}






// 5. وظائف Firebase (English Toasts)
async function toggleFav(id) {
    const mail = allMails.find(m => m.id === id);
    const newState = !mail.isFav;
    showToast(newState ? "Added to Favorites" : "Removed from Favorites"); // التنبيه يظهر فوراً
    await db.collection("mails").doc(id).update({ isFav: newState });
}

async function pinMail(id) {
    const mail = allMails.find(m => m.id === id);
    const newState = !mail.isPinned;
    showToast(newState ? "Pinned to Top" : "Unpinned"); // التنبيه يظهر فوراً
    await db.collection("mails").doc(id).update({ isPinned: newState });
}



async function addNewEntry() {
    // 1. سحب البيانات من الخانات (شيلنا سحب الـ code القديم)
    const topic = document.getElementById('addTopic').value;
    const idea = document.getElementById('addIdea').value;
    const sender = document.getElementById('addSender').value;
    const content = document.getElementById('addContent').value;
    const category = document.getElementById('addCategory').value;
    const expiry = document.getElementById('expiryDate').value;

    // 2. توليد الكود الذكي أوتوماتيكياً (Mar-01)
    const now = new Date();
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const monthStr = monthNames[now.getMonth()]; // بيجيب أول 3 حروف من الشهر الحالي
    
    // بيشوف فيه كام ميل متسجل في الشهر ده عشان يديله الرقم اللي عليه الدور
    const currentMonthCount = allMails.filter(m => m.code && m.code.startsWith(monthStr)).length + 1;
    const autoCode = `${monthStr}-${currentMonthCount.toString().padStart(2, '0')}`;

    // 3. التحقق من البيانات الأساسية
    if(!topic || !content) return showToast("برجاء إدخال الموضوع والمحتوى ⚠️", "error");

    try {
        // 4. الحفظ في Firebase
        await db.collection("mails").add({
            code: autoCode, // استخدام الكود المولد تلقائياً
            topic, 
            idea, 
            sender, 
            content, 
            category: category, 
            expiryDate: expiry || null,
            isDeleted: false, 
            isPinned: false, 
            isFav: false,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // 5. إنهاء العملية وتنظيف اللوحة
        document.getElementById('adminPanel').style.display = 'none';
        showToast(`تم الحفظ بنجاح كود: ${autoCode} ✅`);
        
        // تنظيف الخانات (Inputs)
        document.querySelectorAll('#adminPanel input, #adminPanel textarea').forEach(i => i.value = "");
        // إعادة الـ Select للحالة الافتراضية
        document.getElementById('addCategory').value = "General";
    } catch (e) { 
        console.error(e);
        showToast("Error adding entry", "error"); 
    }
}

// 6. نظام التنبيهات (Top-Center Popup)
// 1. نظام التنبيهات المطور (فوري وزجاجي)
function showToast(message, type = "success") {
    let container = document.getElementById("toast-container") || Object.assign(document.createElement("div"), {id: "toast-container"});
    if (!container.parentElement) document.body.appendChild(container);

    const toast = document.createElement("div");
    toast.className = `toast-card ${type}`;
    
    let icon = "✨"; 
    if (message.toLowerCase().includes("favorite")) icon = "⭐";
    if (message.toLowerCase().includes("pinned")) icon = "📌";
    if (message.toLowerCase().includes("trash")) icon = "🗑️";
    if (type === "error") icon = "⚠️";

    toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
    container.prepend(toast);

    setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transform = "translateY(-15px) scale(0.95)";
        toast.style.transition = "0.3s ease";
        setTimeout(() => toast.remove(), 300);
    }, 2200);
}



// 7. الاختصارات والبحث والـ Dark Mode
document.addEventListener("DOMContentLoaded", function() {
    let secretStep = 0;
    document.addEventListener("keydown", function(e) {
        if (e.ctrlKey && e.altKey) {
            if (e.key.toLowerCase() === "m") secretStep = 1;
            else if (secretStep === 1 && e.key.toLowerCase() === "o") {
                document.getElementById("secretLogin").style.display = "flex";
                document.getElementById("adminPass").focus();
                secretStep = 0;
            }
        } else { secretStep = 0; }
    });

    document.getElementById("adminPass").addEventListener("keydown", function(e) {
        if (e.key === "Enter") {
            let reversed = this.value.trim().split("").reverse().join("");
            if (reversed === "62021132") {
                document.getElementById("secretLogin").style.display = "none";
                document.getElementById("adminPanel").style.display = "flex";
                this.value = "";
            } else {
                this.value = "";
                this.placeholder = "❌ Wrong Key";
            }
        }
    });
});

function search(val) {
    const term = val.toLowerCase();
    
    // 1. تحديد المجموعة اللي بنبحث فيها (الوارد ولا السلة)
    const currentViewMails = allMails.filter(m => showingTrash ? m.isDeleted : !m.isDeleted);
    
    // 2. الفلترة الذكية (ضفنا البحث بالقسم Category)
    const filtered = currentViewMails.filter(m => {
        // التأكد إن كل بيان موجود قبل ما نحوله لـ LowerCase عشان ميعملش Error
        const code = (m.code || "").toLowerCase();
        const topic = (m.topic || "").toLowerCase();
        const sender = (m.sender || "").toLowerCase();
        const category = (m.category || "").toLowerCase();

        return code.includes(term) || 
               topic.includes(term) || 
               sender.includes(term) || 
               category.includes(term); // السطر الجديد للبحث بالأقسام
    });

    // 3. تحديث الجدول بالنتائج الجديدة
    renderTable(filtered);
}

function closeAdminPanel() { document.getElementById('adminPanel').style.display = 'none'; }
function toggleDarkMode() {
    document.body.classList.toggle('dark-mode');
    localStorage.setItem('darkMode', document.body.classList.contains('dark-mode'));
}
// دالة إظهار بوب آب الحذف المودرن
function askDeleteMail(id) {
    // حذف أي نسخة قديمة موجودة عشان ميتكررش
    const oldModal = document.getElementById('custom-confirm-modal');
    if (oldModal) oldModal.remove();

    const modal = document.createElement('div');
    modal.id = 'custom-confirm-modal';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-icon">⚠️</div>
            <h3 style="margin:0 0 10px; color:#333; font-family:sans-serif;">Are you sure?</h3>
            <p style="color:#666; font-family:sans-serif;">This item will be moved to trash.</p>
            <div class="modal-buttons">
                <button class="cancel-btn" onclick="closeConfirmModal()">Cancel</button>
                <button class="confirm-btn" onclick="executeDelete('${id}')">Yes, Delete</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function closeConfirmModal() {
    const modal = document.getElementById('custom-confirm-modal');
    if (modal) modal.remove();
}

async function executeDelete(id) {
    closeConfirmModal(); // إغفاء النافذة فوراً لسرعة الاستجابة
    document.querySelectorAll('.actions-container-row').forEach(el => el.remove()); // إخفاء الأزرار فوراً
    showToast("Mail moved to trash"); // التنبيه يظهر في جزء من الثانية
    await db.collection("mails").doc(id).update({ isDeleted: true }); // الحذف يتم في الخلفية بدون تعطيل اليوزر
}
function showMailActions(event, mail) {
    const currentRow = event.currentTarget;
    const previewRow = currentRow.nextElementSibling;
    
    let existingActions = previewRow ? previewRow.nextElementSibling : null;
    if (existingActions && existingActions.classList.contains('actions-container-row')) {
        existingActions.remove();
        return; 
    }

    document.querySelectorAll('.actions-container-row').forEach(el => el.remove());

    const actionsWrapper = document.createElement('tr');
    actionsWrapper.className = 'actions-container-row';

    let buttonsHTML = '';
    
    if (showingTrash) {
        buttonsHTML = `
            <div class="actions-flex-wrapper">
                <div class="btn-restore-style" onclick="restoreMail('${mail.id}')" title="Restore"><span>🔄</span></div>
            </div>
        `;
    } else {
        // الترتيب النهائي: سلة ثم دبوس ثم نجمة
        buttonsHTML = `
            <div class="actions-flex-wrapper">
                <div class="action-btn btn-delete" onclick="askDeleteMail('${mail.id}')"><span>🗑️</span></div>
                <div class="action-btn btn-pin ${mail.isPinned ? 'active' : ''}" onclick="pinMail('${mail.id}')"><span>📌</span></div>
                <div class="action-btn btn-fav ${mail.isFav ? 'active' : ''}" onclick="toggleFav('${mail.id}')"><span>★</span></div>
            </div>
        `;
    }

    actionsWrapper.innerHTML = `<td colspan="4" style="padding:0; border:none; text-align:right;">${buttonsHTML}</td>`;
    if (previewRow) previewRow.after(actionsWrapper);
}
function toggleTrashView() {
    showingTrash = !showingTrash; 
    
    const btn = document.getElementById("trashBtn");
    if(btn) {
        btn.innerHTML = showingTrash ? "🔙 Back to Inbox" : "🗑️ View Deleted Mails";
        btn.style.background = showingTrash ? "#2e7d32" : "#e74c3c";
    }

    // تنظيف أي أكشن بار مفتوح عشان ميعملش "بج" في العرض الجديد
    document.querySelectorAll('.actions-container-row').forEach(el => el.remove());

    // تحديث البيانات فوراً من المخزن اللي عندنا
    const dataToRender = allMails.filter(m => showingTrash ? m.isDeleted : !m.isDeleted);
    
    // ترتيب الدبوس لو راجعين للوارد
    if (!showingTrash) {
        dataToRender.sort((a, b) => (b.isPinned || false) - (a.isPinned || false));
    }
    
    renderTable(dataToRender);
}
async function restoreMail(id) {
    try {
        await db.collection("mails").doc(id).update({ isDeleted: false });
        showToast("Restored to Inbox ✨");
        
        // إخفاء الأكشن بار فوراً عشان الشكل يبان بروفيشنال
        document.querySelectorAll('.actions-container-row').forEach(el => el.remove());
        
    } catch (e) {
        showToast("Error during restore", "error");
    }
}
// نظام المعاينة الفورية للأدمن
function setupLivePreview() {
    const inputs = ['addCode', 'addTopic', 'addSender', 'addContent'];
    
    inputs.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('input', () => {
                // تحديث النصوص في المعاينة
                if (id === 'addCode') document.getElementById('preCode').innerText = '#' + element.value;
                if (id === 'addTopic') document.getElementById('preTopic').innerText = element.value || 'Topic Sample';
                if (id === 'addSender') document.getElementById('preSender').innerText = element.value || '---';
                if (id === 'addContent') {
                    document.getElementById('preContent').innerText = element.value || 'Content will appear here...';
                    document.getElementById('charCount').innerText = element.value.length;
                    
                    // تغيير لون العداد لو الكلام كتر زيادة عن اللزوم (مثلاً 200 حرف)
                    document.getElementById('charCount').style.color = element.value.length > 200 ? 'red' : '#999';
                }
            });
        }
    });
}

// تشغيل الخاصية أول ما الصفحة تحمل
document.addEventListener('DOMContentLoaded', setupLivePreview);
// دالة فتح المعاينة
function openMailPreview() {
    const topic = document.getElementById('addTopic').value || "بدون عنوان";
    const content = document.getElementById('addContent').value || "لا يوجد محتوى";
    const sender = document.getElementById('addSender').value || "غير معروف";
    const category = document.getElementById('addCategory').value;
    const expiry = document.getElementById('expiryDate').value || "لا يوجد";

    document.getElementById('previewContentArea').innerHTML = `
        <div style="border: 2px solid #2e7d32; padding: 15px; border-radius: 10px; text-align: left; direction: ltr; background: #fff;">
            <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                <span style="background:#2e7d32; color:white; padding:3px 10px; border-radius:5px; font-size:12px;">${category}</span>
                <small style="color:red;">Expires: ${expiry}</small>
            </div>
            <strong>Subject: ${topic}</strong><br>
            <small>From: ${sender}</small>
            <hr>
            <div style="white-space: pre-wrap;">${content}</div>
        </div>
    `;
    document.getElementById('mailPreviewModal').style.display = 'flex';
}

function updateCharCount(textarea) {
    const count = textarea.value.length;
    const display = document.getElementById('charCountDisplay');
    if (display) {
        display.innerText = count + " حرف";
        // تغيير اللون لتحذير الإيجنت لو الكلام زاد
        display.style.color = count > 800 ? "#e74c3c" : "#999";
    }
}