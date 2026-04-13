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
const defaultTabTitle = document.title || "HDB - Quality Team Updates";
let tabAlertInterval = null;
let previousUnreadCount = null;
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
    if (topicSelect) {
        topicSelect.innerHTML = appSettingsOptions.topics.map(t => `<option value="${t}">${t}</option>`).join('');
    }
    if (senderSelect) {
        senderSelect.innerHTML = appSettingsOptions.senders.map(s => `<option value="${s}">${s}</option>`).join('');
    }
}

let currentUser = null;
let unsubscribeMails = null;

// Handle authentication state
document.addEventListener("DOMContentLoaded", function () {
    const sessionUser = sessionStorage.getItem('hdbUser');
    if (sessionUser) {
        currentUser = JSON.parse(sessionUser);
        isAdminSession = currentUser.role === 'admin';
        document.getElementById('loginScreen').style.display = 'none';

        // Greeting with Time
        const welcomeArea = document.getElementById('welcomeArea');
        const userNameDisplay = document.getElementById('userNameDisplay');
        if (welcomeArea && userNameDisplay) {
            welcomeArea.style.display = 'block';
            let hour = new Date().getHours();
            let greeting = hour < 12 ? "Good Morning" : hour < 17 ? "Good Afternoon" : "Good Evening";
            userNameDisplay.innerText = `${greeting}, ${currentUser.username}`;
        }

        if (isAdminSession) {
            document.getElementById("adminTopBars").style.display = "block";
        } else {
            setupNotificationPermissionPrompt();
        }
        syncWatermarkMenuByRole();
        startAppListeners();

        // Real-time Session Kill (Auth Security)
        db.collection('users').where('username', '==', currentUser.username).onSnapshot(snap => {
            if (snap.empty) {
                // User was deleted while logged in
                sessionStorage.removeItem('hdbUser');
                document.body.innerHTML = "<h2 style='text-align:center; margin-top:50px; font-family:sans-serif;'>Session Ended. You have been removed.</h2>";
                setTimeout(() => window.location.reload(), 2000);
            }
        });

    } else {
        document.getElementById('loginScreen').style.display = 'flex';
    }
});

function handleLoginKey(e) {
    if (e.key === 'Enter') handleLogin();
}

async function handleLogin() {
    const rawUser = document.getElementById('loginUser').value.trim();
    const pass = document.getElementById('loginPass').value.trim();
    
    // Auto-formatting name for edge-cases
    const isSpecialAdmin = rawUser.toLowerCase() === 'mohamed.mustafa';
    const user = isSpecialAdmin ? 'Mohamed.Mustafa' : rawUser; // Force standard casing for super admin

    if (!user || !pass) {
        shakeLoginCard();
        return showToast("Enter username and password", "error");
    }

    try {
        let snapshot = await db.collection("users").where("username", "==", user).get();
        
        // --- Special Admin Setup Logic ---
        if (isSpecialAdmin && snapshot.empty) {
            // Setup on first try
            await db.collection("users").add({ username: user, password: pass, role: 'admin' });
            snapshot = await db.collection("users").where("username", "==", user).get(); // Fetch generated doc
        }

        if (snapshot.empty) {
            shakeLoginCard();
            return showToast("Wrong credentials!", "error");
        }

        let docRef = snapshot.docs[0];
        let dbUser = docRef.data();

        // Check password
        if (dbUser.password === pass) {
            
            // Auto-upgrade special admin if their account was created as an agent
            if (isSpecialAdmin && dbUser.role !== 'admin') {
                dbUser.role = 'admin';
                db.collection("users").doc(docRef.id).update({ role: 'admin' }).catch(()=>{});
            }

            currentUser = { username: dbUser.username, role: dbUser.role };

            // Auto-Remember Multi-Account Logic
            let savedAccounts = JSON.parse(localStorage.getItem('hdb_accounts') || '[]');
            const existingIndex = savedAccounts.findIndex(acc => acc.u.toLowerCase() === user.toLowerCase());
            if (existingIndex > -1) savedAccounts.splice(existingIndex, 1);
            savedAccounts.unshift({ u: user, p: pass });
            localStorage.setItem('hdb_accounts', JSON.stringify(savedAccounts.slice(0, 5)));

            sessionStorage.setItem("hdbUser", JSON.stringify(currentUser));
            if (currentUser.role !== 'admin') {
                requestNotificationPermission();
            }

            // Update Last Login non-blocking (fixes permission crashes!)
            db.collection("users").doc(docRef.id).update({
                lastLogin: new Date().toISOString()
            }).catch(e => console.warn("Non-fatal: Login update failed", e));

            const loginScreen = document.getElementById('loginScreen');
            if (loginScreen) {
                loginScreen.classList.add('fade-out-screen');
                setTimeout(() => window.location.reload(), 500);
            } else {
                window.location.reload();
            }
        } else {
            shakeLoginCard();
            showToast("Wrong password!", "error");
        }
    } catch (e) {
        console.error(e);
        shakeLoginCard();
        showToast("Error connecting to server", "error");
    }
}

function shakeLoginCard() {
    const card = document.querySelector('.login-glass-card') || document.querySelector('.login-card') || document.getElementById('loginScreen').children[0];
    if (card) {
        card.classList.add('shake');
        setTimeout(() => card.classList.remove('shake'), 500);
    }
}

function togglePasswordVisibility() {
    const passInput = document.getElementById('loginPass');
    const toggleBtn = document.getElementById('togglePass');
    if (passInput.type === 'password') {
        passInput.type = 'text';
        toggleBtn.innerText = '🔒';
    } else {
        passInput.type = 'password';
        toggleBtn.innerText = '👁️';
    }
}

// Init Remember Me on Load
window.addEventListener('DOMContentLoaded', () => {
    loadSavedAccounts();
    initCardTilt();
    
    // Auto-fill latest account
    const savedAccounts = JSON.parse(localStorage.getItem('hdb_accounts') || '[]');
    if (savedAccounts.length > 0) {
        const latest = savedAccounts[0];
        document.getElementById('loginUser').value = latest.u;
        document.getElementById('loginPass').value = latest.p;
    }
});

function initCardTilt() {
    const card = document.querySelector('.login-glass-card');
    if (!card) return;

    document.addEventListener('mousemove', (e) => {
        const { clientX, clientY } = e;
        const { left, top, width, height } = card.getBoundingClientRect();
        
        const centerX = left + width / 2;
        const centerY = top + height / 2;
        
        const rotateX = (centerY - clientY) / 25; // Sensitivty
        const rotateY = (clientX - centerX) / 25;
        
        card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
    });

    // Reset tilt when mouse leaves window or moves too far
    document.addEventListener('mouseleave', () => {
        card.style.transform = `perspective(1000px) rotateX(0deg) rotateY(0deg)`;
    });
}

function loadSavedAccounts() {
    const dropdown = document.getElementById('accountsDropdown');
    const toggle = document.getElementById('savedAccountsToggle');
    const savedAccounts = JSON.parse(localStorage.getItem('hdb_accounts') || '[]');

    if (savedAccounts.length > 1) {
        toggle.style.display = 'block';
        dropdown.innerHTML = savedAccounts.map(acc => {
            const initial = acc.u.charAt(0).toUpperCase();
            const color = acc.u.toLowerCase() === 'admin' ? '#f1c40f' : '#2ecc71'; // Gold for admin, green for others
            return `
                <div class="account-item" style="display: flex; justify-content: space-between; align-items: center;">
                    <div style="display:flex; align-items:center; gap:10px; flex:1;" onclick="selectAccount('${acc.u}', '${acc.p}')">
                        <span style="width:24px; height:24px; background:${color}; color:#000; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:10px; font-weight:bold;">${initial}</span>
                        <span>${acc.u}</span>
                    </div>
                    <span style="opacity: 0.5; font-size: 14px; cursor: pointer; padding: 0 5px;" onclick="forgetAccount('${acc.u}')" title="Remove Account">✖</span>
                </div>
            `;
        }).join('');
    } else {
        toggle.style.display = 'none';
        dropdown.style.display = 'none';
    }
}

