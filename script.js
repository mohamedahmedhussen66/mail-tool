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
let isAdminSession = false; // Phase 1: Admin session state
let userFavorites = JSON.parse(localStorage.getItem('userFavs') || '[]'); // Phase 1: Local favorites
let userPinned = JSON.parse(localStorage.getItem('userPinned') || '[]'); // Personal Pinned
let userDeleted = JSON.parse(localStorage.getItem('userDeleted') || '[]'); // Personal Trash
let readMails = JSON.parse(localStorage.getItem('readMails') || '[]'); // Read status tracking
let searchHistory = JSON.parse(localStorage.getItem('hdbSearchHistory') || '[]');
// 2. Load App Options for Dropdowns
let appSettingsOptions = { topics: ["Announcement", "Security Alert", "Maintenance"], senders: ["HR", "IT", "Management"] };

db.collection("appSettings").doc("options").onSnapshot((doc) => {
    if (doc.exists) {
        appSettingsOptions = doc.data();
    } else {
        db.collection("appSettings").doc("options").set(appSettingsOptions);
    }
    renderSelectOptions();
});

function renderSelectOptions() {
    const topicSelect = document.getElementById('addTopic');
    const senderSelect = document.getElementById('addSender');
    if(topicSelect) {
        topicSelect.innerHTML = appSettingsOptions.topics.map(t => `<option value="${t}">${t}</option>`).join('');
    }
    if(senderSelect) {
        senderSelect.innerHTML = appSettingsOptions.senders.map(s => `<option value="${s}">${s}</option>`).join('');
    }
}

let currentUser = null;
let unsubscribeMails = null;

// Handle authentication state
document.addEventListener("DOMContentLoaded", function() {
    const sessionUser = sessionStorage.getItem('hdbUser');
    if (sessionUser) {
        currentUser = JSON.parse(sessionUser);
        isAdminSession = currentUser.role === 'admin';
        document.getElementById('loginScreen').style.display = 'none';
        
        // Show welcome message
        const welcomeArea = document.getElementById('welcomeArea');
        const userNameDisplay = document.getElementById('userNameDisplay');
        if (welcomeArea && userNameDisplay) {
            welcomeArea.style.display = 'block';
            userNameDisplay.innerText = currentUser.username;
        }

        if (isAdminSession) {
            document.getElementById("adminTopBars").style.display = "block";
            document.getElementById("logoutAdminBtn").style.display = "inline-block";
        }
        startAppListeners();
    } else {
        document.getElementById('loginScreen').style.display = 'flex';
    }
});

async function handleLogin() {
    const user = document.getElementById('loginUser').value.trim();
    const pass = document.getElementById('loginPass').value.trim();
    if(!user || !pass) return showToast("Enter username and password", "error");
    
    try {
        // --- Temporary Auto-Create Admin if not exists ---
        if (user === "admin" && pass === "admin") {
            const allAdmins = await db.collection("users").where("role", "==", "admin").get();
            if(allAdmins.empty) {
                await db.collection("users").add({ username: "admin", password: "admin", role: "admin" });
                showToast("Temporary Admin account created!", "success");
            }
        }
        // -------------------------------------------------
        
        let snapshot = await db.collection("users").where("username", "==", user).get();
        if(snapshot.empty) return showToast("Wrong credentials!", "error");
        
        let dbUser = snapshot.docs[0].data();
        if(dbUser.password === pass) {
            currentUser = { username: dbUser.username, role: dbUser.role };
            sessionStorage.setItem("hdbUser", JSON.stringify(currentUser));
            window.location.reload();
        } else {
            showToast("Wrong password!", "error");
        }
    } catch (e) {
        showToast("Error connecting to server", "error");
    }
}

// 3. Start Data Listeners only after login
function startAppListeners() {
    unsubscribeMails = db.collection("mails").orderBy("createdAt", "desc").onSnapshot((snapshot) => {
        const today = new Date().toISOString().split('T')[0];
        const nowISO = new Date().toISOString();
        
        allMails = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
                   .filter(m => {
                       if (m.expiryDate && m.expiryDate < today) return false;
                       
                       if (isAdminSession) return true; // Admin sees all valid by date
                       
                       if (m.isDraft) return false; // Agent restriction
                       if (m.publishAt && m.publishAt > nowISO) return false; // Agent restriction
                       
                       return true;
                   });
        refreshDisplay();
        renderStickyBanners(); // Phase 3
        updateBadgeCount();
        if(typeof updateAdminStats === 'function') updateAdminStats();
    });
}