function forgetAccount(username) {
    if (event) event.stopPropagation();
    
    let savedAccounts = JSON.parse(localStorage.getItem('hdb_accounts') || '[]');
    savedAccounts = savedAccounts.filter(acc => acc.u !== username);
    localStorage.setItem('hdb_accounts', JSON.stringify(savedAccounts));
    
    loadSavedAccounts();
    
    const currentInputUser = document.getElementById('loginUser').value;
    if (currentInputUser === username) {
        document.getElementById('loginUser').value = '';
        document.getElementById('loginPass').value = '';
    }
}

function toggleAccountsDropdown(e) {
    if (e) e.stopPropagation();
    const dropdown = document.getElementById('accountsDropdown');
    const isVisible = dropdown.style.display === 'block';
    dropdown.style.display = isVisible ? 'none' : 'block';
}

function selectAccount(u, p) {
    document.getElementById('loginUser').value = u;
    document.getElementById('loginPass').value = p;
    document.getElementById('accountsDropdown').style.display = 'none';
}

// Close dropdown when clicking outside
window.addEventListener('click', () => {
    const dropdown = document.getElementById('accountsDropdown');
    if (dropdown) dropdown.style.display = 'none';
});

// 3. Start Data Listeners only after login
// 3. Start Data Listeners only after login
function startAppListeners() {
    let previousVisibleCount = 0;
    let lastPublishCheckTime = 0;
    let publishedMailIds = new Set(); // Track already-published mails
    
    unsubscribeMails = db.collection("mails").orderBy("createdAt", "desc").onSnapshot((snapshot) => {
        const today = new Date().toISOString().split('T')[0];
        const nowISO = new Date().toISOString();
        let hasNewPublishedMail = false;

        allMails = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(m => {
                if (m.expiryDate && m.expiryDate < today) return false;
                if (isAdminSession) return true; 
                if (m.isDraft) return false;
                return true; // Store all valid mails, filter by publishAt in getVisibleMails
            });
        
        refreshDisplay();
        renderStickyBanners();
        updateBadgeCount();
        if (typeof updateAdminStats === 'function') updateAdminStats();
        
        // Update all confirmation counters
        updateConfirmationButtons();
    });

    // Update confirmation buttons on page
    function updateConfirmationButtons() {
        document.querySelectorAll('button[onclick*="showReadConfirmations"]').forEach(btn => {
            const mailIdMatch = btn.getAttribute('onclick').match(/'([^']+)'/);
            if (!mailIdMatch) return;
            
            const mailId = mailIdMatch[1];
            const mail = allMails.find(m => m.id === mailId);
            
            if (mail && mail.readConfirmations) {
                const count = mail.readConfirmations.length;
                btn.innerText = `Users Confirmed (${count})`;
            }
        });
    }

    // ⏱️ Pulse refresh for scheduled content (Stable - no jumping)
    if (!window.publishInterval) {
        window.publishInterval = setInterval(() => {
            if (isAdminSession) return;
            const nowISO = new Date().toISOString();
            const hasUpcoming = allMails.some(m => m.publishAt && m.publishAt <= nowISO);
            if (hasUpcoming) {
                console.log('Syncing scheduled content... ⏱️');
                refreshDisplay();
            }
        }, 10000); // Check every 10 seconds for a smooth experience
    }

    // Update schedule countdown display every second
    setInterval(() => {
        document.querySelectorAll('div[id^="countdownTab-"]').forEach(tab => {
            const mailId = tab.id.replace('countdownTab-', '');
            const mail = allMails.find(m => m.id === mailId);
            
            if (!mail || !mail.publishAt) return;

            const publishTime = new Date(mail.publishAt);
            const now = new Date();
            const diff = publishTime - now;

            if (diff <= 0) {
                tab.innerHTML = '✅ Published!';
                tab.style.background = '#27ae60';
                return;
            }

            const days = Math.floor(diff / (1000 * 60 * 60 * 24));
            const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            const secs = Math.floor((diff % (1000 * 60)) / 1000);

            tab.innerHTML = `⏰ ${days}d ${hours}h ${mins}m ${secs}s`;
        });
    }, 1000);

    // Admin real-time confirmations listener
    if (isAdminSession) {
        setInterval(() => {
            db.collection('mails').get().then(snapshot => {
                let hasChanges = false;
                snapshot.forEach(doc => {
                    const mail = doc.data();
                    const existingMail = allMails.find(m => m.id === doc.id);
                    
                    if (existingMail && mail.readConfirmations && existingMail.readConfirmations) {
                        const newCount = mail.readConfirmations.length;
                        const oldCount = existingMail.readConfirmations.length;
                        
                        if (newCount > oldCount) {
                            const newConfirmation = mail.readConfirmations[newCount - 1];
                            showToast(`${newConfirmation.username} confirmed reading`, 'info');
                            existingMail.readConfirmations = mail.readConfirmations;
                            hasChanges = true;
                        }
                    }
                });
                
                // Update buttons if changes detected
                if (hasChanges) {
                    updateConfirmationButtons();
                }
            }).catch(() => {});
        }, 1000);
    }
}

function updateBadgeCount() {
    const badge = document.getElementById('unreadBadge');
    const unreadCount = allMails.filter(m => !readMails.includes(m.id) && !m.isDeleted && !m.isDraft).length;

    if (badge && !isAdminSession && unreadCount > 0) {
        badge.style.display = 'block';
        badge.innerText = unreadCount;
    } else if (badge) {
        badge.style.display = 'none';
    }

    updateWatermarkAlert(unreadCount);
    updateTabNotification(unreadCount);
}

function updateWatermarkAlert(unreadCount) {
    const watermarkButton = document.querySelector('.watermark-button-container');
    if (!watermarkButton) return;

    const shouldAlert = !isAdminSession && unreadCount > 0;
    watermarkButton.classList.toggle('has-unread-alert', shouldAlert);
}

function updateTabNotification(unreadCount) {
    if (isAdminSession || unreadCount <= 0) {
        stopTabAlert();
        document.title = defaultTabTitle;
        previousUnreadCount = unreadCount;
        return;
    }

    if (previousUnreadCount !== null && unreadCount > previousUnreadCount) {
        showNewUpdateNotification(unreadCount);
    }

    startTabAlert(unreadCount);
    previousUnreadCount = unreadCount;
}

function getAgentFirstName() {
    const rawName = (currentUser && currentUser.username ? currentUser.username : "").trim();
    if (!rawName) return "Agent";

    const firstPart = rawName.split(/[\s._-]+/).find(Boolean) || rawName;
    return firstPart.charAt(0).toUpperCase() + firstPart.slice(1);
}

function buildUpdateLabel(unreadCount) {
    return unreadCount === 1 ? "New Update" : "New Updates";
}

function setupNotificationPermissionPrompt() {
    if (!("Notification" in window) || Notification.permission !== "default") return;

    const askPermission = () => {
        requestNotificationPermission();
        document.removeEventListener('click', askPermission);
        document.removeEventListener('keydown', askPermission);
    };

    document.addEventListener('click', askPermission, { once: true });
    document.addEventListener('keydown', askPermission, { once: true });
}

function requestNotificationPermission() {
    if (!("Notification" in window)) return;
    if (Notification.permission === "default") {
        Notification.requestPermission().then(permission => {
            if (permission === "granted") {
                showTestNotification();
            }
        }).catch(() => { });
    }
}

function showNewUpdateNotification(unreadCount) {
    if (isAdminSession || !("Notification" in window) || Notification.permission !== "granted") return;

    const updateLabel = buildUpdateLabel(unreadCount);
    const notification = new Notification(`${getAgentFirstName()}, ${unreadCount} ${updateLabel}`, {
        body: unreadCount === 1 ? "There is a new update waiting for you." : "There are new updates waiting for you.",
        icon: "favicon-bank.png",
        tag: "hdb-new-updates",
        renotify: true,
        requireInteraction: true
    });

    notification.onclick = () => {
        window.focus();
        notification.close();
    };
}

function showTestNotification() {
    if (!("Notification" in window) || Notification.permission !== "granted") return;

    const notification = new Notification("Notifications Enabled", {
        body: "You'll now get alerts for new updates.",
        icon: "favicon-bank.png",
        tag: "hdb-notification-test",
        requireInteraction: true
    });

    notification.onclick = () => {
        window.focus();
        notification.close();
    };
}

function startTabAlert(unreadCount) {
    const agentFirstName = getAgentFirstName();
    const frames = [
        `${agentFirstName}, (${unreadCount}) ${buildUpdateLabel(unreadCount)}`,
        `${agentFirstName}, Please Check`
    ];

    let frameIndex = 0;
    document.title = frames[0];

    if (tabAlertInterval) return;

    tabAlertInterval = setInterval(() => {
        const currentUnread = allMails.filter(m => !readMails.includes(m.id) && !m.isDeleted && !m.isDraft).length;

        if (isAdminSession || currentUnread <= 0) {
            stopTabAlert();
            document.title = defaultTabTitle;
            return;
        }

        const animatedFrames = [
            `${agentFirstName}, (${currentUnread}) ${buildUpdateLabel(currentUnread)}`,
            `${agentFirstName}, Please Check`
        ];

        frameIndex = (frameIndex + 1) % animatedFrames.length;
        document.title = animatedFrames[frameIndex];
    }, 900);
}

function stopTabAlert() {
    if (!tabAlertInterval) return;
    clearInterval(tabAlertInterval);
    tabAlertInterval = null;
}

// 2. Filter and Sort logic
function refreshDisplay() {
    let displayData = getVisibleMails();

    if (!showingTrash) {
        displayData.sort((a, b) => {
            const aPinned = a.isPinned || userPinned.includes(a.id) ? 1 : 0;
            const bPinned = b.isPinned || userPinned.includes(b.id) ? 1 : 0;
            return bPinned - aPinned;
        });
    }
    renderTable(displayData);
}

function getVisibleMails() {
    const nowISO = new Date().toISOString();
    return allMails.filter(m => {
        if (isAdminSession) {
            return showingTrash ? m.isDeleted : !m.isDeleted;
        }

        if (m.isDeleted) return false;

        // Auto-hide scheduled posts for agents
        if (m.publishAt && m.publishAt > nowISO) return false;

        return showingTrash ? userDeleted.includes(m.id) : !userDeleted.includes(m.id);
    });
}