function updateBadgeCount() {
    const badge = document.getElementById('unreadBadge');
    if (!badge) return;
    
    const unreadCount = allMails.filter(m => !readMails.includes(m.id) && !m.isDeleted && !m.isDraft).length;
    
    if (unreadCount > 0) {
        badge.style.display = 'block';
        badge.innerText = unreadCount;
    } else {
        badge.style.display = 'none';
    }
}

// 2. Filter and Sort logic
function refreshDisplay() {
    let displayData = allMails.filter(m => {
        // If mail is globally deleted, agents should not see it
        if (m.isDeleted && !isAdminSession) return false;

        // Trash view logic
        if (showingTrash) {
            return userDeleted.includes(m.id) || (isAdminSession && m.isDeleted);
        } else {
            return !userDeleted.includes(m.id) && (!m.isDeleted);
        }
    });

    if (!showingTrash) {
        displayData.sort((a, b) => {
            const aPinned = a.isPinned || userPinned.includes(a.id) ? 1 : 0;
            const bPinned = b.isPinned || userPinned.includes(b.id) ? 1 : 0;
            return bPinned - aPinned;
        });
    }
    renderTable(displayData);
}

// 3. Render Table
function renderTable(data) {
    const tbody = document.getElementById("tableBody");
    tbody.innerHTML = ""; // Clean table before rendering
    
    // Bulk actions for Admin
    const selectAllTh = document.querySelector('.td-bulk-cb');
    if(selectAllTh) selectAllTh.style.display = isAdminSession ? 'table-cell' : 'none';

    data.forEach((m) => {
        let row = document.createElement("tr");
        row.style.userSelect = "none"; // Disable text selection
        
        if ((m.isPinned || userPinned.includes(m.id)) && !showingTrash) {
            row.style.background = "rgba(46, 125, 50, 0.05)";
        }
        
        if (!readMails.includes(m.id) && !showingTrash) {
            row.classList.add("unread-row");
        }

        const colors = { "Urgent": "#e74c3c", "New Policy": "#27ae60", "Update": "#3498db", "General": "#95a5a6" };
        const badgeColor = m.categoryColor ? m.categoryColor : (colors[m.category] || "#95a5a6");
        
        let selectHtml = isAdminSession ? `<td style="width:40px; text-align:center;"><input type="checkbox" class="bulk-cb" value="${m.id}"></td>` : ``;

        // --- هنا مكان الـ row.innerHTML بالظبط ---
        row.innerHTML = `
            ${selectHtml}
            <td style="white-space: nowrap; width: 160px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <div style="width: 35px; display: flex; gap: 2px; justify-content: center;">
                        <span style="color:#f1c40f; font-size: 14px;">${userFavorites.includes(m.id) ? '★' : ''}</span>
                        <span style="font-size: 14px;">${m.isPinned || userPinned.includes(m.id) ? '📌' : ''}</span>
                    </div>
                    
                    <span style="font-weight: bold; color: #2e7d32; min-width: 65px;">${m.code}</span>
                    
                    <span style="background:${badgeColor}; color:white; padding:2px 6px; border-radius:4px; font-size:9px; font-weight:bold;">
                        ${m.category || 'General'}
                    </span>
                    <span title="Has Attachment" style="font-size:12px;">📎</span>
                    ${m.isDraft ? '<span title="Draft" style="background:#f39c12; color:white; padding:2px 6px; border-radius:4px; font-size:9px;">Draft</span>' : ''}
                    ${m.publishAt && m.publishAt > new Date().toISOString() ? '<span title="Scheduled" style="background:#8e44ad; color:white; padding:2px 6px; border-radius:4px; font-size:9px;">Scheduled</span>' : ''}
                </div>
            </td>
            
            <td style="font-weight: 500;">${m.topic}</td>
            <td>${m.idea || '---'}</td>
            <td>${m.sender}</td>
        `;
        // --- نهاية الـ row.innerHTML ---

            // Double click action (show controls)
            row.ondblclick = (e) => {
                e.preventDefault();
                showMailActions(e, m);
            };

            // Single click action (show content and mark as read)
            row.onclick = () => {
                const glowClass = m.category === "Urgent" ? "alert-glow" : "";
            const tagsHTML = (m.tags && m.tags.length > 0) ? m.tags.map(t => `<span style="background:#eee; padding:2px 6px; border-radius:10px; font-size:11px; margin-right:5px;">#${t}</span>`).join('') : '';
            const attachHTML = m.attachmentUrl ? `<div style="margin-top:15px; padding:10px; background:#e8f4f8; border-radius:5px; border-left: 4px solid #3498db;"><a href="${m.attachmentUrl}" target="_blank" style="text-decoration:none; font-weight:bold; color:#2980b9;">📎 Click here to download attachment</a></div>` : '';
            const receiptHTML = m.requireReadReceipt ? `<div style="margin-top:15px; text-align:center;"><button style="background:#27ae60; color:white; border:none; padding:10px 20px; border-radius:5px; font-weight:bold; cursor:pointer;" onclick="showToast('Read confirmed ✅')">I confirm reading this update</button></div>` : '';
            
            // Phase 3: Auto-link text
            let processedContent = m.content || "";
            processedContent = processedContent.replace(/(TICKET-\d+)/g, '<a href="#" style="color:#e74c3c; font-weight:bold; background:#fff3f3; padding:2px 6px; border-radius:4px; text-decoration:none;">$1</a>');

            document.getElementById("mailBox").innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #eee; padding-bottom: 10px; margin-bottom: 15px;">
                    <div>
                        <b style="color:#2e7d32; font-size: 18px;">${m.sender}</b>
                        <div style="margin-top: 5px; color: #666; font-size: 14px;"><b>Subject:</b> ${m.topic}</div>
                        <div style="margin-top: 5px;">${tagsHTML}</div>
                    </div>
                    
                    <div class="${glowClass}" style="background: ${badgeColor}; padding: 5px 15px; border-radius: 5px; color: white; font-weight: bold; font-size: 12px;">
                        ${m.category || 'General'}
                    </div>
                </div>
                <div class="ql-editor" style="line-height: 1.8; font-size: 15px; color: #333; padding: 10px;">${processedContent}</div>
                ${attachHTML}
                ${receiptHTML}
            `;
            
            // Mark as read when clicked
            if (!readMails.includes(m.id)) {
                readMails.push(m.id);
                localStorage.setItem('readMails', JSON.stringify(readMails));
                updateBadgeCount();
                row.classList.remove("unread-row");
            }

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
function toggleFav(id) {
    if (userFavorites.includes(id)) {
        userFavorites = userFavorites.filter(favId => favId !== id);
        showToast("Removed from Favorites", "success");
    } else {
        userFavorites.push(id);
        showToast("Added to Favorites", "success");
    }
    localStorage.setItem('userFavs', JSON.stringify(userFavorites));
    
    const actionBtn = document.querySelector(`.action-btn.btn-fav[onclick="toggleFav('${id}')"]`);
    if(actionBtn) {
       if(userFavorites.includes(id)) {
           actionBtn.classList.add('active');
       } else {
           actionBtn.classList.remove('active');
       }
    }
    refreshDisplay(); 
}

async function pinMail(id) {
    const mail = allMails.find(m => m.id === id);
    const newState = !mail.isPinned;
    showToast(newState ? "Pinned globally" : "Unpinned globally");
    await db.collection("mails").doc(id).update({ isPinned: newState });
}

// AGENT PERSONAL FUNCTIONS
function toggleUserPin(id) {
    if (userPinned.includes(id)) {
        userPinned = userPinned.filter(p => p !== id);
        showToast("Personal unpinned", "success");
    } else {
        userPinned.push(id);
        showToast("📌 Pinned to your profile", "success");
    }
    localStorage.setItem('userPinned', JSON.stringify(userPinned));
    refreshDisplay();
}

function userDeleteMail(id) {
    userDeleted.push(id);
    localStorage.setItem('userDeleted', JSON.stringify(userDeleted));
    showToast("🗑️ Moved to personal trash", "success");
    refreshDisplay();
}

function userRestoreMail(id) {
    userDeleted = userDeleted.filter(d => d !== id);
    localStorage.setItem('userDeleted', JSON.stringify(userDeleted));
    showToast("🔄 Restored successfully", "success");
    refreshDisplay();
}



async function addNewEntry(isDraft = false) {
    // 1. سحب البيانات من الخانات
    const topic = document.getElementById('addTopic').value;
    const idea = document.getElementById('addIdea').value;
    const sender = document.getElementById('addSender').value;
    const expiry = document.getElementById('expiryDate').value;
    
    // Phase 2: Quill Content & New Fields
    const content = quill.root.innerHTML;
    const rawText = quill.getText().trim();
    
    let category = document.getElementById('addCategory').value;
    let categoryColor = "";
    if (category === "Custom") {
        category = document.getElementById('customCatName').value || "Custom";
        categoryColor = document.getElementById('customCatColor').value;
    }
    
    const tagsInput = document.getElementById('addTags').value;
    const tags = tagsInput ? tagsInput.split(',').map(t => t.trim()).filter(t => t) : [];
    const requireReadReceipt = document.getElementById('requireReadReceipt').checked;
    const attachmentUrl = document.getElementById('attachedFileUrl').value;
    
    // Phase 3 Fields
    const publishAtValue = document.getElementById('publishAt').value;
    const publishAt = publishAtValue ? new Date(publishAtValue).toISOString() : null;
    const isSticky = document.getElementById('isSticky').checked;

    const now = new Date();
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const monthStr = monthNames[now.getMonth()];
    
    const currentMonthCount = allMails.filter(m => m.code && m.code.startsWith(monthStr)).length + 1;
    const autoCode = `${monthStr}-${currentMonthCount.toString().padStart(2, '0')}`;

    if(!topic || !rawText) return showToast("Please enter Subject and Content ⚠️", "error");

    try {
        await db.collection("mails").add({
            code: autoCode,
            topic, 
            idea, 
            sender, 
            content, 
            category,
            categoryColor, // Phase 2
            tags, // Phase 2
            requireReadReceipt, // Phase 2
            attachmentUrl, // Phase 2
            isDraft, // Phase 3
            publishAt, // Phase 3
            isSticky, // Phase 3
            expiryDate: expiry || null,
            isDeleted: false,  
            isPinned: false, 
            isFav: false,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        document.getElementById('adminPanel').style.display = 'none';
        showToast(isDraft ? `Code ${autoCode} saved as draft 💾` : `Saved successfully! Code: ${autoCode} ✅`);
        
        document.querySelectorAll('#adminPanel input').forEach(i => {
           if(i.type !== 'color' && i.type !== 'file') i.value = "";
        });
        document.getElementById('requireReadReceipt').checked = false;
        document.getElementById('isSticky').checked = false;
        quill.root.innerHTML = "";
        document.getElementById('attachedFileUrl').value = "";
        document.getElementById('uploadStatus').innerText = "No attachment";
        document.getElementById('addCategory').value = "General";
        checkCustomCategory();
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



// 7. الاختصارات والبحث والـ Dark Mode وقسم الإدارة
let quill;
document.addEventListener("DOMContentLoaded", function() {
    quill = new Quill('#editor', {
        theme: 'snow',
        placeholder: 'Write Mail Content here...',
        modules: {
            toolbar: [
                [{ 'font': [] }, { 'size': [] }],
                [{ 'header': [1, 2, 3, 4, 5, 6, false] }],
                ['bold', 'italic', 'underline', 'strike'],
                [{ 'color': [] }, { 'background': [] }],
                [{ 'script': 'super' }, { 'script': 'sub' }],
                [{ 'header': '1' }, { 'header': '2' }, 'blockquote', 'code-block'],
                [{ 'list': 'ordered' }, { 'list': 'bullet' }, { 'indent': '-1' }, { 'indent': '+1' }],
                [{ 'direction': 'rtl' }, { 'align': [] }],
                ['link', 'image', 'video'],
                ['clean']
            ]
        }
    });

    quill.on('text-change', function() {
        const text = quill.getText();
        document.getElementById('charCountDisplay').innerText = text.length + " chars";
        document.getElementById('charCountDisplay').style.color = text.length > 800 ? "red" : "#999";
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

    // Save to history if not empty
    if (term.length > 2) {
        updateSearchHistory(val);
    }
}

function updateSearchHistory(val) {
    if (!searchHistory.includes(val)) {
        searchHistory.unshift(val);
        if (searchHistory.length > 5) searchHistory.pop();
        localStorage.setItem('hdbSearchHistory', JSON.stringify(searchHistory));
    }
}

function showSearchHistory() {
    const box = document.getElementById('searchHistoryBox');
    if (searchHistory.length === 0) return;
    
    box.innerHTML = searchHistory.map(term => `<div onclick="setSearchValue('${term}')">🕒 ${term}</div>`).join('');
    box.classList.add('show');
    
    // Close on click outside
    setTimeout(() => {
        document.addEventListener('click', function closeBox(e) {
            if (!e.target.closest('.search-box')) {
                box.classList.remove('show');
                document.removeEventListener('click', closeBox);
            }
        });
    }, 100);
}

function setSearchValue(val) {
    document.getElementById('searchInput').value = val;
    search(val);
    document.getElementById('searchHistoryBox').classList.remove('show');
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
        if (isAdminSession) {
            buttonsHTML = `
                <div class="actions-flex-wrapper">
                    <div class="btn-restore-style" onclick="restoreMail('${mail.id}')" title="Restore (Global)"><span>🔄 Global Restore</span></div>
                </div>
            `;
        } else {
             buttonsHTML = `
                <div class="actions-flex-wrapper">
                    <div class="btn-restore-style" onclick="userRestoreMail('${mail.id}')" title="Restore to your inbox"><span>🔄 Restore</span></div>
                </div>
            `;
        }
    } else {
        if (isAdminSession) {
            buttonsHTML = `
                <div class="actions-flex-wrapper">
                    <div class="action-btn" title="Export to Outlook" onclick="exportToOutlook('${mail.id}')"><span>✉️</span></div>
                    <div class="action-btn" title="Clone / Duplicate" onclick="cloneMail('${mail.id}')"><span>📋</span></div>
                    <div class="action-btn" title="Edit this Mail" onclick="editMail('${mail.id}')"><span>✏️</span></div>
                    <div class="action-btn btn-delete" title="Delete for Everyone" onclick="askDeleteMail('${mail.id}')"><span>🗑️</span></div>
                    <div class="action-btn btn-pin ${mail.isPinned ? 'active' : ''}" title="Pin for Everyone" onclick="pinMail('${mail.id}')"><span>📌</span></div>
                </div>
            `;
        } else {
            buttonsHTML = `
                <div class="actions-flex-wrapper">
                    <div class="action-btn btn-delete" title="Delete for your profile" onclick="userDeleteMail('${mail.id}')"><span>🗑️</span></div>
                    <div class="action-btn btn-pin ${userPinned.includes(mail.id) ? 'active' : ''}" title="Pin to your profile" onclick="toggleUserPin('${mail.id}')"><span>📌</span></div>
                    <div class="action-btn btn-fav ${userFavorites.includes(mail.id) ? 'active' : ''}" title="Add to Favorites" onclick="toggleFav('${mail.id}')"><span>★</span></div>
                </div>
            `;
        }
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
    const inputs = ['addTopic', 'addSender', 'addContent'];
    
    inputs.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('input', () => {
                // تحديث النصوص في المعاينة
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
// 1. Open Preview Function
function openMailPreview() {
    const topic = document.getElementById('addTopic').value || "No Subject";
    const content = document.getElementById('addContent').value || "No Content";
    const sender = document.getElementById('addSender').value || "Unknown Sender";
    const category = document.getElementById('addCategory').value;
    const expiry = document.getElementById('expiryDate').value || "No Expiry";

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

// 2. دالة إغلاق المعاينة - لازم تكون بره القوس عشان تشتغل
function closeMailPreview() {
    const modal = document.getElementById('mailPreviewModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

function updateCharCount() {
    // Disabled old updateCharCount for textarea, replaced by Quill
}

// Phase 2 functions
function checkCustomCategory() {
    const val = document.getElementById('addCategory').value;
    if (val === 'Custom') {
        document.getElementById('customCategoryDiv').style.display = 'flex';
    } else {
        document.getElementById('customCategoryDiv').style.display = 'none';
    }
}

async function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    document.getElementById('uploadStatus').innerText = "Uploading... ⏳";
    
    try {
        const storageRef = firebase.storage().ref('attachments/' + Date.now() + '_' + file.name);
        const snapshot = await storageRef.put(file);
        const url = await snapshot.ref.getDownloadURL();
        
        document.getElementById('attachedFileUrl').value = url;
        document.getElementById('uploadStatus').innerHTML = `<a href="${url}" target="_blank" style="color: #27ae60;">Upload Success ✅</a>`;
    } catch (err) {
        console.error(err);
        document.getElementById('uploadStatus').innerText = "Upload Failed ❌";
        showToast("Storage error, check permissions", "error");
    }
}
// ==========================
// FILTER SYSTEM - الإصلاح النهائي
// ==========================

let activeFilters = {};

function toggleDropdown(e, field) {
    e.stopPropagation();
    
    // إغلاق أي قائمة مفتوحة أخرى
    document.querySelectorAll(".dropdown-content").forEach(d => {
        if (d.id !== field + "Dropdown") d.classList.remove("show");
    });

    const dropdown = document.getElementById(field + "Dropdown");
    dropdown.classList.toggle("show");

    if (dropdown.classList.contains("show")) {
        populateDropdown(field);
    }
}

function populateDropdown(field) {
    const itemsContainer = document.getElementById(field + "Items");
    // استخراج القيم الفريدة من البيانات الموجودة فعلياً
    const uniqueValues = [...new Set(allMails.map(m => m[field] || "---"))];

    itemsContainer.innerHTML = "";
    uniqueValues.forEach(val => {
        const div = document.createElement("div");
        div.className = "menu-item-option"; // لإضافة ستايل الهوفر
        div.innerText = val;
        div.onclick = () => applyFilter(field, val);
        itemsContainer.appendChild(div);
    });
}

function applyFilter(field, value) {
    if (activeFilters[field] === value) {
        delete activeFilters[field]; // إلغاء الفلتر لو ضغطت عليه تاني
    } else {
        activeFilters[field] = value;
    }

    const filtered = allMails.filter(m => {
        return Object.keys(activeFilters).every(f => (m[f] || "---") === activeFilters[f]);
    });

    renderTable(filtered);
    updateFilterIcon(field);
}

function updateFilterIcon(field) {
    const icon = document.querySelector(`[onclick*="${field}"] .filter-icon`);
    if (activeFilters[field]) {
        icon.style.color = "#f1c40f"; // لون ذهبي عند التفعيل
        icon.style.opacity = "1";
    } else {
        icon.style.color = "white";
        icon.style.opacity = "0.4";
    }
}
function toggleWatermarkMenu() {
    const menu = document.getElementById("watermarkMenu");

    if (!menu) {
        console.log("❌ العنصر مش موجود");
        return;
    }

    menu.classList.toggle("show");
}
function showAll() {
    showingTrash = false;

    // شيلنا أي حاجة مفتوحة
    document.querySelectorAll('.actions-container-row').forEach(el => el.remove());

    // رجع كل الإيميلات
    let data = allMails.filter(m => !m.isDeleted);

    // ترتيب الـ pinned
    data.sort((a, b) => (b.isPinned || false) - (a.isPinned || false));

    renderTable(data);
}
function showFavorites() {
    showingTrash = false;

    document.querySelectorAll('.actions-container-row').forEach(el => el.remove());

    let data = allMails.filter(m => userFavorites.includes(m.id) && !m.isDeleted);

    renderTable(data);
}

// --- Admin Phase 1 Functions ---
let currentlyEditingId = null;

function logoutAdmin() {
    isAdminSession = false;
    currentUser = null;
    sessionStorage.removeItem("hdbUser");
    window.location.reload();
}

function openAddPanel() {
    if(document.getElementById("adminPanel")) {
       document.getElementById("adminPanel").style.display = "flex";
    }
    document.getElementById("adminPanelForm").style.display = "flex";
    document.getElementById('adminSaveButtons').style.display = 'flex';
    document.getElementById('adminUpdateButtons').style.display = 'none';
    window.scrollTo({top: 0, behavior: 'smooth'});
}

function closeAddPanel() {
    if(document.getElementById("adminPanel")) {
       document.getElementById("adminPanel").style.display = "none";
    }
    document.getElementById("adminPanelForm").style.display = "none";
    cancelEdit();
}

function updateAdminStats() {
    if (!isAdminSession) return;
    const total = allMails.length;
    const urgent = allMails.filter(m => m.category === "Urgent" && !m.isDeleted).length;
    const pinned = allMails.filter(m => m.isPinned && !m.isDeleted).length;
    const trashed = allMails.filter(m => m.isDeleted).length;

    const elTotal = document.getElementById("statTotal");
    const elUrgent = document.getElementById("statUrgent");
    const elPinned = document.getElementById("statPinned");
    const elTrash = document.getElementById("statTrash");
    
    if(elTotal) elTotal.innerText = total;
    if(elUrgent) elUrgent.innerText = urgent;
    if(elPinned) elPinned.innerText = pinned;
    if(elTrash) elTrash.innerText = trashed;
}

function renderStickyBanners() {
    const container = document.getElementById('stickyBannersContainer');
    if (!container) return;
    
    const activeSticky = allMails.filter(m => m.isSticky && !m.isDeleted && !m.isDraft);
    
    if (activeSticky.length === 0) {
        container.innerHTML = "";
        return;
    }
    
    let html = '';
    activeSticky.forEach(m => {
        html += `
        <div style="background: #e74c3c; color: white; padding: 15px; margin-bottom: 15px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
            <div>
                <strong style="margin-right:10px;">📢 Announcement:</strong> ${m.topic}
            </div>
            <button onclick="document.getElementById('searchInput').value = '${m.code}'; search('${m.code}');" style="background: white; color: #e74c3c; border: none; padding: 5px 15px; border-radius: 4px; font-weight: bold; cursor: pointer;">View Mail</button>
        </div>
        `;
    });
    container.innerHTML = html;
}

// ==========================
// Phase 4: Editing, Cloning, Exporting, Bulk Actions
// ==========================

function editMail(id) {
    const mail = allMails.find(m => m.id === id);
    if (!mail) return;
    currentlyEditingId = id;
    
    document.getElementById("adminPanelForm").style.display = "flex";
    document.getElementById('adminSaveButtons').style.display = 'none';
    document.getElementById('adminUpdateButtons').style.display = 'flex';
    
    document.getElementById('addTopic').value = mail.topic || "";
    document.getElementById('addIdea').value = mail.idea || "";
    document.getElementById('addSender').value = mail.sender || "";
    document.getElementById('expiryDate').value = mail.expiryDate || "";
    
    if(["General", "New Policy", "Update", "Urgent"].includes(mail.category)) {
        document.getElementById('addCategory').value = mail.category;
        document.getElementById('customCategoryDiv').style.display = 'none';
    } else {
        document.getElementById('addCategory').value = "Custom";
        document.getElementById('customCategoryDiv').style.display = 'flex';
        document.getElementById('customCatName').value = mail.category || "";
        document.getElementById('customCatColor').value = mail.categoryColor || "#9b59b6";
    }
    
    document.getElementById('addTags').value = (mail.tags || []).join(', ');
    document.getElementById('requireReadReceipt').checked = mail.requireReadReceipt || false;
    document.getElementById('attachedFileUrl').value = mail.attachmentUrl || "";
    document.getElementById('uploadStatus').innerText = mail.attachmentUrl ? "Attached 📎" : "No attachment";
    
    document.getElementById('publishAt').value = mail.publishAt ? mail.publishAt.substring(0,16) : "";
    document.getElementById('isSticky').checked = mail.isSticky || false;
    
    quill.root.innerHTML = mail.content || "";
    window.scrollTo({top: 0, behavior: 'smooth'});
}

function cloneMail(id) {
    editMail(id);
    currentlyEditingId = null; 
    document.getElementById('adminSaveButtons').style.display = 'flex';
    document.getElementById('adminUpdateButtons').style.display = 'none';
    showToast("Ready to clone: creating new mail 📋", "success");
}

function cancelEdit() {
    currentlyEditingId = null;
    if(document.getElementById('adminPanel')) {
       document.getElementById('adminPanel').style.display = 'none';
    }
    document.getElementById('adminPanelForm').style.display = 'none';
    document.getElementById('adminSaveButtons').style.display = 'flex';
    document.getElementById('adminUpdateButtons').style.display = 'none';
    
    document.querySelectorAll('#adminPanelForm input').forEach(i => {
         if(i.type !== 'color' && i.type !== 'file') i.value = "";
    });
    quill.root.innerHTML = "";
}

// --- Manage Options Modal ---
let currentManageType = '';

function openManageModal(type) {
    currentManageType = type;
    document.getElementById('manageTitle').innerText = type === 'topics' ? 'Manage Topics' : 'Manage Senders';
    document.getElementById('newOptionInput').value = '';
    renderManageList();
    document.getElementById('manageOptionsModal').style.display = 'flex';
}

function renderManageList() {
    const list = document.getElementById('optionsList');
    const arr = appSettingsOptions[currentManageType] || [];
    list.innerHTML = arr.map(item => `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:10px; border-bottom:1px solid #ddd;">
            <span style="font-weight:bold; color:#333;">${item}</span>
            <button onclick="removeOption('${item}')" style="background:#e74c3c; color:white; border:none; border-radius:50%; width:30px; height:30px; cursor:pointer; font-weight:bold;">×</button>
        </div>
    `).join('');
}

function addCurrentOption() {
    const val = document.getElementById('newOptionInput').value.trim();
    if (!val) return;
    if (!appSettingsOptions[currentManageType]) appSettingsOptions[currentManageType] = [];
    appSettingsOptions[currentManageType].push(val);
    db.collection("appSettings").doc("options").set(appSettingsOptions);
    document.getElementById('newOptionInput').value = '';
    renderManageList();
}

function removeOption(val) {
    appSettingsOptions[currentManageType] = appSettingsOptions[currentManageType].filter(x => x !== val);
    db.collection("appSettings").doc("options").set(appSettingsOptions);
    renderManageList();
}

async function updateExistingEntry(isDraft = false) {
    if (!currentlyEditingId) return;
    
    const topic = document.getElementById('addTopic').value;
    const idea = document.getElementById('addIdea').value;
    const sender = document.getElementById('addSender').value;
    const expiry = document.getElementById('expiryDate').value;
    
    const content = quill.root.innerHTML;
    const rawText = quill.getText().trim();
    
    let category = document.getElementById('addCategory').value;
    let categoryColor = "";
    if (category === "Custom") {
        category = document.getElementById('customCatName').value || "Custom";
        categoryColor = document.getElementById('customCatColor').value;
    }
    
    const tagsInput = document.getElementById('addTags').value;
    const tags = tagsInput ? tagsInput.split(',').map(t => t.trim()).filter(t => t) : [];
    const requireReadReceipt = document.getElementById('requireReadReceipt').checked;
    const attachmentUrl = document.getElementById('attachedFileUrl').value;
    
    const publishAtValue = document.getElementById('publishAt').value;
    const publishAt = publishAtValue ? new Date(publishAtValue).toISOString() : null;
    const isSticky = document.getElementById('isSticky').checked;

    if(!topic || !rawText) return showToast("Subject and Content required ⚠️", "error");

    try {
        const oldMail = allMails.find(m => m.id === currentlyEditingId);
        const auditLog = {
             modifiedAt: new Date().toISOString(),
             oldTopic: oldMail.topic,
             oldContent: oldMail.content
        };

        await db.collection("mails").doc(currentlyEditingId).update({
            topic, idea, sender, content,
            category, categoryColor, tags, requireReadReceipt,
            attachmentUrl, isDraft, publishAt, isSticky,
            expiryDate: expiry || null,
            history: firebase.firestore.FieldValue.arrayUnion(auditLog)
        });

        cancelEdit();
        showToast("Mail updated successfully 🔄");
    } catch (e) {
        console.error(e);
        showToast("Error during update", "error");
    }
}

function toggleSelectAll() {
    const checked = document.getElementById('selectAllCheckbox').checked;
    document.querySelectorAll('.bulk-cb').forEach(cb => cb.checked = checked);
}

async function bulkDelete() {
    const selected = Array.from(document.querySelectorAll('.bulk-cb:checked')).map(cb => cb.value);
    if(selected.length === 0) return showToast("Nothing selected ⚠️", "error");
    
    if(!confirm("Are you sure you want to delete " + selected.length + " mail(s)?")) return;
    
    for(let id of selected) {
        await db.collection("mails").doc(id).update({ isDeleted: true });
    }
    showToast(`Deleted ${selected.length} rows ✅`, "success");
    document.getElementById('selectAllCheckbox').checked = false;
}

function exportToOutlook(id) {
    const mail = allMails.find(m => m.id === id);
    const htmlToCopy = `
        <div style="font-family: Arial, sans-serif; direction: ltr; text-align: left;">
            <h2 style="color: #2e7d32; border-bottom: 2px solid #2e7d32; padding-bottom: 10px;">Subject: ${mail.topic}</h2>
            <div style="font-size: 15px; color: #333; line-height: 1.6;">${mail.content}</div>
        </div>
    `;
    
    const blob = new Blob([htmlToCopy], {type: 'text/html'});
    try {
        navigator.clipboard.write([new ClipboardItem({'text/html': blob})]).then(() => {
            showToast("Copied for Outlook successfully ✉️", "success");
        });
    } catch(e) {
        showToast("Browser does not support this feature ⚠️", "error");
    }
}

// --- Manage Users Section ---
let usersUnsubscribe = null;

function openManageUsers() {
    document.getElementById('manageUsersModal').style.display = 'flex';
    document.getElementById('newUserName').value = '';
    document.getElementById('newUserPass').value = '';
    document.getElementById('newUserRole').value = 'agent';
    
    if(!usersUnsubscribe) {
        usersUnsubscribe = db.collection('users').onSnapshot(snapshot => {
            const listArea = document.getElementById('usersListArea');
            listArea.innerHTML = '';
            snapshot.docs.forEach(doc => {
                const u = doc.data();
                const roleColor = u.role === 'admin' ? '#e74c3c' : '#2980b9';
                listArea.innerHTML += `
                    <div style="display:flex; justify-content:space-between; align-items:center; padding:10px; border-bottom:1px solid #eee;">
                        <div>
                            <strong style="color:#2c3e50;">${u.username}</strong>
                            <span style="background:${roleColor}; color:white; padding:2px 6px; border-radius:4px; font-size:10px; margin-left:5px;">${u.role}</span>
                        </div>
                        <button onclick="deleteDocUser('${doc.id}', '${u.username}')" style="background:#e74c3c; color:white; border:none; border-radius:4px; padding:5px 10px; cursor:pointer; font-size:12px;">Delete</button>
                    </div>
                `;
            });
        });
    }
}

async function createNewUser() {
    const username = document.getElementById('newUserName').value.trim();
    const pass = document.getElementById('newUserPass').value.trim();
    const role = document.getElementById('newUserRole').value;
    
    if(!username || !pass) return showToast("Username and Password required", "error");
    
    const exists = await db.collection('users').where('username', '==', username).get();
    if(!exists.empty) return showToast("Username already taken", "error");
    
    await db.collection('users').add({ username, password: pass, role });
    showToast("User created successfully!", "success");
    document.getElementById('newUserName').value = '';
    document.getElementById('newUserPass').value = '';
}

async function deleteDocUser(id, username) {
    if (username === 'admin' && !confirm("Warning: You are deleting the default admin account. Ensure you have another admin created! Proceed?")) {
        return;
    }
    
    // Protection for Primary Admin (as requested by user)
    const protectedNames = ['mohamed', 'primary_admin', 'mohamed.mustafa'];
    if (protectedNames.includes(username.toLowerCase())) {
        return showToast("Cannot delete the Primary Admin account!", "error");
    }

    if(confirm(`Are you sure you want to delete user "${username}"?`)) {
        await db.collection('users').doc(id).delete();
        showToast("User successfully removed", "success");
    }
}