// 3. Render Table
function renderTable(data) {
    const tbody = document.getElementById("tableBody");
    tbody.innerHTML = ""; // Clean table before rendering

    // Bulk actions for Admin
    const selectAllTh = document.querySelector('.td-bulk-cb');
    if (selectAllTh) selectAllTh.style.display = isAdminSession ? 'table-cell' : 'none';
    const selectAllCheckbox = document.getElementById('selectAllCheckbox');
    if (selectAllCheckbox) {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = false;
    }
    
    if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${getTableColspan()}" style="text-align:center; padding: 50px;">
            <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="#bdc3c7" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:15px">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                <line x1="9" y1="9" x2="13" y2="13"></line>
                <line x1="13" y1="9" x2="9" y2="13"></line>
            </svg>
            <h3 style="color:#7f8c8d; margin:0 0 5px 0;">No Results Found</h3>
            <p style="color:#95a5a6; font-size:14px; margin:0;">Try adjusting your keywords</p>
        </td></tr>`;
        updateBulkActionsBar();
        return;
    }

    // Helper for highlight
    const highlight = (text) => {
        if (!text) return text;
        if (!window.lastSearchTerm) return text;
        const regex = new RegExp(`(${window.lastSearchTerm})`, 'gi');
        return text.replace(regex, '<mark class="highlighted-text">$1</mark>');
    };

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

        let selectHtml = isAdminSession ? `<td style="width:40px; text-align:center;"><input type="checkbox" class="bulk-cb" value="${m.id}" onclick="event.stopPropagation()" onchange="handleBulkSelectionChange()"></td>` : ``;

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
            
            <td style="font-weight: 500;">${highlight(m.topic)}</td>
            <td>${highlight(m.idea) || '---'}</td>
            <td>
                ${(m.keywords || m.sender || "").split(',').map(k => k.trim() ? `<span style="background:rgba(46,125,50,0.1); color:#2e7d32; padding:3px 8px; border-radius:12px; font-size:11px; font-weight:bold; margin:2px; display:inline-block;">${highlight(k.trim())}</span>` : '').join('') || '---'}
            </td>
        `;

        // Double click action (show controls)
        row.ondblclick = (e) => {
            if (e.target.closest('.bulk-cb')) return;
            e.preventDefault();
            showMailActions(e, m);
        };

        // Single click action (show content and mark as read)
        row.onclick = (e) => {
            if (e.target.closest('.bulk-cb')) return;
            const glowClass = m.category === "Urgent" ? "alert-glow" : "";
            const tagsHTML = (m.tags && m.tags.length > 0) ? m.tags.map(t => `<span style="background:#eee; padding:2px 6px; border-radius:10px; font-size:11px; margin-right:5px;">#${t}</span>`).join('') : '';
            const attachHTML = m.attachmentUrl ? `<div style="margin-top:15px; padding:10px; background:#e8f4f8; border-radius:5px; border-left: 4px solid #3498db;"><a href="${m.attachmentUrl}" target="_blank" style="text-decoration:none; font-weight:bold; color:#2980b9;">📎 Click here to download attachment</a></div>` : '';
            const receiptHTML = (m.requireReadReceipt && !isAdminSession) ? 
                (JSON.parse(localStorage.getItem('agentConfirmed') || '[]').includes(m.id) ? 
                    `<div style="text-align:right; color:#27ae60; font-weight:bold; font-size:13px;">✅ Confirmed Read</div>`
                    : `<div style="text-align:right;"><button style="background:#27ae60; color:white; border:none; padding:10px 16px; border-radius:6px; font-weight:bold; cursor:pointer; transition: all 0.3s ease; box-shadow: 0 2px 8px rgba(39,174,96,0.2); font-size:13px;" onmouseover="this.style.background='#229954'; this.style.boxShadow='0 5px 16px rgba(39,174,96,0.35)'; this.style.transform='translateY(-2px)';" onmouseout="this.style.background='#27ae60'; this.style.boxShadow='0 2px 8px rgba(39,174,96,0.2)'; this.style.transform='translateY(0)';" onclick="confirmReadMail('${m.id}', this)">Confirmed Read ✓</button></div>`)
                : (m.requireReadReceipt && isAdminSession) ? 
                `<div style="text-align:right;"><button style="background:#3498db; color:white; border:none; padding:10px 16px; border-radius:6px; font-weight:bold; cursor:pointer; transition: all 0.3s ease; box-shadow: 0 2px 8px rgba(52,152,219,0.2); font-size:13px;" onmouseover="this.style.background='#2980b9'; this.style.boxShadow='0 5px 16px rgba(52,152,219,0.35)'; this.style.transform='translateY(-2px)';" onmouseout="this.style.background='#3498db'; this.style.boxShadow='0 2px 8px rgba(52,152,219,0.2)'; this.style.transform='translateY(0)';" onclick="showReadConfirmations('${m.id}')">Users Confirmed (${(m.readConfirmations || []).length})</button></div>`
                : '';

            // Phase 3: Auto-link text
            let processedContent = m.content || "";
            processedContent = processedContent.replace(/(TICKET-\d+)/g, '<a href="#" style="color:#e74c3c; font-weight:bold; background:#fff3f3; padding:2px 6px; border-radius:4px; text-decoration:none;">$1</a>');

            // Schedule countdown if publishAt exists
            let scheduleHTML = '';
            if (m.publishAt && m.publishAt > new Date().toISOString()) {
                const publishTime = new Date(m.publishAt);
                const now = new Date();
                const diff = publishTime - now;
                const days = Math.floor(diff / (1000 * 60 * 60 * 24));
                const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                const secs = Math.floor((diff % (1000 * 60)) / 1000);
                
                scheduleHTML = `<div style="margin-top:10px; background:#8e44ad; color:white; padding:8px 12px; border-radius:4px; font-weight:bold; font-size:12px; display:inline-block;" id="countdownTab-${m.id}">
                    ⏰ ${days}d ${hours}h ${mins}m ${secs}s
                </div>`;
            }

            document.getElementById("mailBox").innerHTML = `
                <div style="background: #f8f9fa; border: 1px solid #eaeaea; padding: 12px 18px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.03);">
                    <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
                        <span class="${glowClass}" style="background: ${badgeColor}; padding: 4px 12px; border-radius: 6px; color: white; font-weight: bold; font-size: 13px;">
                            ${m.category || 'General'}
                        </span>
                        <span style="color: #ddd;">|</span>
                        <h2 style="margin: 0; color: #2c3e50; font-size: 18px; font-weight: 600;">${m.topic}</h2>
                        <span style="color: #ddd;">|</span>
                        <div style="display: flex; align-items: center; gap: 6px;">
                            <span style="color: #7f8c8d; font-size: 12px; font-weight: bold; text-transform: uppercase;">Tags:</span>
                            ${tagsHTML || '<span style="color:#aaa; font-style:italic; font-size:12px;">none</span>'}
                        </div>
                        <span style="color: #ddd;">|</span>
                        <div style="display: flex; align-items: center; gap: 6px;">
                            <span style="color: #7f8c8d; font-size: 12px; font-weight: bold; text-transform: uppercase;">Keywords:</span>
                            ${(m.keywords || m.sender || "").split(',').map(k => k.trim() ? `<span style="color:#2980b9; font-weight:600; font-size:12px; background:rgba(41,128,185,0.1); padding:2px 8px; border-radius:4px;">${k.trim()}</span>` : '').join('') || '<span style="color:#aaa; font-style:italic; font-size:12px;">none</span>'}
                        </div>
                    </div>
                </div>
                ${scheduleHTML}
                <div class="ql-editor" id="mailBoxContent" style="line-height: 1.8; font-size: 15px; color: #333; padding: 10px; word-wrap: break-word;">${processedContent}</div>
                ${attachHTML}
                ${receiptHTML}
            `;

            // Scroll to match Feature
            if (window.lastSearchTerm && processedContent.toLowerCase().includes(window.lastSearchTerm)) {
                setTimeout(() => {
                    const contentDiv = document.getElementById("mailBoxContent");
                    if (contentDiv) {
                        try {
                            const regex = new RegExp(`(${window.lastSearchTerm})`, 'gi');
                            // Avoid replacing inside HTML tags if possible, simple approach:
                            // we just highlight text nodes to not break Jodit HTML
                            const safeHighlight = (node) => {
                                if (node.nodeType === 3) {
                                    const match = node.nodeValue.match(regex);
                                    if(match) {
                                        const span = document.createElement('span');
                                        span.innerHTML = node.nodeValue.replace(regex, '<mark class="highlighted-text" id="scrollToMatch">$1</mark>');
                                        node.replaceWith(span);
                                    }
                                } else if (node.nodeType === 1 && node.nodeName !== 'SCRIPT' && node.nodeName !== 'STYLE') {
                                    Array.from(node.childNodes).forEach(safeHighlight);
                                }
                            };
                            safeHighlight(contentDiv);
                            const mark = document.getElementById('scrollToMatch');
                            if (mark) mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        } catch(e) {}
                    }
                }, 100);
            }

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

        // Mail preview row
        let previewRow = document.createElement("tr");
        previewRow.className = "preview";
        let contentClean = m.content ? m.content.replace(/<[^>]*>/g, '') : "";
        previewRow.innerHTML = `<td colspan="${getTableColspan()}" style="text-align:left; color:#888; font-size:11px; padding-left:45px; opacity:0.7;">📄 ${contentClean.substring(0, 80)}...</td>`;
        tbody.appendChild(previewRow);
    });

    updateBulkActionsBar();
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
    if (actionBtn) {
        if (userFavorites.includes(id)) {
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
    showToast(newState ? "Mail pinned" : "Mail unpinned", "success");
    await db.collection("mails").doc(id).update({ isPinned: newState });
}

// AGENT PERSONAL FUNCTIONS
function toggleUserPin(id) {
    if (userPinned.includes(id)) {
        userPinned = userPinned.filter(p => p !== id);
        showToast("Personal unpinned", "success");
    } else {
        userPinned.push(id);
        showToast("Pinned to your profile", "success");
    }
    localStorage.setItem('userPinned', JSON.stringify(userPinned));
    refreshDisplay();
}

function userDeleteMail(id) {
    askDeleteMail(id, 'user');
}

function userRestoreMail(id) {
    userDeleted = userDeleted.filter(d => d !== id);
    localStorage.setItem('userDeleted', JSON.stringify(userDeleted));
    showToast("Restored successfully", "success");
    refreshDisplay();
}



async function addNewEntry(isDraft = false) {
    const btn = document.querySelector('#adminSaveButtons button:first-child');
    const originalText = btn ? btn.innerHTML : "Publish";
    if (btn) {
        btn.innerHTML = "Publishing... ⏳";
        btn.style.opacity = "0.7";
        btn.disabled = true;
    }

    // 1. سحب البيانات من الخانات
    const topic = document.getElementById('addTopic').value;
    const idea = document.getElementById('addIdea').value;
    const keywords = document.getElementById('addKeywords').value;
    const expiry = document.getElementById('expiryDate').value;

    // Jodit Content
    const content = joditEditor.value;
    const rawText = joditEditor.value.replace(/<[^>]*>/g, '').trim();

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
    const monthLetters = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];
    const monthStr = monthNames[now.getMonth()];
    const monthLetter = monthLetters[now.getMonth()];
    const dayStr = now.getDate().toString().padStart(2, '0');

    const currentMonthCode = allMails.filter(m => m.code && m.code.includes("-" + monthLetter)).length + 1;
    const autoCode = `${monthStr}${dayStr}-${monthLetter}${currentMonthCode.toString().padStart(2, '0')}`;

    if (!topic || !rawText) return showToast("Please enter Subject and Content", "warning");

    try {
        await db.collection("mails").add({
            code: autoCode,
            topic,
            idea,
            keywords,
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
        showToast(isDraft ? `Code ${autoCode} saved as draft` : `Saved successfully! Code: ${autoCode}`);

        document.querySelectorAll('#adminPanel input').forEach(i => {
            if (i.type !== 'color' && i.type !== 'file') i.value = "";
        });
        document.getElementById('requireReadReceipt').checked = false;
        document.getElementById('isSticky').checked = false;
        joditEditor.value = '';
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
    let container = document.getElementById("toast-container") || Object.assign(document.createElement("div"), { id: "toast-container" });
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
let joditEditor;
document.addEventListener("DOMContentLoaded", function () {
    joditEditor = new Jodit('#editor', {
        placeholder: 'Write Mail Content here...',
        language: 'en',
        direction: 'ltr',
        height: 400,
        allowResizeY: true,
        toolbarButtonSize: 'middle',
        buttons: [
            'bold', 'italic', 'underline', 'strikethrough', '|',
            'font', 'fontsize', '|',
            'brush', 'paragraph', '|',
            'image', 'video', 'table', 'link', '|',
            'align', 'indent', 'outdent', '|',
            'ul', 'ol', '|',
            'superscript', 'subscript', '|',
            'source', 'fullsize', 'print', '|',
            'undo', 'redo', '|',
            'hr', 'eraser', 'copyformat', 'selectall'
        ],
        uploader: { insertImageAsBase64URI: true },
        events: {
            change: function() {
                if (!joditEditor) return;
                const text = joditEditor.value.replace(/<[^>]*>/g, '');
                const el = document.getElementById('charCountDisplay');
                if (el) {
                    el.innerText = text.length + ' chars';
                    el.style.color = text.length > 800 ? 'red' : '#999';
                }
            }
        }
    });
});

window.searchTimeout = null;
window.lastSearchTerm = "";

function debouncedSearch(val) {
    const clearBtn = document.getElementById('searchClear');
    if (clearBtn) clearBtn.style.display = val.length > 0 ? 'inline' : 'none';

    clearTimeout(window.searchTimeout);
    window.searchTimeout = setTimeout(() => {
        executeSearch(val);
    }, 300);
}

function clearSearch() {
    const input = document.getElementById('searchInput');
    if (input) {
        input.value = '';
        debouncedSearch('');
        input.focus();
    }
}

function executeSearch(val) {
    const term = val.trim();
    window.lastSearchTerm = term.toLowerCase();
    const currentViewMails = getVisibleMails();

    const typoEl = document.getElementById('typoSuggestion');
    if (typoEl) typoEl.style.display = 'none';

    if (!term) {
        window.lastSearchTerm = "";
        renderTable(currentViewMails);
        return;
    }

    const options = {
        keys: [
            "code", "topic", "idea", "sender", "keywords", "category", "tags", "content"
        ],
        shouldSort: true,
        threshold: 0.3, 
        ignoreLocation: true,
        minMatchCharLength: 2
    };

    const fuse = new Fuse(currentViewMails, options);
    const result = fuse.search(term);
    
    // Typo suggestion based on common banking context (Feature 3 & 4)
    if (result.length === 0 && term.length >= 3) {
        const bankKeywords = ["loans", "credit cards", "debit", "accounts", "fraud", "policy", "branch", "update", "urgent", "hr", "maintenance", "system down", "interest rate"];
        const typoFuse = new Fuse(bankKeywords, { threshold: 0.4 });
        const spellCheck = typoFuse.search(term);
        if (spellCheck.length > 0 && typoEl) {
            typoEl.innerHTML = `Did you mean: <span onclick="document.getElementById('searchInput').value='${spellCheck[0].item}'; debouncedSearch('${spellCheck[0].item}')">${spellCheck[0].item}</span>?`;
            typoEl.style.display = 'inline-block';
        }
    }

    const filtered = result.map(res => res.item);
    renderTable(filtered);

    // Save to history if not empty
    if (term.length > 2 && filtered.length > 0) {
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
    
    // Feature 4: Inject contextual common top searches if history is empty
    let listToRender = searchHistory;
    if (searchHistory.length === 0) {
        listToRender = ["🔥 Top Search: credit cards", "🔥 Top Search: fraud alerts", "🔥 Top Search: loans policy"];
    }

    box.innerHTML = listToRender.map(term => {
        const cleanTerm = term.replace('🔥 Top Search: ', '');
        return `<div onclick="document.getElementById('searchInput').value='${cleanTerm}'; debouncedSearch('${cleanTerm}')">🕒 ${term}</div>`;
    }).join('');
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
function askDeleteMail(id, mode = 'admin') {
    // حذف أي نسخة قديمة موجودة عشان ميتكررش
    const oldModal = document.getElementById('custom-confirm-modal');
    if (oldModal) oldModal.remove();

    const modalTitle = mode === 'bulk' ? 'Delete selected mails?' : 'Are you sure?';
    const modalBody = mode === 'user'
        ? 'This mail will move to your personal trash only.'
        : mode === 'bulk'
            ? 'The selected mails will move to trash.'
            : 'This mail will move to trash for everyone.';
    const confirmAction = mode === 'bulk'
        ? 'executeBulkDelete()'
        : `executeDelete('${id}', '${mode}')`;

    const modal = document.createElement('div');
    modal.id = 'custom-confirm-modal';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-icon">⚠️</div>
            <h3 style="margin:0 0 10px; color:#333; font-family:sans-serif;">${modalTitle}</h3>
            <p style="color:#666; font-family:sans-serif;">${modalBody}</p>
            <div class="modal-buttons">
                <button class="cancel-btn" onclick="closeConfirmModal()">Cancel</button>
                <button class="confirm-btn" onclick="${confirmAction}">Yes, Delete</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function closeConfirmModal() {
    const modal = document.getElementById('custom-confirm-modal');
    if (modal) modal.remove();
}

async function executeDelete(id, mode = 'admin') {
    closeConfirmModal(); // إغفاء النافذة فوراً لسرعة الاستجابة
    document.querySelectorAll('.actions-container-row').forEach(el => el.remove()); // إخفاء الأزرار فوراً

    if (mode === 'user') {
        if (!userDeleted.includes(id)) {
            userDeleted.push(id);
            localStorage.setItem('userDeleted', JSON.stringify(userDeleted));
        }
        showToast("Moved to your trash", "success");
        refreshDisplay();
        return;
    }

    showToast("Mail moved to trash");
    await db.collection("mails").doc(id).update({ isDeleted: true });
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
                    <div class="btn-restore-style" title="Restore this mail" onclick="restoreMail('${mail.id}')"><span>↩</span></div>
                </div>
            `;
        } else {
            buttonsHTML = `
                <div class="actions-flex-wrapper">
                    <div class="btn-restore-style" title="Restore this mail" onclick="userRestoreMail('${mail.id}')"><span>↩</span></div>
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
                    <div class="action-btn btn-delete" title="Delete for your profile" onclick="askDeleteMail('${mail.id}', 'user')"><span>🗑️</span></div>
                    <div class="action-btn btn-pin ${userPinned.includes(mail.id) ? 'active' : ''}" title="Pin to your profile" onclick="toggleUserPin('${mail.id}')"><span>📌</span></div>
                    <div class="action-btn btn-fav ${userFavorites.includes(mail.id) ? 'active' : ''}" title="Add to Favorites" onclick="toggleFav('${mail.id}')"><span>★</span></div>
                </div>
            `;
        }
    }

    actionsWrapper.innerHTML = `<td colspan="${getTableColspan()}" style="padding:0; border:none; text-align:right;">${buttonsHTML}</td>`;
    if (previewRow) previewRow.after(actionsWrapper);
}
function toggleTrashView() {
    showingTrash = !showingTrash;
    closeWatermarkMenu();

    const btn = document.getElementById("trashBtn");
    if (btn) {
        btn.innerHTML = showingTrash ? "🔙 Back to Inbox" : "🗑️ View Deleted Mails";
        btn.style.background = showingTrash ? "#2e7d32" : "#e74c3c";
    }

    // تنظيف أي أكشن بار مفتوح عشان ميعملش "بج" في العرض الجديد
    document.querySelectorAll('.actions-container-row').forEach(el => el.remove());

    // تحديث البيانات فوراً من المخزن اللي عندنا
    const dataToRender = getVisibleMails();

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
        refreshDisplay();

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
    const content = joditEditor ? joditEditor.value || "No Content" : "No Content";
    const keywords = document.getElementById('addKeywords').value || "No Keywords";
    const category = document.getElementById('addCategory').value;
    const expiry = document.getElementById('expiryDate').value || "No Expiry";

    document.getElementById('previewContentArea').innerHTML = `
        <div style="border: 2px solid #2e7d32; padding: 15px; border-radius: 10px; text-align: left; direction: ltr; background: #fff;">
            <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                <span style="background:#2e7d32; color:white; padding:3px 10px; border-radius:5px; font-size:12px;">${category}</span>
                <small style="color:red;">Expires: ${expiry}</small>
            </div>
            <strong>Subject: ${topic}</strong><br>
            <small>Key words: ${keywords.split(',').map(k => k.trim() ? `<span style="background:#ecf0f1; padding:2px 8px; border-radius:10px; margin-right:5px;">${k.trim()}</span>` : '').join('') || '---'}</small>
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
    // Handled by Jodit editor events
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
    if (e) e.stopPropagation();

    const dropdown = document.getElementById(field + "Dropdown");
    const wasOpen = dropdown.classList.contains("show");

    // Close all first
    document.querySelectorAll(".dropdown-content").forEach(d => d.classList.remove("show"));

    if (!wasOpen) {
        dropdown.classList.add("show");
        populateDropdown(field);
        
        // Auto-focus search input
        const searchInput = dropdown.querySelector('.menu-search');
        if (searchInput) {
            searchInput.value = '';
            searchInput.focus();
        }
    }
}

function filterDropdown(input, field) {
    const term = input.value.toLowerCase();
    const items = document.getElementById(field + "Items").children;
    for (let item of items) {
        const text = item.innerText.toLowerCase();
        item.style.display = text.includes(term) ? "flex" : "none";
    }
}

function populateDropdown(field) {
    const itemsContainer = document.getElementById(field + "Items");
    if (!itemsContainer) return;

    let uniqueValues = [];
    if (field === 'keywords') {
        // Special logic for comma separated keywords
        const allKeywords = [];
        allMails.forEach(m => {
            const keys = (m.keywords || m.sender || "").split(',').map(s => s.trim()).filter(s => s);
            allKeywords.push(...keys);
        });
        uniqueValues = [...new Set(allKeywords)];
    } else {
        uniqueValues = [...new Set(allMails.map(m => m[field] || "---"))];
    }

    uniqueValues.sort();

    itemsContainer.innerHTML = uniqueValues.map(val => `
        <div class="menu-item-option ${activeFilters[field] === val ? 'active' : ''}" onclick="applyFilter('${field}', '${val.replace(/'/g, "\\'")}')">
            ${val}
            ${activeFilters[field] === val ? '<span>✓</span>' : ''}
        </div>
    `).join('');
}

function applyFilter(field, value) {
    if (activeFilters[field] === value) {
        delete activeFilters[field];
    } else {
        activeFilters[field] = value;
    }

    const filtered = allMails.filter(m => {
        return Object.keys(activeFilters).every(f => {
            const filterVal = activeFilters[f];
            if (f === 'keywords') {
                const mailKeys = (m.keywords || m.sender || "").split(',').map(s => s.trim());
                return mailKeys.includes(filterVal);
            }
            return (m[f] || "---") === filterVal;
        });
    });

    renderTable(filtered);
    updateFilterIcon(field);
    
    // Close dropdown after selection
    document.querySelectorAll(".dropdown-content").forEach(d => d.classList.remove("show"));
}

function updateFilterIcon(field) {
    const icon = document.querySelector(`[onclick*="${field}"] .filter-icon`);
    if (!icon) return;
    if (activeFilters[field]) {
        icon.classList.add('active');
        icon.style.opacity = "1";
        icon.style.color = "#f1c40f";
    } else {
        icon.classList.remove('active');
        icon.style.opacity = "0.4";
        icon.style.color = "white";
    }
}

// Global click-to-close for dropdowns
window.addEventListener('click', (e) => {
    if (!e.target.closest('.dropdown')) {
        document.querySelectorAll(".dropdown-content").forEach(d => d.classList.remove("show"));
    }
});
function toggleWatermarkMenu() {
    const menu = document.getElementById("watermarkMenu");
    const icon = document.querySelector(".watermark-icon");

    if (!menu) {
        console.log("❌ العنصر مش موجود");
        return;
    }

    menu.classList.toggle("show");
    
    // Add rotation effect to icon
    if (icon) {
        icon.classList.toggle("rotate");
    }
}

function closeWatermarkMenu() {
    const menu = document.getElementById("watermarkMenu");
    const icon = document.querySelector(".watermark-icon");

    if (menu) menu.classList.remove("show");
    if (icon) icon.classList.remove("rotate");
}

function syncWatermarkMenuByRole() {
    document.querySelectorAll('.admin-menu-item').forEach(item => {
        item.style.display = isAdminSession ? 'inline-flex' : 'none';
    });
    document.querySelectorAll('.agent-menu-item').forEach(item => {
        item.style.display = isAdminSession ? 'none' : 'inline-flex';
    });
}

function showAll() {
    showingTrash = false;
    closeWatermarkMenu();

    // شيلنا أي حاجة مفتوحة
    document.querySelectorAll('.actions-container-row').forEach(el => el.remove());

    // رجع كل الإيميلات
    let data = getVisibleMails();

    // ترتيب الـ pinned
    data.sort((a, b) => (b.isPinned || false) - (a.isPinned || false));

    renderTable(data);
}
function showFavorites() {
    showingTrash = false;
    closeWatermarkMenu();

    document.querySelectorAll('.actions-container-row').forEach(el => el.remove());

    let data = getVisibleMails().filter(m => userFavorites.includes(m.id));

    renderTable(data);
}

// --- Admin Phase 1 Functions ---
let currentlyEditingId = null;

function handleLogout() {
    closeWatermarkMenu();
    isAdminSession = false;
    currentUser = null;
    sessionStorage.removeItem("hdbUser");
    window.location.reload();
}

function logoutAdmin() {
    handleLogout();
}

function openAddPanel() {
    closeWatermarkMenu();
    if (document.getElementById("adminPanel")) {
        document.getElementById("adminPanel").style.display = "flex";
    }
    document.getElementById("adminPanelForm").style.display = "flex";
    document.getElementById('adminSaveButtons').style.display = 'flex';
    document.getElementById('adminUpdateButtons').style.display = 'none';
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function closeAddPanel() {
    if (document.getElementById("adminPanel")) {
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

    if (elTotal) elTotal.innerText = total;
    if (elUrgent) elUrgent.innerText = urgent;
    if (elPinned) elPinned.innerText = pinned;
    if (elTrash) elTrash.innerText = trashed;
}

function renderStickyBanners() {
    const bar = document.getElementById('globalAnnouncementBar');
    const content = document.getElementById('broadcastContent');
    if (!bar || !content) return;

    if (isAdminSession) {
        bar.style.display = 'none';
        return;
    }

    const activeSticky = allMails.filter(m => m.isSticky && !m.isDeleted && !m.isDraft);
    if (activeSticky.length === 0) {
        bar.style.display = 'none';
        return;
    }

    // Check if user already dismissed all these stickies in this session
    if (!window.dismissedStickies) window.dismissedStickies = [];
    const undismissed = activeSticky.filter(m => !window.dismissedStickies.includes(m.id));

    if (undismissed.length === 0) {
        bar.style.display = 'none';
        return;
    }

    const currentMatch = undismissed[0]; // Show one at a time to stay clean
    content.innerHTML = `
        <span style="font-size:18px;">📢</span>
        <span><strong>Urgent Update:</strong> ${currentMatch.topic}</span>
        <button onclick="document.getElementById('searchInput').value = '${currentMatch.code}'; search('${currentMatch.code}');" 
            style="background:white; color:#e74c3c; border:none; padding:4px 12px; border-radius:4px; font-weight:bold; cursor:pointer; font-size:11px; margin-left:10px;">
            View Mail
        </button>
        <button onclick="dismissSticky('${currentMatch.id}')" 
            style="background:rgba(255,255,255,0.2); color:white; border:none; padding:4px 12px; border-radius:4px; cursor:pointer; font-size:11px; margin-left:5px;">
            Dismiss
        </button>
    `;
    bar.style.display = 'flex';
}

function dismissSticky(id) {
    if (!window.dismissedStickies) window.dismissedStickies = [];
    window.dismissedStickies.push(id);
    renderStickyBanners();
}

// ==========================
// Phase 4: Editing, Cloning, Exporting, Bulk Actions
// ==========================

function editMail(id) {
    console.log('editMail called with:', id);
    const mail = allMails.find(m => m.id === id);
    if (!mail) {
        console.error('Mail not found:', id);
        return;
    }
    currentlyEditingId = id;

    const adminPanel = document.getElementById("adminPanel");
    const adminPanelForm = document.getElementById("adminPanelForm");
    const adminSaveButtons = document.getElementById('adminSaveButtons');
    const adminUpdateButtons = document.getElementById('adminUpdateButtons');

    if (adminPanel) adminPanel.style.display = "flex";
    if (adminPanelForm) adminPanelForm.style.display = "flex";
    if (adminSaveButtons) adminSaveButtons.style.display = 'none';
    if (adminUpdateButtons) adminUpdateButtons.style.display = 'flex';

    const topicSelect = document.getElementById('addTopic');
    let optionExists = Array.from(topicSelect.options).some(opt => opt.value === mail.topic);
    if (!optionExists && mail.topic) {
        const newOpt = document.createElement('option');
        newOpt.value = mail.topic;
        newOpt.innerText = mail.topic;
        topicSelect.appendChild(newOpt);
    }
    topicSelect.value = mail.topic || "";

    document.getElementById('addIdea').value = mail.idea || "";
    document.getElementById('addKeywords').value = mail.keywords || mail.sender || "";
    document.getElementById('expiryDate').value = mail.expiryDate || "";

    if (["General", "New Policy", "Update", "Urgent"].includes(mail.category)) {
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
    document.getElementById('uploadStatus').innerText = mail.attachmentUrl ? "Attached 📎" : "No File Selected";

    document.getElementById('publishAt').value = mail.publishAt ? mail.publishAt.substring(0, 16) : "";
    document.getElementById('isSticky').checked = mail.isSticky || false;

    joditEditor.value = mail.content || '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function cloneMail(id) {
    console.log('cloneMail called with:', id);
    editMail(id);
    currentlyEditingId = null;
    
    // Clear the Publish At field for new mail (fresh publish time)
    document.getElementById('publishAt').value = "";
    
    const adminSaveButtons = document.getElementById('adminSaveButtons');
    const adminUpdateButtons = document.getElementById('adminUpdateButtons');
    if (adminSaveButtons) adminSaveButtons.style.display = 'flex';
    if (adminUpdateButtons) adminUpdateButtons.style.display = 'none';
    showToast("Ready to clone: creating new mail 📋", "success");
}

function cancelEdit() {
    currentlyEditingId = null;
    if (document.getElementById('adminPanel')) {
        document.getElementById('adminPanel').style.display = 'none';
    }
    document.getElementById('adminPanelForm').style.display = 'none';
    document.getElementById('adminSaveButtons').style.display = 'flex';
    document.getElementById('adminUpdateButtons').style.display = 'none';

    document.querySelectorAll('#adminPanelForm input').forEach(i => {
        if (i.type !== 'color' && i.type !== 'file') i.value = "";
    });
    joditEditor.value = '';
}

function getTableColspan() {
    return isAdminSession ? 5 : 4;
}

function getSelectedMailIds() {
    return Array.from(document.querySelectorAll('.bulk-cb:checked')).map(cb => cb.value);
}

function handleBulkSelectionChange() {
    updateBulkActionsBar();
}

function updateBulkActionsBar() {
    const bulkBar = document.getElementById('bulkActionsBar');
    const countLabel = document.getElementById('bulkSelectedCount');
    const selected = getSelectedMailIds();
    const totalCheckboxes = document.querySelectorAll('.bulk-cb').length;
    const selectAllCheckbox = document.getElementById('selectAllCheckbox');

    if (!bulkBar || !countLabel) return;

    if (!isAdminSession || selected.length <= 1) {
        bulkBar.style.display = 'none';
    } else {
        bulkBar.style.display = 'flex';
        countLabel.innerText = `${selected.length}`;
    }

    if (selectAllCheckbox) {
        selectAllCheckbox.checked = totalCheckboxes > 0 && selected.length === totalCheckboxes;
        selectAllCheckbox.indeterminate = selected.length > 0 && selected.length < totalCheckboxes;
    }
}

// Confirm Read Function
async function confirmReadMail(id, buttonEl) {
    console.log('confirmReadMail:', id);
    
    if (!currentUser) {
        showToast("Please login first ⚠️", "error");
        return;
    }

    const mail = allMails.find(m => m.id === id);
    if (!mail) return;

    // Save to localStorage first so button doesn't return on refresh
    let agentConfirmed = JSON.parse(localStorage.getItem('agentConfirmed') || '[]');
    if (!agentConfirmed.includes(id)) {
        agentConfirmed.push(id);
        localStorage.setItem('agentConfirmed', JSON.stringify(agentConfirmed));
    }

    // Effect: Fade out button
    buttonEl.style.opacity = '0.5';
    buttonEl.disabled = true;
    buttonEl.innerText = '✅ Confirmed!';
    
    // Fade and remove after delay
    setTimeout(() => {
        buttonEl.style.transition = 'all 0.5s ease';
        buttonEl.style.opacity = '0';
        buttonEl.style.transform = 'scale(0.9)';
        setTimeout(() => {
            buttonEl.remove();
            showToast("✅ Thank you! Read confirmation recorded", "success");
        }, 500);
    }, 800);

    // Sync to Firestore in background - don't wait for it
    // Minimize data to save space (Firestore 1MB limit)
    const confirmationData = {
        u: currentUser.username || currentUser.email,
        t: new Date().toISOString()
    };

    db.collection('mails').doc(id).update({
        readConfirmations: firebase.firestore.FieldValue.arrayUnion(confirmationData)
    }).then(() => {
        console.log('Confirmation synced to database');
    }).catch((e) => {
        console.log('Sync failed but local save ok:', e);
    });
}

// Show read confirmations for admin
function showReadConfirmations(id) {
    const mail = allMails.find(m => m.id === id);
    if (!mail || !mail.readConfirmations || mail.readConfirmations.length === 0) {
        showToast("No confirmations yet", "info");
        return;
    }

    let list = `<div style="text-align: left; direction: ltr;">
        <h3>✅ Confirmations (${mail.readConfirmations.length})</h3>
        <table style="width:100%; border-collapse: collapse;">
            <thead>
                <tr style="background: #2e7d32; color: white;">
                    <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Name</th>
                    <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Time</th>
                </tr>
            </thead>
            <tbody>`;
    
    mail.readConfirmations.forEach(conf => {
        const name = conf.u || conf.username || "Unknown";
        const time = conf.t || conf.confirmationTime || "";
        const date = time ? new Date(time) : new Date();
        const timeStr = date.toLocaleString('en-US');
        list += `
            <tr style="background: #f8f9fa; border-bottom: 1px solid #ddd;">
                <td style="padding: 10px; text-align: left;">${name}</td>
                <td style="padding: 10px; text-align: left;">${timeStr}</td>
            </tr>
        `;
    });
    
    list += `</tbody></table></div>`;
    
    showCustomModal("Confirmations List", list);
}

function showCustomModal(title, content) {
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.5);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 10000;
    `;
    
    modal.innerHTML = `
        <div style="background: white; border-radius: 10px; padding: 20px; max-width: 600px; max-height: 80vh; overflow-y: auto; box-shadow: 0 10px 40px rgba(0,0,0,0.3);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; border-bottom: 2px solid #eee; padding-bottom: 10px;">
                <h2 style="margin: 0; color: #2e7d32;">${title}</h2>
                <button onclick="this.closest('[style*=fixed]').remove()" style="background: #e74c3c; color: white; border: none; width: 30px; height: 30px; border-radius: 50%; cursor: pointer; font-weight: bold;">×</button>
            </div>
            <div>${content}</div>
        </div>
    `;
    
    document.body.appendChild(modal);
    modal.onclick = (e) => {
        if (e.target === modal) modal.remove();
    };
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

    const btn = document.querySelector('#adminUpdateButtons button:first-child');
    const originalText = btn ? btn.innerHTML : "Update";
    if (btn) {
        btn.innerHTML = "Updating... ⏳";
        btn.style.opacity = "0.7";
        btn.disabled = true;
    }

    const topic = document.getElementById('addTopic').value;
    const idea = document.getElementById('addIdea').value;
    const keywords = document.getElementById('addKeywords').value;
    const expiry = document.getElementById('expiryDate').value;

    const content = joditEditor.value;
    const rawText = joditEditor.value.replace(/<[^>]*>/g, '').trim();

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

    if (!topic || !rawText) return showToast("Subject and Content required ⚠️", "error");

    try {
        const docRef = db.collection("mails").doc(currentlyEditingId);
        const snapshot = await docRef.get();
        if (!snapshot.exists) {
            showToast("Mail no longer exists in database ⚠️", "error");
            cancelEdit();
            return;
        }

        const oldMail = snapshot.data();
        const safeUsername = (currentUser && currentUser.username) ? currentUser.username : "System/Unknown";
        
        let auditLog = null;
        try {
            auditLog = {
                modifiedAt: new Date().toISOString(),
                oldTopic: oldMail.topic || "N/A",
                modifiedBy: safeUsername
            };
        } catch (e) {
            console.warn("Could not create audit log:", e);
        }

        const updateData = {
            topic, idea, keywords, content,
            category, categoryColor, tags, requireReadReceipt,
            attachmentUrl, isDraft, publishAt, isSticky,
            expiryDate: expiry || null
        };

        // Trim history to avoid 1MB limit
        let currentHistory = oldMail.history || [];
        if (auditLog) {
            currentHistory.push(auditLog);
        }
        // Keep only the last 10 entries to save space
        if (currentHistory.length > 10) {
            currentHistory = currentHistory.slice(-10);
        }
        updateData.history = currentHistory;

        try {
            await docRef.update(updateData);
        } catch (updateErr) {
            if (updateErr.message.includes('too large') || updateErr.code === 'out-of-range') {
                console.warn("Document too large, emergency clearing history...");
                updateData.history = [auditLog]; // Reset history to just the last one
                await docRef.update(updateData);
            } else {
                throw updateErr;
            }
        }

        cancelEdit();
        showToast("Mail updated successfully 🔄", "success");
    } catch (e) {
        console.error("Update Error:", e);
        showToast(`Update Failed (Size/Limit?): ${e.message}`, "error");
    } finally {
        if (btn) {
            btn.innerHTML = originalText;
            btn.style.opacity = "1";
            btn.disabled = false;
        }
    }
}

function toggleSelectAll() {
    const checked = document.getElementById('selectAllCheckbox').checked;
    document.querySelectorAll('.bulk-cb').forEach(cb => cb.checked = checked);
    updateBulkActionsBar();
}

async function bulkDelete() {
    const selected = getSelectedMailIds();
    if (selected.length === 0) return showToast("Nothing selected ⚠️", "error");
    askDeleteMail(selected.join(','), 'bulk');
}

async function executeBulkDelete() {
    const selected = getSelectedMailIds();
    if (selected.length === 0) {
        closeConfirmModal();
        updateBulkActionsBar();
        return;
    }

    closeConfirmModal();
    document.querySelectorAll('.actions-container-row').forEach(el => el.remove());

    for (let id of selected) {
        await db.collection("mails").doc(id).update({ isDeleted: true });
    }

    showToast(`Deleted ${selected.length} mails ✅`, "success");
    document.getElementById('selectAllCheckbox').checked = false;
    updateBulkActionsBar();
}

function exportToOutlook(id) {
    console.log('exportToOutlook called with:', id);
    const mail = allMails.find(m => m.id === id);
    if (!mail) {
        console.error('Mail not found for export:', id);
        showToast("Mail not found ❌", "error");
        return;
    }

    // Extract clean text from HTML content
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = mail.content;
    const textContent = tempDiv.innerText || tempDiv.textContent;

    // Create a formatted message with all details
    const fullMessage = `📧 HDB Update Export
━━━━━━━━━━━━━━━━━━━━━━
Subject: ${mail.topic}
Code: ${mail.code || 'N/A'}
Key words: ${mail.keywords || mail.sender || 'none'}
Category: ${mail.category || 'General'}
Date: ${new Date().toLocaleDateString()}
━━━━━━━━━━━━━━━━━━━━━━

${textContent}

━━━━━━━━━━━━━━━━━━━━━━
Generated from: HDB Quality Team Portal`;

    // Prepare URL-encoded values
    const subject = encodeURIComponent(`[HDB] ${mail.topic} (${mail.code || 'Update'})`);
    const body = encodeURIComponent(fullMessage);
    
    // Create mailto link
    const mailtoLink = `mailto:?subject=${subject}&body=${body}`;
    
    // Copy to clipboard with better handling
    try {
        // Method 1: Try native clipboard API
        navigator.clipboard.writeText(fullMessage).then(() => {
            console.log('Content copied to clipboard');
            
            // Open Outlook Web in new tab
            const outlookWindow = window.open('https://outlook.office.com/mail/0/compose', '_blank');
            
            if (outlookWindow) {
                showToast("✉️ Outlook opened! Content copied - paste it in the email body", "success");
            } else {
                // If Outlook Web blocked, use mailto
                setTimeout(() => {
                    window.open(mailtoLink, '_blank');
                }, 500);
                showToast("✉️ Email client opened with pre-filled content", "success");
            }
        }).catch(err => {
            console.warn('Clipboard API failed, using mailto:', err);
            // Fallback to mailto if clipboard fails
            window.open(mailtoLink, '_blank');
            showToast("✉️ Email opened with pre-filled content", "success");
        });
    } catch (e) {
        console.error('Export error:', e);
        // Ultimate fallback
        window.open(mailtoLink, '_blank');
        showToast("✉️ Email opened with content", "success");
    }
}

// --- Manage Users Section ---
let usersUnsubscribe = null;

function openManageUsers() {
    closeWatermarkMenu();
    document.getElementById('manageUsersModal').style.display = 'flex';
    document.getElementById('newUserName').value = '';
    document.getElementById('newUserPass').value = '';
    document.getElementById('newUserRole').value = 'agent';

    if (!usersUnsubscribe) {
        window.allUsersCache = []; // For search filtering

        usersUnsubscribe = db.collection('users').onSnapshot(snapshot => {
            const listArea = document.getElementById('usersListArea');
            const searchInput = document.getElementById('userSearchInput');
            
            if (snapshot.docs.length > 5 && searchInput) {
                searchInput.style.display = 'inline-block';
            }

            window.allUsersCache = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            renderUsersAdminList(window.allUsersCache);
        });
    }
}

function renderUsersAdminList(users) {
    const listArea = document.getElementById('usersListArea');
    if (!listArea) return;
    listArea.innerHTML = '';

    users.forEach(u => {
        const roleBadgeClass = u.role === 'admin' ? 'admin-badge-glow' : 'user-badge';
        const avatarStr = (u.username || "U").substring(0, 2);
        
        let lastLoginHTML = u.lastLogin ? `<div style="font-size:10px; color:#95a5a6; margin-top:2px;">🕒 Active: ${new Date(u.lastLogin).toLocaleString()}</div>` : '';
        
        // Hide delete for protected accounts
        const isProtected = ['primary_admin'].includes((u.username||'').toLowerCase());
        const deleteBtnHTML = isProtected ? `<span style="font-size:18px;" title="Protected Account">🛡️</span>` : `<button onclick="deleteDocUser('${u.id}', '${u.username}')" style="background:#e74c3c; color:white; border:none; border-radius:4px; padding:5px 10px; cursor:pointer; font-size:12px;">Delete</button>`;

        listArea.innerHTML += `
            <div class="user-row-admin" data-name="${u.username.toLowerCase()}" style="display:flex; justify-content:space-between; align-items:center; padding:12px 10px; border-bottom:1px solid #eee;">
                <div style="display:flex; align-items:center; gap:10px;">
                    <div class="user-avatar">${avatarStr}</div>
                    <div>
                        <strong style="color:#2c3e50;">${u.username}</strong>
                        <span class="${roleBadgeClass}">${u.role}</span>
                        ${lastLoginHTML}
                    </div>
                </div>
                
                <div style="display:flex; gap:15px; align-items:center;">
                    <div class="pass-container" title="User Password">
                        <input type="password" id="pass_${u.id}" class="pass-input" value="${u.password || ''}" readonly>
                        <button class="icon-btn" onclick="toggleAdminPassVisibility('${u.id}')" title="Show/Hide">👁️</button>
                        <button class="icon-btn" onclick="copyAdminPass('${u.id}')" title="Copy">📋</button>
                    </div>
                    ${deleteBtnHTML}
                </div>
            </div>
        `;
    });
}

function filterUsers() {
    const term = document.getElementById('userSearchInput').value.toLowerCase();
    const filtered = window.allUsersCache.filter(u => u.username.toLowerCase().includes(term));
    renderUsersAdminList(filtered);
}

function toggleAdminPassVisibility(id) {
    const inp = document.getElementById('pass_' + id);
    if (!inp) return;
    if (inp.type === 'password') inp.type = 'text';
    else inp.type = 'password';
}

function copyAdminPass(id) {
    const inp = document.getElementById('pass_' + id);
    if (!inp) return;
    navigator.clipboard.writeText(inp.value).then(() => {
        showToast("Password copied! 📋", "success");
    });
}

async function createNewUser() {
    const username = document.getElementById('newUserName').value.trim();
    const pass = document.getElementById('newUserPass').value.trim();
    const role = document.getElementById('newUserRole').value;

    if (!username || !pass) return showToast("Username and Password required", "error");

    const exists = await db.collection('users').where('username', '==', username).get();
    if (!exists.empty) return showToast("Username already taken", "error");

    await db.collection('users').add({ username, password: pass, role });
    showToast("User created successfully!", "success");
    document.getElementById('newUserName').value = '';
    document.getElementById('newUserPass').value = '';
}

async function deleteDocUser(id, username) {
    if (username === 'admin' && !confirm("Warning: You are deleting the default admin account. Ensure you have another admin created! Proceed?")) {
        return;
    }

    // Protection for Primary Admin
    const protectedNames = ['primary_admin'];
    if (protectedNames.includes(username.toLowerCase())) {
        return showToast("Cannot delete the Primary Admin account!", "error");
    }

    if (confirm(`Are you sure you want to delete user "${username}"?`)) {
        await db.collection('users').doc(id).delete();
        showToast("User successfully removed", "success");
    }
}
