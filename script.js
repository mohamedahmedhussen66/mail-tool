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
// ✅ FIX #15: user-scoped keys — loaded after login in initUserScopedStorage()
let userFavorites = []; // Will be loaded per-user after login
let userPinned = []; // Will be loaded per-user after login
let userDeleted = JSON.parse(localStorage.getItem('userDeleted') || '[]'); // Personal Trash
let readMails = JSON.parse(localStorage.getItem('readMails') || '[]'); // Read status tracking
let searchHistory = JSON.parse(localStorage.getItem('hdbSearchHistory') || '[]');
// ✅ FIX #15: Helper to get user-scoped localStorage keys
function getUserFavKey()  { return `userFavs_${currentUser && currentUser.username ? currentUser.username : 'guest'}`; }
function getUserPinKey()  { return `userPinned_${currentUser && currentUser.username ? currentUser.username : 'guest'}`; }
function initUserScopedStorage() {
    userFavorites = JSON.parse(localStorage.getItem(getUserFavKey()) || '[]');
    userPinned    = JSON.parse(localStorage.getItem(getUserPinKey()) || '[]');
}
const defaultTabTitle = document.title || "HDB - Quality Team Updates";
let tabAlertInterval = null;
let previousUnreadCount = null;
// 2. Load App Options for Dropdowns
let appSettingsOptions = {
    topics: ["Announcement", "Security Alert", "Maintenance"],
    senders: ["HR", "IT", "Management"],
    categories: [
        { name: "General", color: "#95a5a6" },
        { name: "New Policy", color: "#27ae60" },
        { name: "Update", color: "#3498db" },
        { name: "Urgent", color: "#e74c3c" }
    ]
};

db.collection("appSettings").doc("options").onSnapshot((doc) => {
    if (doc.exists) {
        const data = doc.data();
        appSettingsOptions = { ...appSettingsOptions, ...data };
    } else {
        db.collection("appSettings").doc("options").set(appSettingsOptions);
    }
    renderSelectOptions();
});

function renderSelectOptions() {
    const topicSelect    = document.getElementById('addTopic');
    const senderSelect   = document.getElementById('addSender');
    const categorySelect = document.getElementById('addCategory');

    // ✅ FIX #1: Preserve currently selected values before re-rendering
    const prevTopic    = topicSelect    ? topicSelect.value    : null;
    const prevSender   = senderSelect   ? senderSelect.value   : null;
    const prevCategory = categorySelect ? categorySelect.value : null;

    if (topicSelect && appSettingsOptions.topics && appSettingsOptions.topics.length) {
        topicSelect.innerHTML = appSettingsOptions.topics.map(t => `<option value="${t}">${t}</option>`).join('');
        if (prevTopic && topicSelect.querySelector(`option[value="${prevTopic}"]`)) topicSelect.value = prevTopic;
    }
    if (senderSelect && appSettingsOptions.senders && appSettingsOptions.senders.length) {
        senderSelect.innerHTML = appSettingsOptions.senders.map(s => `<option value="${s}">${s}</option>`).join('');
        if (prevSender && senderSelect.querySelector(`option[value="${prevSender}"]`)) senderSelect.value = prevSender;
    }
    if (categorySelect && appSettingsOptions.categories && appSettingsOptions.categories.length) {
        categorySelect.innerHTML =
            appSettingsOptions.categories.map(c =>
                `<option value="${c.name}">${c.name}</option>`
            ).join('') +
            '<option value="Custom">✨ Custom Category</option>';
        // Restore previous selection if still valid
        if (prevCategory && categorySelect.querySelector(`option[value="${prevCategory}"]`)) {
            categorySelect.value = prevCategory;
        }
    }
}

let currentUser = null;
let unsubscribeMails = null;

function updateUserHeartbeat() {
    if (!currentUser || currentUser.role === 'admin') return;
    try {
        db.collection("users").where("username", "==", currentUser.username).get().then(snap => {
            if (!snap.empty) {
                db.collection("users").doc(snap.docs[0].id).update({
                    lastLogin: firebase.firestore.FieldValue.serverTimestamp()
                });
            }
        });
    } catch (e) { console.error("Heartbeat error", e); }
}

// --- UI Helpers ---
function hideAppSplash() {
    const sp = document.getElementById('appSplashLoader');
    if (sp && sp.style.display !== 'none') {
        sp.style.opacity = '0';
        setTimeout(() => { if (sp.parentNode) sp.style.display = 'none'; }, 650);
    }
}

// Safety net: Hide splash after 8 seconds no matter what
setTimeout(hideAppSplash, 8000);

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
            // document.getElementById("adminTopBars").style.display = "block"; // Removed
        } else {
            setupNotificationPermissionPrompt();
        }
        syncWatermarkMenuByRole();
        // ✅ FIX #15: Load user-scoped favorites/pins after currentUser is set
        initUserScopedStorage();
        startAppListeners();

        // --- HEARTBEAT SYSTEM ---
        if (!isAdminSession) {
            updateUserHeartbeat();
            setInterval(updateUserHeartbeat, 3 * 60 * 1000); // Every 3 minutes
        }

        // ── 1. Session Kill Listener ──────────────────────────────────
        db.collection('users').where('username', '==', currentUser.username).onSnapshot(snap => {
            if (snap.empty) {
                sessionStorage.removeItem('hdbUser');
                document.body.innerHTML = "<h2 style='text-align:center;margin-top:50px;font-family:sans-serif;'>Session Ended. You have been removed.</h2>";
                setTimeout(() => window.location.reload(), 2000);
            } else {
                const userData = snap.docs[0].data();
                if (userData.forceLogout) {
                    // Password changed by admin, force logout immediately
                    db.collection('users').doc(snap.docs[0].id).update({ forceLogout: firebase.firestore.FieldValue.delete() });
                    sessionStorage.removeItem('hdbUser');
                    document.body.innerHTML = "<h2 style='text-align:center;margin-top:50px;font-family:sans-serif;'>Your password was reset by an Admin. Please log in again.</h2>";
                    setTimeout(() => window.location.reload(), 2000);
                }
            }
        });

        // ── 2. Force-Pin Listener (Orange banner on ALL agents) ───────
        db.collection('systemSettings').doc('forcePinnedMail').onSnapshot(doc => {
            if (!doc.exists) return;
            const data = doc.data();
            let pin = document.getElementById('forcePinnedBanner');
            if (data.active && data.mailCode) {
                if (!pin) {
                    pin = document.createElement('div');
                    pin.id = 'forcePinnedBanner';
                    pin.style.cssText = 'position:fixed;top:0;left:0;width:100%;background:linear-gradient(90deg,#f39c12,#e67e22);color:white;padding:10px 20px;z-index:99998;display:flex;align-items:center;gap:12px;box-shadow:0 4px 20px rgba(243,156,18,0.5);font-weight:bold;font-size:14px;animation:slideDown 0.4s ease;';
                    document.body.prepend(pin);
                    document.body.style.paddingTop = '44px';
                }
                // Always update HTML to ensure the click action points to the newest code
                pin.innerHTML = `<span style="font-size:20px;">📌</span><span><strong>Management Notice:</strong> Please review mail <span style="text-decoration:underline;cursor:pointer;" onclick="scrollToMail('${data.mailCode}')">${data.mailCode}</span> — pinned by management.</span><style>@keyframes slideDown{from{transform:translateY(-100%)}to{transform:translateY(0)}}</style>`;
            } else {
                if (pin) { pin.remove(); document.body.style.paddingTop = ''; }
            }
        });

        // ── 3. System Commands (Force Read + Personal Warning) ────────
        db.collection('systemCommands').where('active', '==', true).onSnapshot(snap => {
            snap.docChanges().forEach(change => {
                if (change.type !== 'added') return;
                const cmd = change.doc.data();

                // ✅ FIX: if timestamp is null (Firestore pending write, common on slow networks),
                // treat as just sent (age=0) instead of age=999 which always gets filtered out.
                // Also increased window from 90s → 5 min to handle slow connections.
                const age = cmd.timestamp ? (Date.now() - cmd.timestamp.toDate().getTime()) / 1000 : 0;
                if (age > 300) return; // Ignore commands older than 5 minutes

                if (cmd.type === 'forceRead' && (cmd.target === 'all' || cmd.target === currentUser.username)) {
                    showForceReadPopup(cmd.mailCode, change.doc.id);
                }
                if (cmd.type === 'personalWarning' && cmd.target === currentUser.username) {
                    showPersonalWarningPopup(cmd.message, cmd.sentBy, change.doc.id);
                }
            });
        });

        // ── 4. Emergency Broadcast & Poll Listener ─────────────────────
        db.collection('systemBroadcasts').where('active', '==', true).onSnapshot(snap => {
            if (isAdminSession) return; // Hide from admin
            snap.docChanges().forEach(change => {
                if (change.type !== 'added') return;
                const data = change.doc.data();

                // ✅ FIX: same fix — null timestamp treated as age=0, window extended to 5 min
                const age = data.timestamp ? (Date.now() - data.timestamp.toDate().getTime()) / 1000 : 0;
                if (age > 300) return;

                const broadcastId = change.doc.id;
                let dismissed = JSON.parse(localStorage.getItem('dismissedEmergency') || '[]');
                if (dismissed.includes(broadcastId)) return;

                // Route to correct UI based on type
                if (data.type === 'poll' && data.question && data.options) {
                    showAgentPollModal(data.question, data.options, broadcastId);
                } else {
                    showGlobalEmergencyModal(data.title || 'Alert', data.message || '', broadcastId);
                }
            });
        });

        // ── 5. Welcome Message Listener ────────────────────────────────
        db.collection('systemSettings').doc('welcomeMessage').onSnapshot(doc => {
            if (!doc.exists) return;
            const data = doc.data();
            const el = document.getElementById('userNameDisplay');
            if (el && data.text) {
                const h = new Date().getHours();
                const g = h < 12 ? 'Good Morning' : h < 17 ? 'Good Afternoon' : 'Good Evening';
                el.innerText = `${g}, ${currentUser.username} — ${data.text}`;
            }
        });

        // ── 6. Maintenance Mode Listener ───────────────────────────────
        db.collection('systemSettings').doc('maintenanceMode').onSnapshot(doc => {
            if (isAdminSession) return; // Admins bypass maintenance
            if (doc.exists && doc.data().active) {
                const msg = doc.data().message || '🔧 System is under maintenance. Please check back shortly.';
                showMaintenancePage(msg);
            } else {
                const overlay = document.getElementById('maintenance-overlay');
                if (overlay) overlay.remove();
            }
        });

    } else {
        document.getElementById('loginScreen').style.display = 'flex';
        hideAppSplash();
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
                db.collection("users").doc(docRef.id).update({ role: 'admin' }).catch(() => { });
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
    // ✅ FIX #9: Expose publishedMailIds globally so updateExistingEntry can clear it
    if (!window._publishedMailIds) window._publishedMailIds = new Set();
    const publishedMailIds = window._publishedMailIds;

    unsubscribeMails = db.collection("mails").orderBy("createdAt", "desc").onSnapshot((snapshot) => {
        const today = new Date().toISOString().split('T')[0];
        const nowISO = new Date().toISOString();
        let hasNewPublishedMail = false;

        allMails = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(m => {
                if (m.expiryDate && m.expiryDate < today) return false;
                
                // ✅ FIX #9: If agent receives an updated mail that is scheduled in the future, remove it from published cache
                if (m.publishAt && m.publishAt > nowISO && window._publishedMailIds) {
                    window._publishedMailIds.delete(m.id);
                }

                if (isAdminSession) return true;
                if (m.isDraft) return false;
                return true; // Store all valid mails, filter by publishAt in getVisibleMails
            });

        // ✅ FIX #7: If the currently open mail was deleted, close the mailbox immediately
        if (window.currentlyOpenMailId) {
            const openedMail = allMails.find(m => m.id === window.currentlyOpenMailId);
            if (!openedMail || openedMail.isDeleted) {
                closeMailBox();
            }
        }

        refreshDisplay();
        renderStickyBanners();
        updateBadgeCount();
        if (typeof updateAdminStats === 'function') updateAdminStats();

        // Hide splash screen on first Firestore data load
        hideAppSplash();

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
            const newlyPublished = allMails.filter(m => m.publishAt && m.publishAt <= nowISO && !publishedMailIds.has(m.id));
            if (newlyPublished.length > 0) {
                console.log('Syncing scheduled content... ⏱️');
                newlyPublished.forEach(m => publishedMailIds.add(m.id));
                refreshDisplay();
                updateBadgeCount(); // ⭐ Trigger alert immediately when scheduled mail publishes
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

    // Task 1: Removed heavy setInterval polling Firestore for read confirmations.
    // The native onSnapshot listener already handles real-time updates efficiently.
}

function updateBadgeCount() {
    const badge = document.getElementById('unreadBadge');

    // استخدام getVisibleMails المتفلترة عشان المجدول ميتحسبش لحد ما ينزل فعلياً
    const visibleNow = getVisibleMails();
    let unreadCount = 0;

    const agentMailVersions = JSON.parse(localStorage.getItem('agentMailVersions') || '{}');

    visibleNow.forEach(m => {
        let mailVer = m.lastUpdatedAt || m.createdAt?.seconds || "v1";
        let isRead = agentMailVersions[m.id] === mailVer;
        if (!isRead && readMails.includes(m.id) && !m.lastUpdatedAt) isRead = true;
        if (!isRead) unreadCount++;
    });

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
        const visibleNow = getVisibleMails();
        let currentUnread = 0;
        const agentMailVersions = JSON.parse(localStorage.getItem('agentMailVersions') || '{}');

        visibleNow.forEach(m => {
            let mailVer = m.lastUpdatedAt || m.createdAt?.seconds || "v1";
            let isRead = agentMailVersions[m.id] === mailVer;
            if (!isRead && readMails.includes(m.id) && !m.lastUpdatedAt) isRead = true;
            if (!isRead) currentUnread++;
        });

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
// ⭐ تطبيق الفلاتر النشطة
function applyActiveFilters(mailsArray) {
    if (Object.keys(activeFilters).length === 0) return mailsArray;
    return mailsArray.filter(m => {
        return Object.keys(activeFilters).every(f => {
            const filterVal = activeFilters[f];
            if (f === 'keywords') {
                const mailKeys = (m.keywords || m.sender || "").split(',').map(s => s.trim());
                return mailKeys.includes(filterVal);
            }
            return (m[f] || "---") === filterVal;
        });
    });
}

function refreshDisplay() {
    // ⭐ تعديل 1: حفظ scroll position قبل الـ re-render
    const savedScrollY = window.scrollY;

    // 적용 الفلاتر النشطة + السيرش
    let displayData = applyActiveFilters(getVisibleMails());

    if (!showingTrash) {
        displayData.sort((a, b) => {
            const aPinned = a.isPinned || userPinned.includes(a.id) ? 1 : 0;
            const bPinned = b.isPinned || userPinned.includes(b.id) ? 1 : 0;
            return bPinned - aPinned;
        });
    }

    // ⭐ تعديل 1: لو في سيرش نشط — طبّقه تاني بدل ما يتمسح
    if (window.lastSearchTerm) {
        const fuse = new Fuse(displayData, {
            keys: ["code", "topic", "idea", "keywords", "category", "tags", "cleanContent"],
            threshold: 0.0, // EXACT match only
            ignoreLocation: true,
            minMatchCharLength: 2,
            includeMatches: true // ⭐ التعديل 2
        });
        const result = fuse.search(window.lastSearchTerm);
        displayData = result.map(r => {
            r.item._fuseMatches = r.matches;
            return r.item;
        });
    }

    renderTable(displayData);

    // ⭐ تعديل 1: استرجاع scroll position بعد الـ render
    requestAnimationFrame(() => {
        window.scrollTo({ top: savedScrollY, behavior: 'instant' });
    });
}

// ⭐ التعديل 7: Helper function عشان نحسب الأيام، الساعات، والدقايق
function formatTrashTimeLeft(deletedAtISO) {
    if (!deletedAtISO) return "30d 0h 0m";
    const deletedDate = new Date(deletedAtISO);
    const expiry = deletedDate.getTime() + (30 * 24 * 60 * 60 * 1000);
    const diff = expiry - new Date().getTime();

    if (diff <= 0) return "Expired";

    const d = Math.floor(diff / (1000 * 60 * 60 * 24));
    const h = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    return `${d}d ${h}h ${m}m`;
}

// تحديث حي لكل العدادات بتاعة الترَاش كل 10 ثواني عشان تبان بروفيشنال ولايف
setInterval(() => {
    if (!showingTrash || !isAdminSession) return;
    document.querySelectorAll('.live-trash-timer').forEach(el => {
        const deletedAt = el.getAttribute('data-deleted-at');
        if (deletedAt) {
            const newText = formatTrashTimeLeft(deletedAt);
            // لو كان التايمر مستخدم جوه الجدول نضيف ⏳، لو الميل بوكس ممكن نسيب ⏳ بردو
            if (el.innerHTML.includes('Auto-Delete')) {
                el.innerHTML = `⏳ Auto-Delete in: ${newText}`;
            } else {
                el.innerHTML = `⏳ ${newText}`;
            }

            if (newText === 'Expired' || newText.startsWith('0d') || newText.startsWith('1d') || newText.startsWith('2d')) {
                el.style.background = '#c0392b';
            }
        }
    });
}, 10000); // 10 ثواني

function getVisibleMails() {
    const nowISO = new Date().toISOString();
    return allMails.filter(m => {
        // ⭐ التخلص من مشكلة الـ Freeze: تنضيف النص من الـ HTML والـ Base64 للبحث
        if (m.content && !m.cleanContent) {
            let stripped = m.content.replace(/data:image\/[a-zA-Z]*;base64,[^\"]*/g, '');
            stripped = stripped.replace(/<[^>]*>?/gm, ' ');
            m.cleanContent = stripped.substring(0, 5000);
        }

        if (isAdminSession) {
            if (showingTrash) {
                if (!m.isDeleted) return false;
                // ⭐ تعديل 7: إخفاء الميلات المحذوفة من أكتر من 30 يوم من الترَاش لو مش محمية
                if (!m.keepInTrash && m.deletedAt) {
                    const diffDays = (new Date() - new Date(m.deletedAt)) / (1000 * 60 * 60 * 24);
                    if (diffDays >= 30) return false;
                }
                return true;
            } else {
                return !m.isDeleted;
            }
        }

        if (m.isDeleted) return false;

        // Auto-hide scheduled posts for agents
        if (m.publishAt && m.publishAt > nowISO) return false;

        return showingTrash ? userDeleted.includes(m.id) : !userDeleted.includes(m.id);
    });
}

// 3. Render Table
// T13: Builds inline action icons HTML for each mail row
function buildRowInlineActions(m) {
    if (showingTrash) {
        if (isAdminSession) {
            return `
                <span class="row-action-icon" title="Restore" onclick="restoreMail('${m.id}'); event.stopPropagation();">↩</span>
                <span class="row-action-icon danger" title="Delete Forever" onclick="askPermanentDelete('${m.id}'); event.stopPropagation();">✖</span>
            `;
        } else {
            return `<span class="row-action-icon" title="Restore" onclick="userRestoreMail('${m.id}'); event.stopPropagation();">↩</span>`;
        }
    } else {
        if (isAdminSession) {
            const pinned = m.isPinned;
            return `
                <span class="row-action-icon" title="Edit" onclick="editMail('${m.id}'); event.stopPropagation();">✏️</span>
                <span class="row-action-icon" title="Clone" onclick="cloneMail('${m.id}'); event.stopPropagation();">📋</span>
                <span class="row-action-icon ${pinned ? 'active' : ''}" title="${pinned ? 'Unpin' : 'Pin'}" onclick="pinMail('${m.id}'); event.stopPropagation();">📌</span>
                <span class="row-action-icon" title="Export to Outlook" onclick="exportToOutlook('${m.id}'); event.stopPropagation();">✉️</span>
                <span class="row-action-icon danger" title="Delete" onclick="askDeleteMail('${m.id}'); event.stopPropagation();">🗑️</span>
            `;
        } else {
            const pinned = userPinned.includes(m.id);
            const fav = userFavorites.includes(m.id);
            return `
                <span class="row-action-icon ${fav ? 'active' : ''}" title="${fav ? 'Unfavorite' : 'Favorite'}" onclick="toggleFav('${m.id}'); event.stopPropagation();">★</span>
                <span class="row-action-icon ${pinned ? 'active' : ''}" title="${pinned ? 'Unpin' : 'Pin'}" onclick="toggleUserPin('${m.id}'); event.stopPropagation();">📌</span>
                <span class="row-action-icon danger" title="Delete" onclick="askDeleteMail('${m.id}', 'user'); event.stopPropagation();">🗑️</span>
            `;
        }
    }
}

function renderTable(data) {
    const tbody = document.getElementById("tableBody");
    if (!tbody) return;

    // ⭐ تعديل: حفظ الـ Mail اللي كان مفتوح
    const openActionId = window.lastOpenActionMailId || null;

    // استخدام DocumentFragment بيمنع الـ UI Jump بنسبة كبيرة جداً
    const fragment = document.createDocumentFragment();

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

    data.forEach((m) => {
        // ⭐ التعديل 2: تجميع الكلمات المطابقة بالـ Fuzzy Search عشان نعملها Highlight
        let fuzzyWords = [];
        if (m._fuseMatches) {
            let words = new Set();
            m._fuseMatches.forEach(match => {
                let text = m[match.key];
                if (!text || typeof text !== 'string') return;
                match.indices.forEach(([idxStart, idxEnd]) => {
                    let s = idxStart;
                    let e = idxEnd;
                    const boundary = /[\s<>,.:;!?[\]{}()]/;
                    while (s > 0 && !boundary.test(text[s - 1])) s--;
                    while (e < text.length - 1 && !boundary.test(text[e + 1])) e++;
                    let chunk = text.slice(s, e + 1).replace(/<[^>]*>/g, '').trim();
                    if (chunk.length >= 2) words.add(chunk);
                });
            });
            fuzzyWords = Array.from(words);
        }
        m._fuzzyWords = fuzzyWords;

        // Helper for Highlight
        const highlight = (text) => {
            if (!text || !window.lastSearchTerm) return text;
            const allWords = [...(m._fuzzyWords || []), window.lastSearchTerm];
            const escaped = allWords.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
            const uniqueWords = Array.from(new Set(escaped)).sort((a, b) => b.length - a.length);
            const regex = new RegExp(`(${uniqueWords.join('|')})`, 'gi');
            return text.replace(regex, '<mark class="highlighted-text">$1</mark>');
        };

        let row = document.createElement("tr");
        row.setAttribute('data-id', m.id);
        row.style.userSelect = "none"; // Disable text selection

        if ((m.isPinned || userPinned.includes(m.id)) && !showingTrash) {
            row.style.background = "rgba(46, 125, 50, 0.05)";
        }

        let badgeClass = "";
        let badgeStyle = "";

        // ⭐ تعديل 10: سحب اللون من الـ DB بدل الـ Hardcoded
        let targetColor = m.categoryColor || "#95a5a6";
        if (appSettingsOptions.categories) {
            const catObj = appSettingsOptions.categories.find(c => c.name === m.category);
            if (catObj && catObj.color) targetColor = catObj.color;
        }

        const urgentColor = "#e74c3c";
        if (targetColor === urgentColor) {
            badgeClass = "urgent-badge blink-subtle";
            badgeStyle = `style="background: #e74c3c; color: white; padding: 5px 14px; font-weight: 700; border-radius: 20px; font-size: 12px; box-shadow: 0 4px 12px rgba(231,76,60,0.4);"`;
        } else {
            // T11: Enhanced badge styles with dynamic color
            badgeClass = "category-badge custom-cat";
            badgeStyle = `style="background: ${targetColor}15; color: ${targetColor}; border: 1px solid ${targetColor}40; padding: 5px 14px; font-weight: 700; border-radius: 20px; font-size: 12px; box-shadow: 0 2px 8px ${targetColor}30;"`;
        }

        let mailVer = m.lastUpdatedAt || m.createdAt?.seconds || "v1";
        let isRead = false;

        if (isAdminSession) {
            let adminRead = JSON.parse(localStorage.getItem('adminReadMails') || '[]');
            isRead = adminRead.includes(m.id);
        } else {
            let agentMailVersions = JSON.parse(localStorage.getItem('agentMailVersions') || '{}');
            isRead = agentMailVersions[m.id] === mailVer;
            if (!isRead && readMails.includes(m.id) && !m.lastUpdatedAt) {
                isRead = true;
            }
        }

        // ✅ FIX #8: Admins should NOT see unread red markers — agents only
        if (!isRead && !showingTrash && !isAdminSession) {
            row.classList.add("unread-row");
        }

        let selectHtml = isAdminSession ? `<td style="width:40px; text-align:center;"><input type="checkbox" class="bulk-cb" value="${m.id}" onclick="event.stopPropagation()" onchange="handleBulkSelectionChange()"></td>` : ``;

        // ⭐ التعديل 7: Countdown للترَاش للأدمن
        let trashTimerHtml = '';
        if (showingTrash && isAdminSession && m.isDeleted) {
            const timeText = formatTrashTimeLeft(m.deletedAt);
            const color = (timeText === 'Expired' || timeText.startsWith('0d') || timeText.startsWith('1d') || timeText.startsWith('2d')) ? '#c0392b' : '#d35400';

            if (m.keepInTrash) {
                trashTimerHtml = `
                    <span title="Protected (Kept Forever)" style="background:#2c3e50; color:#f1c40f; padding:2px 6px; border-radius:4px; font-size:10px; font-weight:bold; margin-right:5px; box-shadow:0 1px 3px rgba(0,0,0,0.2);">🛡️ Protected</span>
                    <span title="Remove Protection" style="cursor:pointer; background:rgba(231,76,60,0.1); color:#c0392b; padding:2px 6px; border-radius:4px; font-size:11px; margin-right:5px; transition: 0.2s;" onmouseover="this.style.background='rgba(231,76,60,0.3)'" onmouseout="this.style.background='rgba(231,76,60,0.1)'" onclick="toggleKeepInTrash('${m.id}', false); event.stopPropagation();">✖</span>
                `;
            } else {
                trashTimerHtml = `
                    <span class="live-trash-timer" data-deleted-at="${m.deletedAt || ''}" style="background:${color}; color:white; padding:2px 6px; border-radius:4px; font-size:10px; font-weight:bold; margin-right:5px; box-shadow:0 1px 3px rgba(0,0,0,0.2);">⏳ ${timeText}</span>
                    <span title="Protect from Auto-Delete" style="cursor:pointer; font-size:14px; margin-right:5px; transition: 0.2s; filter: grayscale(100%); opacity: 0.6;" onmouseover="this.style.filter='grayscale(0%)'; this.style.opacity='1'" onmouseout="this.style.filter='grayscale(100%)'; this.style.opacity='0.6'" onclick="toggleKeepInTrash('${m.id}', true); event.stopPropagation();">🛡️</span>
                `;
            }
        }

        row.innerHTML = `
            ${selectHtml}
            <td style="white-space: nowrap; width: 180px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <div style="width: 35px; display: flex; gap: 2px; justify-content: center; align-items: center;">
                        <span style="color:#f1c40f; font-size: 14px;">${userFavorites.includes(m.id) ? '★' : ''}</span>
                        <span style="font-size: 14px;">${m.isPinned || userPinned.includes(m.id) ? '📌' : ''}</span>
                    </div>
                    
                    <span style="font-weight: bold; color: #2e7d32; min-width: 65px;">${m.code}</span>
                    
                    ${trashTimerHtml}
                    <span class="${badgeClass}" ${badgeStyle}>
                        ${m.category || 'General'}
                    </span>
                    ${m.isDraft ? '<span title="Draft" style="background:#f39c12; color:white; padding:2px 6px; border-radius:4px; font-size:9px; margin-left:2px;">Draft</span>' : ''}
                    ${m.publishAt && m.publishAt > new Date().toISOString() ? '<span title="Scheduled" style="background:#8e44ad; color:white; padding:2px 6px; border-radius:4px; font-size:9px; margin-left:2px;">Scheduled</span>' : ''}
                </div>
            </td>
            
            <td style="font-weight: 500;">${highlight(m.topic)}</td>
            <td>${highlight(m.idea) || '---'}</td>
            <td>
                <div style="display:flex; flex-wrap:wrap; gap:2px;">
                    ${(m.keywords || m.sender || "").split(',').map(k => k.trim() ? `<span style="background:rgba(46,125,50,0.1); color:#2e7d32; padding:3px 8px; border-radius:12px; font-size:11px; font-weight:bold; margin:2px; display:inline-block;">${highlight(k.trim())}</span>` : '').join('') || '---'}
                </div>
            </td>
        `;

        // === Row hover: show inline actions only (no floating bar) ===
        // Inline actions are revealed via CSS opacity on .row-inline-actions

        // Single click action (show content and mark as read)
        row.onclick = (e) => {
            if (e.target.closest('.bulk-cb')) return;

            // ⭐ تتبع الميل المعروض حالياً لتنفيذ Auto Refresh في حالة تعديله
            window.currentlyOpenMailId = m.id;

            const glowClass = m.category === "Urgent" ? "alert-glow" : "";
            const tagsHTML = (m.tags && m.tags.length > 0) ? m.tags.map(t => `<span style="background:#eee; padding:2px 6px; border-radius:10px; font-size:11px; margin-right:5px;">#${t}</span>`).join('') : '';
            const attachHTML = m.attachmentUrl ? `<div style="margin-top:15px; padding:10px; background:#e8f4f8; border-radius:5px; border-left: 4px solid #3498db;"><a href="${m.attachmentUrl}" target="_blank" style="text-decoration:none; font-weight:bold; color:#2980b9;">📎 Click here to download attachment</a></div>` : '';
            // ⭐ تعديل 9: الزرار يتغير لونه لو ده تحديث، والميل يتأكد بناءً على نسخته
            let receiptHTML = '';
            if (m.requireReadReceipt && !isAdminSession) {
                let agentConfirmedVersions = JSON.parse(localStorage.getItem('agentConfirmedVersions') || '{}');
                const isConfirmed = agentConfirmedVersions[m.id] === mailVer;

                if (isConfirmed) {
                    receiptHTML = `<div style="text-align:right; color:#27ae60; font-weight:bold; font-size:13px;">✅ Confirmed Read</div>`;
                } else {
                    const btnColor = m.lastUpdatedAt ? '#f39c12' : '#27ae60';
                    const btnHover = m.lastUpdatedAt ? '#e67e22' : '#229954';
                    const btnText = m.lastUpdatedAt ? 'Confirm Updated Read ✓' : 'Confirmed Read ✓';
                    receiptHTML = `<div style="text-align:right;"><button style="background:${btnColor}; color:white; border:none; padding:10px 16px; border-radius:6px; font-weight:bold; cursor:pointer; transition: all 0.3s ease; box-shadow: 0 2px 8px rgba(0,0,0,0.15); font-size:13px;" onmouseover="this.style.background='${btnHover}'; this.style.transform='translateY(-2px)';" onmouseout="this.style.background='${btnColor}'; this.style.transform='translateY(0)';" onclick="confirmReadMail('${m.id}', this, '${mailVer}')">${btnText}</button></div>`;
                }
            } else if (m.requireReadReceipt && isAdminSession) {
                receiptHTML = `<div style="text-align:right;"><button style="background:#3498db; color:white; border:none; padding:10px 16px; border-radius:6px; font-weight:bold; cursor:pointer; font-size:13px;" onclick="showReadConfirmations('${m.id}')">Users Confirmed (${(m.readConfirmations || []).length})</button></div>`;
            }

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

            // ⭐ التعديل 7: أزرار الحماية وعداد الترَاش جوه الميل بوكس كمان
            let innerTrashHtml = '';
            if (showingTrash && isAdminSession && m.isDeleted) {
                if (m.keepInTrash) {
                    innerTrashHtml = `
                       <span style="background:#2c3e50; color:#f1c40f; padding:4px 10px; border-radius:6px; font-size:12px; font-weight:bold; box-shadow:0 2px 5px rgba(0,0,0,0.1); margin-right: 8px;">🛡️ Protected (Forever)</span>
                       <button style="background:none; border:1px solid #c0392b; color:#c0392b; padding:3px 8px; border-radius:4px; cursor:pointer; font-size:11px; font-weight:bold; margin-right:8px; transition:0.2s;" onmouseover="this.style.background='rgba(231,76,60,0.1)'" onmouseout="this.style.background='none'" onclick="toggleKeepInTrash('${m.id}', false); event.stopPropagation();">Remove Protection ✖</button>
                   `;
                } else {
                    const timeText = formatTrashTimeLeft(m.deletedAt);
                    const color = (timeText === 'Expired' || timeText.startsWith('0d') || timeText.startsWith('1d') || timeText.startsWith('2d')) ? '#c0392b' : '#d35400';
                    innerTrashHtml = `
                       <span class="live-trash-timer" data-deleted-at="${m.deletedAt || ''}" style="background:${color}; color:white; padding:4px 10px; border-radius:6px; font-size:12px; font-weight:bold; box-shadow:0 2px 5px rgba(0,0,0,0.1); margin-right: 8px;">⏳ Auto-Delete in: ${timeText}</span>
                       <button style="background:#2e7d32; border:none; color:white; padding:4px 10px; border-radius:6px; cursor:pointer; font-size:11px; font-weight:bold; margin-right:8px; display:flex; align-items:center; gap:4px; transition:0.2s;" onmouseover="this.style.background='#1b5e20'" onmouseout="this.style.background='#2e7d32'" onclick="toggleKeepInTrash('${m.id}', true); event.stopPropagation();">🛡️ Protect</button>
                   `;
                }
            }

            // === Build category color & keywords highlight ===
            const URGENT_KEYWORDS = ['urgent', 'عاجل', 'critical', 'immediate', 'هام', 'خطير', 'error', 'alert', 'التعديل العاجل'];
            const KEY_HIGHLIGHT = (m.keywords || m.sender || '').split(',').map(k => k.trim().toLowerCase()).filter(Boolean);

            // Highlight keywords and urgent words in content (Safe regex to ignore HTML attributes — FIX Image Bug)
            let highlightedContent = processedContent;
            KEY_HIGHLIGHT.forEach(kw => {
                if (!kw) return;
                const re = new RegExp(`(?![^<]*>)(${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
                highlightedContent = highlightedContent.replace(re, `<span class="mail-keyword-highlight">$1</span>`);
            });
            URGENT_KEYWORDS.forEach(kw => {
                const re = new RegExp(`(?![^<]*>)\\b(${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})\\b`, 'gi');
                highlightedContent = highlightedContent.replace(re, `<span class="mail-keyword-urgent">$1</span>`);
            });

            // Author initial for footer avatar
            const authorName = m.author || m.createdBy || 'Admin';
            const authorInitial = authorName.charAt(0).toUpperCase();

            // Date formatting
            const mailDate = m.createdAt ? new Date(m.createdAt.seconds * 1000).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' }) : '';

            // Category label color
            const catColors = { 'Urgent': '#e74c3c', 'New Policy': '#27ae60', 'Update': '#3498db', 'General': '#7f8c8d' };
            const catColor = catColors[m.category] || targetColor;
            const catBg = `linear-gradient(135deg, ${catColor}, ${catColor}cc)`;

            // ✅ FIX #3: Real-time date and time in Arabic
            function relativeTime(ts) {
                if (!ts) return '';
                const d = ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
                return d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) + ' - ' + d.toLocaleDateString('ar-EG');
            }
            const liveTime = relativeTime(m.createdAt);

            // Smart attachment HTML
            let smartAttachHTML = '';
            if (m.attachmentUrl) {
                const url = m.attachmentUrl;
                const ext = url.split('.').pop().toLowerCase().split('?')[0];
                const attachColors = { pdf: '#e74c3c', doc: '#2980b9', docx: '#2980b9', xls: '#27ae60', xlsx: '#27ae60', jpg: '#e67e22', jpeg: '#e67e22', png: '#e67e22', gif: '#9b59b6' };
                const aColor = attachColors[ext] || '#7f8c8d';
                const aIcon = { pdf: '📄', doc: '📝', docx: '📝', xls: '📊', xlsx: '📊', jpg: '🖼️', jpeg: '🖼️', png: '🖼️' }[ext] || '📥';
                smartAttachHTML = `<div style="margin-top:14px; padding:10px 14px; background:rgba(0,0,0,0.03); border-radius:10px; border-left:4px solid ${aColor}; display:flex; align-items:center; gap:10px;">
                    <span style="font-size:22px;">${aIcon}</span>
                    <div><a href="${url}" target="_blank" style="font-weight:700; color:${aColor}; text-decoration:none; font-size:13px;">Open Attachment</a>
                    <div style="font-size:11px; color:#aaa; text-transform:uppercase; letter-spacing:0.5px;">${ext.toUpperCase()}</div></div></div>`;
            }

            // Apply number highlighting + language detection
            highlightedContent = enhanceMailContent(highlightedContent);
            const contentDir = detectContentDirection(processedContent);

            const generatedMailBoxHTML = `
                <!-- HEADER -->
                <div class="mail-box-header">
                    <div class="mail-box-meta">
                        ${innerTrashHtml}
                        <span style="background:${catBg}; color:white; font-weight:700; font-size:12px; padding:4px 12px; border-radius:20px; letter-spacing:0.3px; box-shadow:0 2px 6px ${catColor}44;">${m.category || 'General'}</span>
                        ${m.tags && m.tags.length > 0 ? m.tags.map(t => `<span style="background:rgba(0,0,0,0.06); color:#555; padding:3px 9px; border-radius:20px; font-size:11px;">#${t}</span>`).join('') : ''}
                        <h2 class="mail-box-topic">${m.topic || ''}</h2>
                    </div>
                    <div class="mail-box-actions">
                        ${m.historyLog && m.historyLog.length > 0 && isAdminSession ? `<button class="mail-box-action-btn" onclick="addRipple(event,this); showHistoryLog('${m.id}')" title="Edit History">🕐</button>` : ''}
                        <button class="mail-box-minimize-btn" onclick="addRipple(event,this); toggleSidePanelMode()" title="Side Panel" style="font-size:12px;">┃□</button>
                        <div class="font-size-ctrl">
                            <button class="mail-box-action-btn" style="width:26px;height:26px;font-size:13px;"
                                onmousedown="startFontSizeHold(-1)" onmouseup="stopFontSizeHold()" onmouseleave="stopFontSizeHold()" title="Decrease font">A₋</button>
                            <span id="mailFontSizeVal">15</span>
                            <button class="mail-box-action-btn" style="width:26px;height:26px;font-size:13px;"
                                onmousedown="startFontSizeHold(1)" onmouseup="stopFontSizeHold()" onmouseleave="stopFontSizeHold()" title="Increase font">A⁺</button>
                        </div>
                        <button class="mail-box-action-btn" onclick="addRipple(event,this); copyMailContent()" title="Copy content">📋</button>
                        ${isAdminSession ? `<button class="mail-box-action-btn" onclick="addRipple(event,this); window.print()" title="Print">🖨️</button>` : ''}
                        <button class="mail-box-action-btn" data-zen-btn onclick="addRipple(event,this); toggleMailZenMode(!document.getElementById('mailBox').classList.contains('zen-mode'))" title="Full Screen">⛶</button>
                        <button class="mail-box-action-btn danger" onclick="addRipple(event,this); closeMailBox()" title="Close">✕</button>
                    </div>
                </div>

                <!-- BODY -->
                <div class="mail-box-body-wrap">
                    <div class="mail-box-body" id="mailBoxBody" onscroll="checkMailFade()">
                        ${scheduleHTML}
                        <div class="ql-editor" id="mailBoxContent" style="line-height:1.85; font-size:15px; color:#2c3e50; word-wrap:break-word; direction:${contentDir}; text-align:${contentDir === 'rtl' ? 'right' : 'left'}">${highlightedContent}</div>
                        ${smartAttachHTML}
                        ${receiptHTML}
                    </div>
                    <div class="mail-box-fade-bottom" id="mailBoxFade"></div>
                    <div class="mail-box-scroll-arrow" id="mailBoxArrow" onclick="document.getElementById('mailBoxBody').scrollBy({top:120,behavior:'smooth'})">&#8964;</div>
                    <div class="mail-box-scroll-top" id="mailBoxScrollTop" title="Back to top" onclick="document.getElementById('mailBoxBody').scrollTo({top:0,behavior:'smooth'})">↑</div>
                </div>

                <!-- FOOTER -->
                <div class="mail-box-footer">
                    <div class="mail-box-footer-author">
                        <!-- ✅ FIX #3: Removed 'Published by Admin' — show timestamp bubble only -->
                        <span class="mail-time-bubble" id="mailLiveTime" data-ts="${m.createdAt ? (m.createdAt.seconds || '') : ''}">🕐 ${liveTime}</span>
                        ${renderDeadlineChip(m.expiryDate || '')}
                    </div>
                    <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                        ${(m.keywords || m.sender || '').split(',').filter(k => k.trim()).map(k => `<span style="background:rgba(41,128,185,0.1); color:#2980b9; font-weight:600; font-size:11px; padding:2px 8px; border-radius:4px;">${k.trim()}</span>`).join('')}
                    </div>
                </div>
            `;
            const dummyBox = document.createElement('div');
            dummyBox.innerHTML = generatedMailBoxHTML;
            const currentMailBox = document.getElementById("mailBox");
            if (currentMailBox.innerHTML !== dummyBox.innerHTML) {
                // ✅ FIX #7: Prevent layout jump by saving/restoring scroll instantly
                const mailBoxBody = document.getElementById('mailBoxBody');
                const prevScroll = mailBoxBody ? mailBoxBody.scrollTop : 0;
                currentMailBox.innerHTML = generatedMailBoxHTML;
                if (prevScroll > 0) {
                    const newBody = document.getElementById('mailBoxBody');
                    if (newBody) newBody.scrollTop = prevScroll;
                }
            }

            // Set category data attribute for dynamic shadow
            currentMailBox.setAttribute('data-category', m.category || 'General');

            // Restore reading position
            const savedPos = JSON.parse(localStorage.getItem('mailReadPos') || '{}');
            const bodyEl = document.getElementById('mailBoxBody');
            if (bodyEl && savedPos[m.id]) {
                setTimeout(() => { bodyEl.scrollTop = savedPos[m.id]; }, 50);
            }

            // Save reading position on scroll
            if (bodyEl) {
                bodyEl.onscroll = () => {
                    const pos = JSON.parse(localStorage.getItem('mailReadPos') || '{}');
                    pos[m.id] = bodyEl.scrollTop;
                    localStorage.setItem('mailReadPos', JSON.stringify(pos));
                    checkMailFade();
                };
            }

            // Restore font size
            const savedFs = parseInt(localStorage.getItem('mailFontSize') || '15');
            if (savedFs !== 15) {
                const content = document.getElementById('mailBoxContent');
                const fsVal = document.getElementById('mailFontSizeVal');
                if (content) content.style.fontSize = savedFs + 'px';
                if (fsVal) fsVal.textContent = savedFs;
            }

            // Initial fade check
            setTimeout(checkMailFade, 80);

            // Row lift animation
            // Show the mail box with animation (Zero-State -> Visible)
            if (!currentMailBox.classList.contains('visible')) {
                currentMailBox.style.display = 'block';
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        currentMailBox.classList.add('visible');
                    });
                });
            }

            // ⭐ التعديل 2: Scroll to match (Fuzzy + Exact) Feature
            if (window.lastSearchTerm) {
                setTimeout(() => {
                    const contentDiv = document.getElementById("mailBoxContent");
                    if (contentDiv) {
                        try {
                            const allWords = [...(m._fuzzyWords || []), window.lastSearchTerm];
                            const escapedWords = allWords.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
                            const uniqueWords = Array.from(new Set(escapedWords)).sort((a, b) => b.length - a.length);
                            const regex = new RegExp(`(${uniqueWords.join('|')})`, 'gi');
                            let firstMatchFound = false;

                            const safeHighlight = (node) => {
                                if (node.nodeType === 3) {
                                    if (regex.test(node.nodeValue)) {
                                        regex.lastIndex = 0; // reset
                                        const span = document.createElement('span');
                                        span.innerHTML = node.nodeValue.replace(regex, (match) => {
                                            const idStr = !firstMatchFound ? ' id="scrollToMatch"' : '';
                                            firstMatchFound = true;
                                            return `<mark class="highlighted-text"${idStr}>${match}</mark>`;
                                        });
                                        node.replaceWith(span);
                                    }
                                } else if (node.nodeType === 1 && node.nodeName !== 'SCRIPT' && node.nodeName !== 'STYLE' && node.nodeName !== 'MARK') {
                                    Array.from(node.childNodes).forEach(safeHighlight);
                                }
                            };
                            safeHighlight(contentDiv);
                            const mark = document.getElementById('scrollToMatch');
                            if (mark) mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        } catch (e) { }
                    }
                }, 100);
            }

            // ⭐ وضع علامة مقروء بشكل منفصل للأدمن والايجنت عشان المراجعة على نفس الجهاز
            if (isAdminSession) {
                let adminRead = JSON.parse(localStorage.getItem('adminReadMails') || '[]');
                if (!adminRead.includes(m.id)) {
                    adminRead.push(m.id);
                    localStorage.setItem('adminReadMails', JSON.stringify(adminRead));
                    row.classList.remove("unread-row");
                }
            } else {
                let currentVersions = JSON.parse(localStorage.getItem('agentMailVersions') || '{}');
                if (currentVersions[m.id] !== mailVer) {
                    currentVersions[m.id] = mailVer;
                    localStorage.setItem('agentMailVersions', JSON.stringify(currentVersions));

                    if (!readMails.includes(m.id)) {
                        readMails.push(m.id);
                        localStorage.setItem('readMails', JSON.stringify(readMails));
                    }

                    updateBadgeCount();
                    row.classList.remove("unread-row");
                }
            }

            document.querySelectorAll("tr").forEach(r => r.classList.remove("selected"));
            row.classList.add("selected");
        };
        fragment.appendChild(row);

        // M2+T13: Preview row — click opens mail, icons in right col
        let previewRow = document.createElement("tr");
        previewRow.className = "preview";
        previewRow.setAttribute("data-id", m.id);
        let contentClean = m.content ? m.content.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim() : "";
        // M2: Max 200 chars to keep single line
        const previewText = contentClean.length > 200 ? contentClean.substring(0, 200) + '…' : contentClean;

        const emptyRightCols = 1;
        const textCols = getTableColspan() - emptyRightCols;

        previewRow.innerHTML = `
            <td colspan="${textCols}" style="text-align: right; padding-right: 15px; color: #555; direction: rtl; cursor: pointer; max-width: 0; width: 100%;" title="Click to open this mail">
                <div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block; width: 100%;">📄 ${previewText}</div>
            </td>
            <td colspan="${emptyRightCols}" style="padding: 4px 8px; border-top:none; background:transparent; vertical-align:middle; width: 120px;">
                <div class="row-inline-actions" style="display:flex; justify-content:flex-end; gap:6px;">
                    ${buildRowInlineActions(m)}
                </div>
            </td>
        `;
        // M2: Clicking the preview text opens the mail (same as clicking the main row)
        previewRow.querySelector('td:first-child').addEventListener('click', function(e) {
            e.stopPropagation();
            row.click();
        });
        fragment.appendChild(previewRow);
    });

    // ⭐ ذكاء التحديث: تحديث الجدول فقط إذا كان هناك تغيير حقيقي (يمنع الـ UI Jump)
    const dummyTbody = document.createElement('div');
    dummyTbody.appendChild(fragment.cloneNode(true));
    const newHTML = dummyTbody.innerHTML;

    const currentClone = tbody.cloneNode(true);
    currentClone.querySelectorAll('.actions-container-row').forEach(el => el.remove());
    currentClone.querySelectorAll('.selected').forEach(el => el.classList.remove('selected'));

    if (currentClone.innerHTML === newHTML) {
        // لم يحدث تغيير مرئي في الجدول، نحدث محتوى الـ mailBox فقط إذا كان مفتوح
        if (window.currentlyOpenMailId) {
            const openedRow = tbody.querySelector(`tr[data-id="${window.currentlyOpenMailId}"]`);
            if (openedRow && document.getElementById('mailBox').innerHTML !== "") {
                openedRow.onclick({ target: openedRow });
            }
        }
        updateBulkActionsBar();
        return;
    }

    // إضافة كلاس التحديد (selected) للعنصر المفتوح حالياً قبل الاستبدال
    if (window.currentlyOpenMailId) {
        const rowToSelect = fragment.querySelector(`tr[data-id="${window.currentlyOpenMailId}"]`);
        if (rowToSelect) rowToSelect.classList.add('selected');
    }

    // إضافة الدوكيومنت فراجمنت فجأة واحدة
    tbody.innerHTML = "";
    tbody.appendChild(fragment);

    // استرجاع الأكشن بار لو كان مفتوح
    if (openActionId) {
        const restoredRow = Array.from(tbody.querySelectorAll('tr')).find(r => r.getAttribute('data-id') === openActionId);
        if (restoredRow) {
            const fakeEvent = { currentTarget: restoredRow };
            const matchedMail = data.find(m => m.id === openActionId);
            if (matchedMail) {
                showMailActions(fakeEvent, matchedMail);
            }
        }
    }

    // ⭐ تحديث الـ Mail Box تلقائيا لو الميل اللي معروض حاليا حصله أبديت
    if (window.currentlyOpenMailId) {
        const openedRow = tbody.querySelector(`tr[data-id="${window.currentlyOpenMailId}"]`);
        if (openedRow && document.getElementById('mailBox').innerHTML !== "") {
            openedRow.onclick({ target: openedRow });
        }
    }

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
    // ✅ FIX #15: Save with user-scoped key
    localStorage.setItem(getUserFavKey(), JSON.stringify(userFavorites));

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
    // ✅ FIX #15: Save with user-scoped key
    localStorage.setItem(getUserPinKey(), JSON.stringify(userPinned));
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
        document.getElementById('publishAt').value = "";
        checkCustomCategory();
    } catch (e) {
        console.error(e);
        showToast("Error adding entry", "error");
    } finally {
        const btn = document.querySelector('#adminSaveButtons button:first-child');
        if (btn) {
            btn.innerHTML = originalText || "Publish";
            btn.style.opacity = "1";
            btn.disabled = false;
        }
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

// ── Per-Paragraph Smart Direction — Outlook-like bidi ──────────────
// The core algorithm: finds the FIRST strong directional character
// (ignoring numbers, spaces, punctuation) to determine paragraph direction.
function getStrongDir(text) {
    for (let i = 0; i < text.length; i++) {
        const code = text.charCodeAt(i);
        // Arabic / Arabic Supplement / Arabic Presentation Forms
        if ((code >= 0x0600 && code <= 0x06FF) || (code >= 0x0750 && code <= 0x077F) || (code >= 0xFE70 && code <= 0xFEFF)) return 'rtl';
        // Basic Latin letters (A-Z, a-z)
        if ((code >= 0x0041 && code <= 0x005A) || (code >= 0x0061 && code <= 0x007A)) return 'ltr';
        // Extended Latin, Cyrillic, Greek, Hebrew, etc.
        if (code >= 0x00C0 && code <= 0x024F) return 'ltr';
    }
    return null; // neutral (numbers/punctuation only)
}

function applySmartDirection(editorEl) {
    if (!editorEl) return;
    editorEl.querySelectorAll('p, li, h1, h2, h3, h4, blockquote, td, th').forEach(el => {
        // Skip if manually locked by user (has explicit dir attribute set by RTL/LTR buttons)
        if (el.dataset.dirLocked) return;
        const text = (el.innerText || el.textContent || '').trim();
        if (!text) return;
        const dir = getStrongDir(text);
        if (dir === 'rtl') { el.dir = 'rtl'; el.style.textAlign = 'right'; }
        else if (dir === 'ltr') { el.dir = 'ltr'; el.style.textAlign = 'left'; }
        // neutral → keep current direction (don't change)
    });
    updateDirIndicator(editorEl);
}

function updateDirIndicator(editorEl) {
    const indicator = document.getElementById('dirStatusIndicator');
    if (!indicator || !editorEl) return;
    try {
        const selection = (editorEl.ownerDocument || document).getSelection();
        if (!selection || selection.rangeCount === 0) return;
        const range = selection.getRangeAt(0);
        const node = range.startContainer;
        const block = (node.nodeType === 3 ? node.parentElement : node).closest('p,li,h1,h2,h3,h4,div,blockquote');
        if (block) {
            const dir = block.dir || 'rtl';
            indicator.textContent = dir === 'rtl' ? '← RTL' : 'LTR →';
            indicator.style.color = dir === 'rtl' ? '#27ae60' : '#3498db';
        }
    } catch(e) {}
}

// ── Fix All Directions at once ─────────────────────────────────────
function fixAllDirections() {
    if (!joditEditor || !joditEditor.editor) return;
    const editorEl = joditEditor.editor;
    editorEl.querySelectorAll('p, li, h1, h2, h3, h4, blockquote, td, th').forEach(el => {
        el.removeAttribute('data-dir-locked');
        const text = (el.innerText || el.textContent || '').trim();
        if (!text) return;
        const dir = getStrongDir(text);
        if (dir === 'rtl') { el.dir = 'rtl'; el.style.textAlign = 'right'; }
        else if (dir === 'ltr') { el.dir = 'ltr'; el.style.textAlign = 'left'; }
    });
    showToast('All paragraph directions fixed ✅', 'success');
}

// ── Inline Direction Tag (for one word inside a line) ─────────────
function inlineDirectionTag() {
    if (!joditEditor) return;
    const selected = joditEditor.selection.html;
    if (!selected || !selected.trim()) {
        showToast('Select a word or text first', 'warning');
        return;
    }
    const dir = getStrongDir(selected) || 'ltr';
    const opposite = dir === 'rtl' ? 'ltr' : 'rtl';
    joditEditor.selection.insertHTML(
        `<span dir="${opposite}" style="unicode-bidi:embed;">${selected}</span>`
    );
}

// 7. Enhanced Jodit Editor — with RTL fix + new features
let joditEditor;

// ── Auto-Save Draft System ─────────────────────────────────────────
let autoSaveTimer = null;
function triggerAutoSave() {
    clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(() => {
        if (!joditEditor) return;
        const content = joditEditor.value;
        if (content && content.trim() !== '<p><br></p>') {
            localStorage.setItem('adminDraftContent', content);
            localStorage.setItem('adminDraftSaved', new Date().toLocaleTimeString());
            const el = document.getElementById('autoSaveStatus');
            if (el) { el.innerText = '💾 Draft saved at ' + new Date().toLocaleTimeString(); el.style.color = '#27ae60'; }
        }
    }, 30000); // Auto-save every 30 seconds
}

// ── Per-Paragraph Smart Direction (the RTL fix core) ───────────────
function applySmartDirection(editorEl) {
    if (!editorEl) return;
    editorEl.querySelectorAll('p, div, li, h1, h2, h3, h4, blockquote').forEach(el => {
        const text = (el.innerText || el.textContent || '').trim();
        if (!text) return;
        // Find first "strong directional" character
        for (let i = 0; i < Math.min(text.length, 30); i++) {
            const code = text.charCodeAt(i);
            const isArabic = (code >= 0x0600 && code <= 0x06FF) || (code >= 0x0750 && code <= 0x077F) || (code >= 0xFE70 && code <= 0xFEFF);
            const isLatin  = (code >= 0x0041 && code <= 0x007A);
            if (isArabic) { el.dir = 'rtl'; el.style.textAlign = 'right'; break; }
            if (isLatin)  { el.dir = 'ltr'; el.style.textAlign = 'left';  break; }
        }
    });
}

// ── Custom Jodit Buttons ───────────────────────────────────────────
const joditCustomButtons = {
    // RTL Toggle
    rtlBtn: {
        name: 'rtlBtn',
        iconURL: '',
        tooltip: 'Set RTL (Arabic) — Alt+Shift',
        text: '⇐ RTL',
        exec(editor) {
            // ✅ FIX: selection.current() can return a text node — must get parentElement
            const currentNode = editor.s.current();
            const el = currentNode
                ? (currentNode.nodeType === 3 ? currentNode.parentElement : currentNode)
                : null;
            const block = el ? el.closest('p,div,li,h1,h2,h3,h4,blockquote') : null;
            if (block) {
                block.dir = 'rtl';
                block.style.textAlign = 'right';
                block.dataset.dirLocked = '1';
            } else {
                editor.s.insertHTML('<p dir="rtl" style="text-align:right"><br></p>');
            }
        }
    },
    // LTR Toggle
    ltrBtn: {
        name: 'ltrBtn',
        iconURL: '',
        tooltip: 'Set LTR (English) — Alt+Shift',
        text: 'LTR ⇒',
        exec(editor) {
            // ✅ FIX: same text node guard
            const currentNode = editor.s.current();
            const el = currentNode
                ? (currentNode.nodeType === 3 ? currentNode.parentElement : currentNode)
                : null;
            const block = el ? el.closest('p,div,li,h1,h2,h3,h4,blockquote') : null;
            if (block) {
                block.dir = 'ltr';
                block.style.textAlign = 'left';
                block.dataset.dirLocked = '1';
            } else {
                editor.s.insertHTML('<p dir="ltr" style="text-align:left"><br></p>');
            }
        }
    },
    // Info Callout
    infoBox: {
        name: 'infoBox', text: 'ℹ️ Info', tooltip: 'Insert Info Box',
        exec(editor) { editor.s.insertHTML('<div style="background:#e8f4f8;border-left:4px solid #3498db;padding:12px 16px;border-radius:6px;margin:10px 0"><strong>ℹ️ Note:</strong> Write content here...</div>'); }
    },
    // Warning Callout
    warnBox: {
        name: 'warnBox', text: '⚠️ Warning', tooltip: 'Insert Warning Box',
        exec(editor) { editor.s.insertHTML('<div style="background:#fef9e7;border-left:4px solid #f39c12;padding:12px 16px;border-radius:6px;margin:10px 0"><strong>⚠️ Warning:</strong> Write content here...</div>'); }
    },
    // Danger Callout
    dangerBox: {
        name: 'dangerBox', text: '🔴 Urgent', tooltip: 'Insert Urgent Box',
        exec(editor) { editor.s.insertHTML('<div style="background:#fdedec;border-left:4px solid #e74c3c;padding:12px 16px;border-radius:6px;margin:10px 0"><strong>🔴 Urgent:</strong> Write content here...</div>'); }
    },
    // Success Callout
    successBox: {
        name: 'successBox', text: '✅ Success', tooltip: 'Insert Success Box',
        exec(editor) { editor.s.insertHTML('<div style="background:#eafaf1;border-left:4px solid #27ae60;padding:12px 16px;border-radius:6px;margin:10px 0"><strong>✅ Success:</strong> Write content here...</div>'); }
    },
    // Divider
    divider: {
        name: 'divider', text: '── Divider', tooltip: 'Insert Divider',
        exec(editor) { editor.s.insertHTML('<hr style="border:none;border-top:2px solid #2e7d32;margin:20px 0;opacity:0.4">'); }
    },
    // Priority Badge
    priorityBadge: {
        name: 'priorityBadge', text: '🏷️ Priority', tooltip: 'Insert Priority Badge',
        exec(editor) {
            const priority = prompt('Choose priority: urgent / important / info');
            const map = {
                urgent:    { bg: '#e74c3c', text: '🔴 Urgent' },
                important: { bg: '#f39c12', text: '🟡 Important' },
                info:      { bg: '#3498db', text: '🔵 Info' }
            };
            const p = map[priority] || map['info'];
            editor.s.insertHTML(`<span style="background:${p.bg};color:white;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:bold;margin:0 4px;">${p.text}</span>`);
        }
    },
    // Checklist
    checkList: {
        name: 'checkList', text: '☑️ Checklist', tooltip: 'Insert Checklist',
        exec(editor) { editor.s.insertHTML('<ul style="list-style:none;padding:0"><li style="margin:6px 0">☑️ Item 1</li><li style="margin:6px 0">☑️ Item 2</li><li style="margin:6px 0">☑️ Item 3</li></ul>'); }
    },
    // Fix All Directions
    fixAllDirs: {
        name: 'fixAllDirs', text: '🔧 Fix Dir', tooltip: 'Fix All Paragraphs Direction (like Outlook)',
        exec(editor) { fixAllDirections(); }
    },
    // Inline Direction (flip selected word)
    inlineDir: {
        name: 'inlineDir', text: '↔️ Inline', tooltip: 'Flip direction of selected text (for one English word inside Arabic)',
        exec(editor) { inlineDirectionTag(); }
    },
    // Arabic Quotes converter
    arabicQuotes: {
        name: 'arabicQuotes', text: '« »', tooltip: 'Wrap selection in Arabic quotes «»',
        exec(editor) {
            const sel = editor.s.html || '';
            if (sel && sel.trim()) {
                editor.s.insertHTML(`«${sel}»`);
            } else {
                editor.s.insertHTML('«Write here»');
            }
        }
    },
    // Quote Block
    quoteBlock: {
        name: 'quoteBlock', text: '❝ Quote', tooltip: 'Insert Quote Block',
        exec(editor) {
            const sel = editor.s.html || '';
            const content = sel && sel.trim() ? sel : 'Write quote here...';
            editor.s.insertHTML(`<blockquote style="border-right:4px solid #2e7d32;border-left:none;padding:10px 16px;margin:12px 0;background:rgba(46,125,50,0.06);border-radius:0 8px 8px 0;font-style:italic;color:#2c3e50">${content}</blockquote>`);
        }
    },
    // Code Block
    codeBlock: {
        name: 'codeBlock', text: '&lt;/&gt; Code', tooltip: 'Insert Code Block',
        exec(editor) {
            const sel = editor.s.html || '';
            const content = sel && sel.trim() ? sel : 'code here...';
            editor.s.insertHTML(`<pre style="background:#1e2e1e;color:#a8ff78;padding:14px 18px;border-radius:8px;font-family:'Courier New',monospace;font-size:13px;margin:12px 0;overflow-x:auto;direction:ltr;text-align:left">${content}</pre>`);
        }
    },
    // Mail Templates
    mailTemplate: {
        name: 'mailTemplate', text: '📋 Template', tooltip: 'Insert a pre-built mail template',
        exec(editor) {
            const templates = [
                { label: '1 — Maintenance Notice', html: '<p><strong>🔧 Scheduled Maintenance Notice</strong></p><p>Please be advised that the system will undergo scheduled maintenance on <strong>[DATE]</strong> from <strong>[TIME]</strong> to <strong>[TIME]</strong>.</p><p>During this period, services will be temporarily unavailable. We apologize for any inconvenience.</p><p>For urgent matters, please contact your supervisor directly.</p>' },
                { label: '2 — Policy Update', html: '<p><strong>📋 Policy Update</strong></p><p>Effective <strong>[DATE]</strong>, the following policy change will be in effect:</p><p>[Describe the policy change here]</p><p>All staff are required to acknowledge this update by <strong>[DEADLINE]</strong>.</p>' },
                { label: '3 — Urgent Alert', html: '<div style="background:#fdedec;border-left:4px solid #e74c3c;padding:12px 16px;border-radius:6px;margin:10px 0"><strong>🔴 URGENT:</strong> Immediate action required.</div><p>[Describe the situation and required action]</p><p>Please respond as soon as possible.</p>' },
                { label: '4 — General Announcement', html: '<p><strong>📢 Announcement</strong></p><p>Dear Team,</p><p>[Write announcement content here]</p><p>Thank you for your cooperation.</p>' },
            ];
            const chosen = prompt('Choose template:\n' + templates.map(t => t.label).join('\n') + '\n\nType number (1-' + templates.length + '):');
            const idx = parseInt(chosen) - 1;
            if (idx >= 0 && idx < templates.length) {
                editor.s.insertHTML(templates[idx].html);
            }
        }
    },
    // Focus Mode toggle
    focusMode: {
        name: 'focusMode', text: '🔍 Focus', tooltip: 'Toggle Focus Mode (fullscreen editor)',
        exec(editor) {
            const container = editor.container;
            if (!container) return;
            if (container.classList.contains('hdb-focus-mode')) {
                container.classList.remove('hdb-focus-mode');
                document.body.classList.remove('hdb-focus-overlay');
            } else {
                container.classList.add('hdb-focus-mode');
                document.body.classList.add('hdb-focus-overlay');
            }
        }
    },
    // Version History
    versionHistory: {
        name: 'versionHistory', text: '🕐 History', tooltip: 'Save/restore version history (last 10)',
        exec(editor) {
            const action = prompt('Version History:\n1 — Save current version\n2 — List & restore saved versions\n\nType 1 or 2:');
            if (action === '1') {
                const versions = JSON.parse(localStorage.getItem('editorVersions') || '[]');
                versions.unshift({ time: new Date().toLocaleString(), html: editor.value });
                if (versions.length > 10) versions.length = 10;
                localStorage.setItem('editorVersions', JSON.stringify(versions));
                if (typeof showToast === 'function') showToast('Version saved ✅ (' + versions.length + '/10)', 'success');
            } else if (action === '2') {
                const versions = JSON.parse(localStorage.getItem('editorVersions') || '[]');
                if (!versions.length) { alert('No saved versions yet.'); return; }
                const list = versions.map((v, i) => `${i + 1}. ${v.time}`).join('\n');
                const pick = parseInt(prompt('Saved versions:\n' + list + '\n\nType number to restore:')) - 1;
                if (pick >= 0 && pick < versions.length) {
                    editor.value = versions[pick].html;
                    if (typeof showToast === 'function') showToast('Version restored ✅', 'success');
                }
            }
        }
    }
};

// Register all custom buttons
Object.values(joditCustomButtons).forEach(btn => { try { Jodit.plugins.add(btn.name, function(){}); } catch(e){} });

// ============================================================
//  🖼️  IMAGE MANAGEMENT HELPERS
// ============================================================

// 1. Resize image via canvas before inserting (max 900px, 85% quality)
function compressImageDataUrl(dataUrl, callback, maxW = 900) {
    const img = new Image();
    img.onload = () => {
        let w = img.width, h = img.height;
        if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        callback(canvas.toDataURL('image/jpeg', 0.85), w, h);
    };
    img.onerror = () => callback(dataUrl, 0, 0); // fallback: use original
    img.src = dataUrl;
}

// 2. Clean Word/Outlook HTML — strip XML junk, keep images and text structure
function cleanWordHtml(html) {
    return html
        // Remove conditional comments (Word markup)
        .replace(/<!--\[if[\s\S]*?\[endif\]-->/gi, '')
        // Remove Office/Word XML namespaced tags
        .replace(/<\/?o:[^>]*>/gi, '')
        .replace(/<\/?w:[^>]*>/gi, '')
        .replace(/<\/?m:[^>]*>/gi, '')
        // Remove Word-specific style attributes
        .replace(/\s+style="[^"]*mso-[^"]*"/gi, '')
        .replace(/\s+class="Mso[A-Za-z]+"/gi, '')
        // Remove empty paragraphs Word loves to add
        .replace(/<p[^>]*>\s*(&nbsp;|\u00a0)?\s*<\/p>/gi, '')
        // Remove <span> wrappers but keep content
        .replace(/<span(?!\s+dir)[^>]*>([\s\S]*?)<\/span>/gi, '$1')
        // Clean up multiple spaces/newlines
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

// 3. Image toolbar — integrated as a secondary row in the Jodit toolbar header
function setupImageClickControls(editorEl) {
    if (!editorEl) return;

    // Find the Jodit toolbar container to inject our row into
    const joditContainer = editorEl.closest('.jodit-container') || document.querySelector('.jodit-container');
    if (!joditContainer) return;

    // Remove any existing image toolbar row
    const old = document.getElementById('hdb-img-toolbar-row');
    if (old) old.remove();

    // ── Build the premium secondary toolbar row ─────────────────
    const row = document.createElement('div');
    row.id = 'hdb-img-toolbar-row';
    row.style.cssText = [
        'display:none',
        'align-items:center',
        'gap:8px',
        'flex-wrap:nowrap',
        'overflow-x:auto',
        'padding:7px 14px',
        'background:linear-gradient(90deg,rgba(39,174,96,0.07),rgba(39,174,96,0.02))',
        'border-top:1px solid rgba(39,174,96,0.18)',
        'border-bottom:1px solid rgba(39,174,96,0.1)',
        'font-family:Poppins,sans-serif',
        'animation:imgRowSlide 0.25s cubic-bezier(.175,.885,.32,1.275)',
        'scrollbar-width:thin',
        'scrollbar-color:rgba(39,174,96,0.3) transparent'
    ].join(';');

    // Inject premium styles once
    if (!document.getElementById('hdb-img-row-style')) {
        const s = document.createElement('style');
        s.id = 'hdb-img-row-style';
        s.textContent = [
            '@keyframes imgRowSlide {',
            '  from{opacity:0;transform:translateY(-10px) scale(.98)}',
            '  to{opacity:1;transform:translateY(0) scale(1)}',
            '}',
            '#hdb-img-toolbar-row::-webkit-scrollbar{height:3px}',
            '#hdb-img-toolbar-row::-webkit-scrollbar-thumb{background:rgba(39,174,96,.35);border-radius:4px}',
            '.hdb-itr-group{display:flex;align-items:center;gap:3px;background:rgba(255,255,255,.55);padding:3px 4px;border-radius:9px;border:1px solid rgba(0,0,0,.05)}',
            '.hdb-itr-group button{background:transparent;border:none;color:#2c3e50;padding:4px 10px;border-radius:6px;font-size:11px;cursor:pointer;font-family:inherit;font-weight:500;transition:all .18s ease;white-space:nowrap;line-height:1}',
            '.hdb-itr-group button:hover{background:rgba(39,174,96,.18);color:#27ae60;transform:translateY(-1px)}',
            '.hdb-itr-group button.hdb-active{background:#27ae60;color:#fff}',
            '.hdb-itr-group button.hdb-danger{color:#e74c3c}',
            '.hdb-itr-group button.hdb-danger:hover{background:rgba(231,76,60,.15)}',
            '.hdb-itr-sep{width:1px;height:22px;background:rgba(39,174,96,.2);margin:0 4px;flex-shrink:0}',
            '.hdb-itr-label{font-size:12px;font-weight:700;color:#27ae60;padding:0 4px;white-space:nowrap;flex-shrink:0}',
            '.hdb-itr-dim{font-size:10px;font-weight:600;color:#27ae60;padding:4px 9px;border:1px dashed rgba(39,174,96,.45);border-radius:6px;background:rgba(39,174,96,.06);min-width:68px;text-align:center;flex-shrink:0;font-variant-numeric:tabular-nums}'
        ].join('\n');
        document.head.appendChild(s);
    }

    row.innerHTML = [
        '<span class="hdb-itr-label">\u2728 Image Studio</span>',
        '<div class="hdb-itr-sep"></div>',
        // Alignment group
        '<div class="hdb-itr-group">',
        '  <button data-cmd="float-left" title="Float Left">\u21a4 Left</button>',
        '  <button data-cmd="center" title="Center">\u25aa Center</button>',
        '  <button data-cmd="float-right" title="Float Right">Right \u21a6</button>',
        '  <button data-cmd="full-width" title="Full Width">\u2194 Full</button>',
        '</div>',
        '<div class="hdb-itr-sep"></div>',
        // Size group
        '<div class="hdb-itr-group">',
        '  <button data-cmd="size-small" title="Small 200px">S</button>',
        '  <button data-cmd="size-medium" title="Medium 400px">M</button>',
        '  <button data-cmd="size-large" title="Large 700px">L</button>',
        '  <button data-cmd="size-original" title="Original Size">1:1</button>',
        '</div>',
        '<span class="hdb-itr-dim" id="hdb-img-dimensions">\u2014 \u00d7 \u2014</span>',
        '<div class="hdb-itr-sep"></div>',
        // Style group
        '<div class="hdb-itr-group">',
        '  <button data-cmd="toggle-rounded" title="Toggle Rounded Corners">\ud83d\udd32 Round</button>',
        '  <button data-cmd="toggle-shadow" title="Toggle Shadow">\ud83d\udca1 Shadow</button>',
        '  <button data-cmd="toggle-border" title="Toggle Border">\ud83d\uddf3 Border</button>',
        '  <button data-cmd="toggle-opacity" title="Toggle 70% Opacity">\ud83c\udf2b\ufe0f Fade</button>',
        '</div>',
        '<div class="hdb-itr-sep"></div>',
        // Actions group
        '<div class="hdb-itr-group">',
        '  <button data-cmd="add-caption" title="Add/Edit Caption">\ud83d\udcdd Caption</button>',
        '  <button data-cmd="duplicate-img" title="Duplicate Image">\u29c9 Clone</button>',
        '  <button data-cmd="reset-style" title="Reset all styles">\u21ba Reset</button>',
        '  <button data-cmd="delete-img" class="hdb-danger" title="Delete Image">\ud83d\uddd1 Delete</button>',
        '</div>'
    ].join('');

    // Insert the row right after the toolbar box inside Jodit container
    const toolbarBox = joditContainer.querySelector('.jodit-toolbar__box');
    if (toolbarBox) {
        toolbarBox.parentNode.insertBefore(row, toolbarBox.nextSibling);
    } else {
        joditContainer.prepend(row); // fallback
    }

    let _selectedImg = null;

    function showRow(img) {
        _selectedImg = img;
        img.style.outline = '2.5px solid #2ecc71';
        img.style.outlineOffset = '3px';
        img.style.transition = 'outline .15s ease, box-shadow .2s ease';
        // Sync active states for toggle buttons
        _syncToggleButtons(img);
        // Show dimensions
        _updateDim();
        row.style.display = 'flex';
    }

    function hideRow() {
        if (_selectedImg) {
            _selectedImg.style.outline = '';
            _selectedImg.style.outlineOffset = '';
            _selectedImg.style.transition = '';
        }
        _selectedImg = null;
        row.style.display = 'none';
    }

    function _updateDim() {
        const dimEl = document.getElementById('hdb-img-dimensions');
        if (dimEl && _selectedImg) {
            const r = _selectedImg.getBoundingClientRect();
            dimEl.textContent = Math.round(r.width) + ' \u00d7 ' + Math.round(r.height);
        }
    }

    function _syncToggleButtons(img) {
        const buttons = row.querySelectorAll('[data-cmd]');
        buttons.forEach(btn => {
            const c = btn.dataset.cmd;
            if (c === 'toggle-rounded') btn.classList.toggle('hdb-active', !!img.style.borderRadius && img.style.borderRadius !== '50%');
            if (c === 'toggle-shadow')  btn.classList.toggle('hdb-active', !!img.style.boxShadow);
            if (c === 'toggle-border')  btn.classList.toggle('hdb-active', !!img.style.borderWidth);
            if (c === 'toggle-opacity') btn.classList.toggle('hdb-active', img.style.opacity && img.style.opacity !== '1');
        });
    }

    // Show row when clicking any image in editor
    editorEl.addEventListener('click', e => {
        if (e.target && e.target.tagName === 'IMG') {
            showRow(e.target);
        } else {
            hideRow();
        }
    });

    // Handle commands
    row.addEventListener('click', e => {
        const cmd = e.target.closest('[data-cmd]')?.dataset.cmd;
        if (!cmd || !_selectedImg) return;
        const img = _selectedImg;

        switch(cmd) {
            // ── Alignment ────────────────────────────────────────
            case 'float-left':
                img.style.cssText += ';float:left;margin:0 18px 10px 0;display:block';
                break;
            case 'float-right':
                img.style.cssText += ';float:right;margin:0 0 10px 18px;display:block';
                break;
            case 'center':
                img.style.float = 'none';
                img.style.display = 'block';
                img.style.margin = '15px auto';
                break;
            case 'full-width':
                img.style.width = '100%';
                img.style.height = 'auto';
                img.style.float = 'none';
                img.style.display = 'block';
                img.style.margin = '15px 0';
                break;
            // ── Sizes ─────────────────────────────────────────────
            case 'size-small':    img.style.width = '200px'; img.style.height = 'auto'; break;
            case 'size-medium':   img.style.width = '400px'; img.style.height = 'auto'; break;
            case 'size-large':    img.style.width = '700px'; img.style.height = 'auto'; break;
            case 'size-original': img.style.width = ''; img.style.height = ''; break;
            // ── Toggle Styles ──────────────────────────────────────
            case 'toggle-rounded':
                img.style.borderRadius = img.style.borderRadius && img.style.borderRadius !== '50%' ? '' : '12px';
                break;
            case 'toggle-shadow':
                img.style.boxShadow = img.style.boxShadow ? '' : '0 10px 32px rgba(0,0,0,0.18)';
                break;
            case 'toggle-border':
                if (img.style.borderWidth) {
                    img.style.border = '';
                } else {
                    img.style.border = '2px solid #27ae60';
                    img.style.borderRadius = img.style.borderRadius || '6px';
                }
                break;
            case 'toggle-opacity':
                img.style.opacity = (img.style.opacity && img.style.opacity !== '1') ? '1' : '0.65';
                break;
            // ── Actions ───────────────────────────────────────────
            case 'reset-style':
                const savedCursor = 'grab';
                img.removeAttribute('style');
                img.style.maxWidth = '100%';
                img.style.cursor = savedCursor;
                break;
            case 'duplicate-img': {
                const clone = img.cloneNode(true);
                clone.style.cursor = 'grab';
                img.parentNode.insertBefore(clone, img.nextSibling);
                if (typeof showToast === 'function') showToast('Image duplicated \u2705', 'success');
                break;
            }
            case 'add-caption': {
                // If already in figure, edit existing caption
                const existingFig = img.closest('figure');
                if (existingFig) {
                    const existingCap = existingFig.querySelector('figcaption');
                    const newCap = prompt('Edit caption:', existingCap ? existingCap.textContent : '');
                    if (newCap !== null) {
                        if (existingCap) existingCap.textContent = newCap;
                        else {
                            const fc2 = document.createElement('figcaption');
                            fc2.style.cssText = 'font-size:13px;color:#7f8c8d;margin-top:8px;font-style:italic;text-align:center';
                            fc2.textContent = newCap;
                            existingFig.appendChild(fc2);
                        }
                    }
                } else {
                    const cap = prompt('Enter image caption:');
                    if (cap) {
                        const fig = document.createElement('figure');
                        fig.style.cssText = 'display:block;margin:15px auto;text-align:center;max-width:100%;clear:both';
                        img.parentNode.insertBefore(fig, img);
                        fig.appendChild(img);
                        const fc = document.createElement('figcaption');
                        fc.style.cssText = 'font-size:13px;color:#7f8c8d;margin-top:8px;font-style:italic;text-align:center';
                        fc.textContent = cap;
                        fig.appendChild(fc);
                    }
                }
                break;
            }
            case 'delete-img':
                if (confirm('Delete this image?')) {
                    const wrapper = img.closest('figure') || img;
                    wrapper.remove();
                    hideRow();
                    return;
                }
                break;
        }
        _syncToggleButtons(img);

        // Update dimension display after commands
        _updateDim();
        img.style.outline = '2.5px solid #2ecc71';
        img.style.outlineOffset = '3px';
    });

    // Escape key clears selection
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && _selectedImg) hideRow();
    });

    // Hide row when clicking outside editor
    document.addEventListener('click', e => {
        if (!editorEl.contains(e.target) &&
            !row.contains(e.target) &&
            !e.target.closest('.hdb-resize-handle') &&
            !e.target.closest('#hdb-img-resizer')) {
            hideRow();
        }
    });
}


// ============================================================
//  🔲  IMAGE RESIZE — Inline wrapper handles (scroll-safe, like Word)
// ============================================================
function setupImageResizer() {
    if (!document.getElementById('hdb-resize-style')) {
        const s = document.createElement('style');
        s.id = 'hdb-resize-style';
        s.textContent = [
            // Wrapper
            '.hdb-img-wrapper{position:relative;display:inline-block;line-height:0;vertical-align:bottom;',
            'outline:2px solid #2ecc71;outline-offset:2px;cursor:default;transition:outline .15s ease}',
            '.hdb-img-wrapper img{display:block;-webkit-user-drag:none;user-select:none}',
            // Corner handles — round squares
            '.hdb-resize-handle{position:absolute;z-index:10000;box-sizing:border-box;',
            'background:#fff;border:2px solid #2ecc71;border-radius:3px;',
            'transition:background .15s ease,transform .1s ease}',
            '.hdb-resize-handle:hover{background:#2ecc71;transform:scale(1.3)}',
            // Corner handles: 10×10
            '.hdb-rh-corner{width:10px;height:10px}',
            // Side handles: pill shape
            '.hdb-rh-side-ns{width:20px;height:6px;border-radius:3px}',
            '.hdb-rh-side-ew{width:6px;height:20px;border-radius:3px}',
            // Live tooltip
            '#hdb-resize-tip{position:fixed;z-index:999999;pointer-events:none;',
            'padding:4px 10px;background:rgba(0,0,0,0.75);color:#fff;border-radius:6px;',
            'font-size:11px;font-family:Poppins,sans-serif;font-weight:600;white-space:nowrap;',
            'opacity:0;transition:opacity .15s ease;box-shadow:0 4px 12px rgba(0,0,0,0.3)}',
            '#hdb-resize-tip.visible{opacity:1}'
        ].join('');
        document.head.appendChild(s);
    }

    // Live resize tooltip
    let _tip = document.getElementById('hdb-resize-tip');
    if (!_tip) {
        _tip = document.createElement('div');
        _tip.id = 'hdb-resize-tip';
        document.body.appendChild(_tip);
    }

    let _wrapper = null;

    const HANDLES = [
        // Corners
        { pos:'nw', cls:'hdb-rh-corner', style:'top:-5px;left:-5px;',                    cursor:'nw-resize' },
        { pos:'ne', cls:'hdb-rh-corner', style:'top:-5px;right:-5px;',                   cursor:'ne-resize' },
        { pos:'se', cls:'hdb-rh-corner', style:'bottom:-5px;right:-5px;',                cursor:'se-resize' },
        { pos:'sw', cls:'hdb-rh-corner', style:'bottom:-5px;left:-5px;',                 cursor:'sw-resize' },
        // Sides
        { pos:'n',  cls:'hdb-rh-side-ns', style:'top:-3px;left:calc(50% - 10px);',      cursor:'n-resize'  },
        { pos:'s',  cls:'hdb-rh-side-ns', style:'bottom:-3px;left:calc(50% - 10px);',   cursor:'s-resize'  },
        { pos:'e',  cls:'hdb-rh-side-ew', style:'right:-3px;top:calc(50% - 10px);',     cursor:'e-resize'  },
        { pos:'w',  cls:'hdb-rh-side-ew', style:'left:-3px;top:calc(50% - 10px);',      cursor:'w-resize'  },
    ];

    function wrapImg(img) {
        if (img.parentElement && img.parentElement.classList.contains('hdb-img-wrapper')) {
            return img.parentElement;
        }
        const wrap = document.createElement('span');
        wrap.className = 'hdb-img-wrapper';
        img.parentNode.insertBefore(wrap, img);
        wrap.appendChild(img);
        HANDLES.forEach(h => {
            const el = document.createElement('div');
            el.className = 'hdb-resize-handle ' + h.cls;
            el.dataset.pos = h.pos;
            el.style.cssText = h.style + 'cursor:' + h.cursor + ';';
            el.addEventListener('mousedown', onHandleDown);
            wrap.appendChild(el);
        });
        return wrap;
    }

    function unwrapImg(wrap) {
        if (!wrap) return;
        const img = wrap.querySelector('img');
        if (img && wrap.parentNode) wrap.parentNode.insertBefore(img, wrap);
        wrap.remove();
        _wrapper = null;
    }

    document.addEventListener('click', e => {
        if (e.target.tagName === 'IMG' && e.target.closest('.jodit-wysiwyg')) {
            if (_wrapper && _wrapper !== e.target.parentElement) { unwrapImg(_wrapper); }
            _wrapper = wrapImg(e.target);
            // Update dim badge in toolbar
            const dimEl = document.getElementById('hdb-img-dimensions');
            if (dimEl) {
                const r = e.target.getBoundingClientRect();
                dimEl.textContent = Math.round(r.width) + ' \u00d7 ' + Math.round(r.height);
            }
        } else if (!e.target.closest('.hdb-img-wrapper') && !e.target.closest('#hdb-img-toolbar-row')) {
            unwrapImg(_wrapper);
        }
    }, true);

    // ── Resize logic ────────────────────────────────────────────
    const MIN_SIZE = 40, MAX_SIZE = 2000;
    let _img, _pos, _startX, _startY, _startW, _startH, _ratio, _lockRatio, _fromCenter;

    function onHandleDown(e) {
        e.preventDefault(); e.stopPropagation();
        const wrap = e.currentTarget.closest('.hdb-img-wrapper');
        _img     = wrap.querySelector('img');
        _pos     = e.currentTarget.dataset.pos;
        _startX  = e.clientX; _startY = e.clientY;
        _startW  = _img.offsetWidth; _startH = _img.offsetHeight;
        _ratio   = _startW / (_startH || 1);
        _lockRatio   = !e.shiftKey;  // Default: locked. Shift = free resize.
        _fromCenter  = e.altKey;

        document.body.style.userSelect = 'none';
        document.body.style.cursor = e.currentTarget.style.cursor;
        document.addEventListener('mousemove', onResizeMove);
        document.addEventListener('mouseup',   onResizeUp);
    }

    function onResizeMove(e) {
        if (!_img) return;
        _lockRatio  = !e.shiftKey;
        _fromCenter = e.altKey;

        let w = _startW + (e.clientX - _startX) * (_fromCenter ? 2 : 1) * (_pos.includes('w') ? -1 : 1);
        let h = _startH + (e.clientY - _startY) * (_fromCenter ? 2 : 1) * (_pos.includes('n') ? -1 : 1);

        if (_lockRatio) {
            if (_pos.includes('n') || _pos.includes('s')) w = h * _ratio;
            else h = w / _ratio;
        }

        w = Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.round(w)));
        h = Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.round(h)));

        if (_fromCenter) {
            w = Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.round(_startW + (w - _startW) * 2)));
            h = Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.round(_startH + (h - _startH) * 2)));
        }

        _img.style.width  = w + 'px';
        _img.style.height = h + 'px';

        const dimEl = document.getElementById('hdb-img-dimensions');
        if (dimEl) dimEl.textContent = w + ' \u00d7 ' + h;

        _tip.textContent = w + ' \u00d7 ' + h + 'px' + (_lockRatio ? ' \ud83d\udd12' : ' \ud83d\udd13');
        _tip.style.left  = (e.clientX + 16) + 'px';
        _tip.style.top   = (e.clientY - 28) + 'px';
        _tip.classList.add('visible');
    }

    function onResizeUp() {
        _img = null;
        _tip.classList.remove('visible');
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
        document.removeEventListener('mousemove', onResizeMove);
        document.removeEventListener('mouseup',   onResizeUp);
    }

    document.addEventListener('keydown', e => {
        if (!_wrapper) return;
        const img = _wrapper.querySelector('img');
        if (!img) return;
        const isArrow = ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key);
        if (!isArrow) return;
        const inEditor = e.target.closest('.jodit-wysiwyg') || e.target.closest('.hdb-img-wrapper');
        if (!inEditor) return;
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const w = img.offsetWidth, h = img.offsetHeight;
        const ratio = w / (h || 1);
        if (e.key === 'ArrowRight') { const nw = Math.min(MAX_SIZE, w + step); img.style.width = nw + 'px'; img.style.height = Math.round(nw/ratio) + 'px'; }
        if (e.key === 'ArrowLeft')  { const nw = Math.max(MIN_SIZE, w - step); img.style.width = nw + 'px'; img.style.height = Math.round(nw/ratio) + 'px'; }
        if (e.key === 'ArrowDown')  { const nh = Math.min(MAX_SIZE, h + step); img.style.height = nh + 'px'; img.style.width = Math.round(nh*ratio) + 'px'; }
        if (e.key === 'ArrowUp')    { const nh = Math.max(MIN_SIZE, h - step); img.style.height = nh + 'px'; img.style.width = Math.round(nh*ratio) + 'px'; }
        const dimEl = document.getElementById('hdb-img-dimensions');
        if (dimEl) { const r = img.getBoundingClientRect(); dimEl.textContent = Math.round(r.width) + ' \u00d7 ' + Math.round(r.height); }
    });
}

// ============================================================
//  ✋  IMAGE DRAG & DROP — Free Margin-Based Movement
// ============================================================
function enableImageDragDrop(editorEl) {
    if (!editorEl) return;

    let _dragImg    = null;
    let _wrapper    = null;
    let _isDragging = false;
    let _startX, _startY;
    let _startMarginLeft, _startMarginTop;

    // Prevent native HTML5 drag so our custom mousemove dragging works
    editorEl.addEventListener('dragstart', e => {
        if (e.target.tagName === 'IMG' || e.target.closest('.hdb-img-wrapper')) {
            e.preventDefault();
            e.stopImmediatePropagation();
        }
    }, true);

    editorEl.addEventListener('mousedown', e => {
        if (e.target.tagName !== 'IMG') return;
        if (e.button !== 0) return;
        // Don't start drag if on a resize handle
        if (e.target.closest('.hdb-resize-handle')) return;

        // CRITICAL: Prevent default to stop native drag and text selection from killing mousemove events
        e.preventDefault();
        e.stopImmediatePropagation();

        _dragImg = e.target;
        _wrapper = _dragImg.closest('.hdb-img-wrapper');
        
        // If wrapped, we move the wrapper. If not, we move the image.
        const targetEl = _wrapper || _dragImg;

        _startX  = e.clientX;
        _startY  = e.clientY;
        
        _startMarginLeft = parseInt(getComputedStyle(targetEl).marginLeft) || 0;
        _startMarginTop = parseInt(getComputedStyle(targetEl).marginTop) || 0;

        const doc = editorEl.ownerDocument || document;

        const onMove = ev => {
            const dx = ev.clientX - _startX;
            const dy = ev.clientY - _startY;

            if (!_isDragging && Math.hypot(dx, dy) < 4) return;

            if (!_isDragging) {
                _isDragging = true;
                doc.body.style.userSelect = 'none';
                targetEl.style.cursor = 'grabbing';
            }

            // Move freely via margins for pixel-perfect placement (Free Drag)
            targetEl.style.marginLeft = (_startMarginLeft + dx) + 'px';
            targetEl.style.marginTop  = (_startMarginTop + dy) + 'px';
        };

        const onUp = ev => {
            doc.removeEventListener('mousemove', onMove, true);
            doc.removeEventListener('mouseup',   onUp, true);
            doc.body.style.userSelect = '';

            if (_isDragging && targetEl) {
                targetEl.style.cursor = 'default';
                if (typeof showToast === 'function') showToast('Image moved freely \u2705', 'success');
            }

            _isDragging = false;
            _dragImg    = null;
            _wrapper    = null;
        };

        doc.addEventListener('mousemove', onMove, true);
        doc.addEventListener('mouseup',   onUp, true);
    }, true);

    // Give all editor images a grab cursor via MutationObserver
    const obs = new MutationObserver(() => {
        editorEl.querySelectorAll('img').forEach(img => {
            if (!img.style.cursor || img.style.cursor === 'default') {
                img.style.cursor = 'grab';
            }
        });
    });
    obs.observe(editorEl, { childList: true, subtree: true });
    editorEl.querySelectorAll('img').forEach(img => { img.style.cursor = 'grab'; });
}

// ============================================================
//  📂  DESKTOP FILE DROP — Drag files from OS into editor
// ============================================================
function setupEditorDropZone(editorEl) {
    if (!editorEl) return;

    // Inject overlay CSS once
    if (!document.getElementById('hdb-dropzone-style')) {
        const s = document.createElement('style');
        s.id = 'hdb-dropzone-style';
        s.textContent = [
            '#hdb-dropzone-overlay{',
            'position:absolute;inset:0;z-index:99998;',
            'display:none;align-items:center;justify-content:center;flex-direction:column;gap:12px;',
            'background:rgba(39,174,96,0.08);',
            'border:3px dashed #2ecc71;border-radius:10px;',
            'backdrop-filter:blur(2px);',
            'animation:dropzonePulse 1.2s ease infinite alternate;',
            'pointer-events:none;',
            '}',
            '@keyframes dropzonePulse{from{background:rgba(39,174,96,.06);border-color:rgba(46,204,113,.5)}',
            'to{background:rgba(39,174,96,.14);border-color:#2ecc71}}',
            '#hdb-dropzone-overlay .dz-icon{font-size:42px;animation:dzBounce .7s ease infinite alternate}',
            '@keyframes dzBounce{from{transform:translateY(0)}to{transform:translateY(-8px)}}',
            '#hdb-dropzone-overlay .dz-text{font-size:16px;font-weight:700;color:#27ae60;font-family:Poppins,sans-serif}',
            '#hdb-dropzone-overlay .dz-sub{font-size:12px;color:#7f8c8d;font-family:Poppins,sans-serif}',
            // Upload progress overlay
            '#hdb-upload-progress{',
            'position:fixed;bottom:24px;right:24px;z-index:999999;',
            'background:rgba(0,0,0,0.85);backdrop-filter:blur(8px);',
            'border:1px solid rgba(46,204,113,0.3);border-radius:12px;',
            'padding:14px 18px;min-width:220px;display:none;flex-direction:column;gap:8px;',
            'font-family:Poppins,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,0.4)',
            '}',
            '#hdb-upload-progress .up-title{font-size:12px;font-weight:600;color:#2ecc71}',
            '#hdb-upload-progress .up-bar-track{height:5px;background:rgba(255,255,255,.1);border-radius:5px;overflow:hidden}',
            '#hdb-upload-progress .up-bar-fill{height:100%;background:linear-gradient(90deg,#2ecc71,#27ae60);border-radius:5px;transition:width .15s ease}',
            '#hdb-upload-progress .up-status{font-size:11px;color:rgba(255,255,255,.6)}'
        ].join('');
        document.head.appendChild(s);
    }

    // Create overlay
    const overlay = document.createElement('div');
    overlay.id = 'hdb-dropzone-overlay';
    overlay.innerHTML = [
        '<div class="dz-icon">\ud83d\uddbc\ufe0f</div>',
        '<div class="dz-text">Drop image here</div>',
        '<div class="dz-sub">PNG, JPG, GIF, WebP \u2014 multiple files supported</div>'
    ].join('');

    // Wrap editorEl in a relative container if needed
    const editorParent = editorEl.parentElement;
    if (editorParent) {
        if (getComputedStyle(editorParent).position === 'static') {
            editorParent.style.position = 'relative';
        }
        editorParent.appendChild(overlay);
    }

    // Create progress widget
    let _progEl = document.getElementById('hdb-upload-progress');
    if (!_progEl) {
        _progEl = document.createElement('div');
        _progEl.id = 'hdb-upload-progress';
        _progEl.innerHTML = [
            '<div class="up-title">\ud83d\udce4 Processing images...</div>',
            '<div class="up-bar-track"><div class="up-bar-fill" id="hdb-up-fill" style="width:0%"></div></div>',
            '<div class="up-status" id="hdb-up-status">0 / 0</div>'
        ].join('');
        document.body.appendChild(_progEl);
    }

    function showProgress(current, total) {
        _progEl.style.display = 'flex';
        const pct = total > 0 ? Math.round((current / total) * 100) : 0;
        const fill = document.getElementById('hdb-up-fill');
        const status = document.getElementById('hdb-up-status');
        if (fill) fill.style.width = pct + '%';
        if (status) status.textContent = current + ' / ' + total + ' images';
    }

    function hideProgress() {
        setTimeout(() => { _progEl.style.display = 'none'; }, 1200);
    }

    let _dragCounter = 0;

    editorEl.addEventListener('dragenter', e => {
        if (!e.dataTransfer || !e.dataTransfer.types.includes('Files')) return;
        _dragCounter++;
        overlay.style.display = 'flex';
        e.preventDefault();
    }, true);

    editorEl.addEventListener('dragleave', e => {
        _dragCounter--;
        if (_dragCounter <= 0) { _dragCounter = 0; overlay.style.display = 'none'; }
    }, true);

    editorEl.addEventListener('dragover', e => {
        if (!e.dataTransfer || !e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
    }, true);

    editorEl.addEventListener('drop', e => {
        e.preventDefault();
        e.stopImmediatePropagation(); // CRITICAL: Stop Jodit from natively processing the drop and duplicating the image!
        overlay.style.display = 'none';
        _dragCounter = 0;

        const allFiles = Array.from(e.dataTransfer.files);
        if (!allFiles.length) return;

        showProgress(0, allFiles.length);
        let processed = 0;

        allFiles.forEach((file, idx) => {
            if (file.type.startsWith('image/')) {
                // Handle Image
                const reader = new FileReader();
                reader.onload = ev => {
                    compressImageDataUrl(ev.target.result, (compressed) => {
                        processed++;
                        showProgress(processed, allFiles.length);

                        // Insert image inline so they can be side-by-side
                        const imgHtml = '<img src="' + compressed + '" style="max-width:100%;height:auto;border-radius:6px;display:inline-block;margin:4px;cursor:grab;" />';
                        if (typeof joditEditor !== 'undefined' && joditEditor && joditEditor.s) {
                            joditEditor.s.insertHTML(imgHtml);
                        }

                        if (processed >= allFiles.length) hideProgress();
                    });
                };
                reader.readAsDataURL(file);
            } else {
                // Handle Non-Image Attachment (PDF, DOCX, TXT, etc.)
                processed++;
                showProgress(processed, allFiles.length);
                const ext = file.name.split('.').pop().toUpperCase();
                const attachHtml = `&nbsp;<a href="#" style="display:inline-flex; align-items:center; gap:8px; padding:6px 12px; background:linear-gradient(to bottom, #f8f9fa, #e9ecef); border:1px solid #ced4da; border-radius:6px; text-decoration:none; color:#2c3e50; font-family:sans-serif; font-size:13px; margin:4px; vertical-align:middle; box-shadow:0 1px 2px rgba(0,0,0,0.05);" contenteditable="false"><span style="font-size:16px;">📎</span><strong style="max-width:150px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${file.name}</strong><span style="font-size:11px; background:#e0e0e0; padding:2px 6px; border-radius:4px;">${ext}</span></a>&nbsp;`;
                
                if (typeof joditEditor !== 'undefined' && joditEditor && joditEditor.s) {
                    joditEditor.s.insertHTML(attachHtml);
                }
                
                if (processed >= allFiles.length) hideProgress();
            }
        });
    }, true);

    // Global fallback to ensure overlay never gets stuck if user drops outside editor
    window.addEventListener('drop', () => {
        _dragCounter = 0;
        if (overlay) overlay.style.display = 'none';
    }, true);
    window.addEventListener('dragend', () => {
        _dragCounter = 0;
        if (overlay) overlay.style.display = 'none';
    }, true);
}



document.addEventListener("DOMContentLoaded", function () {

    joditEditor = new Jodit('#editor', {
        placeholder: 'Write mail content here... (Arabic or English)',
        language: 'en',
        direction: 'rtl',          // ✅ FIX: RTL as default (Arabic workplace)
        defaultActionOnPaste: 'insert_as_html', // ✅ Keep images when pasting
        height: 420,
        minHeight: 200,
        allowResizeY: true,
        toolbarButtonSize: 'middle',
        toolbarAdaptive: false,     // Keep all buttons visible, no collapse
        showCharsCounter: false,    // We have custom counter
        showWordsCounter: false,

        // ✅ Arabic + English fonts in font list
        fontValues: {
            'Cairo (Arabic)': 'Cairo, sans-serif',
            'Tajawal (Arabic)': 'Tajawal, sans-serif',
            'Amiri (Arabic)': 'Amiri, serif',
            'Arial': 'Arial, sans-serif',
            'Poppins': 'Poppins, sans-serif',
            'Times New Roman': 'Times New Roman, serif',
            'Courier New': 'Courier New, monospace',
            'Georgia': 'Georgia, serif',
        },

        // ✅ Brand colors in color picker
        colorPickerDefaultTab: 'color',

        buttons: [
            // Direction controls
            'rtlBtn', 'ltrBtn', 'fixAllDirs', 'inlineDir', 'arabicQuotes', '|',
            'bold', 'italic', 'underline', 'strikethrough', '|',
            'font', 'fontsize', '|',
            'brush', 'paragraph', '|',
            // Callout boxes
            'infoBox', 'warnBox', 'dangerBox', 'successBox', '|',
            // Content tools
            'priorityBadge', 'checkList', 'quoteBlock', 'codeBlock', 'divider', '|',
            // Templates & history
            'mailTemplate', 'versionHistory', 'focusMode', '|',
            // Image management buttons
            'image', 'imgGrid2', 'imgGrid3', '|',
            'table', 'link', '|',
            'align', 'indent', 'outdent', '|',
            'ul', 'ol', '|',
            'superscript', 'subscript', '|',
            'source', 'fullsize', 'print', '|',
            'undo', 'redo', '|',
            'hr', 'eraser', 'copyformat', 'selectall'
        ],

        extraButtons: [
            ...Object.values(joditCustomButtons),
            // Image grid buttons
            {
                name: 'imgGrid2', text: '⬛⬛ 2-Col', tooltip: 'Insert 2-column image grid (side by side)',
                exec(editor) {
                    editor.s.insertHTML(`
                        <div style="display:flex;gap:10px;align-items:flex-start;margin:12px 0;">
                            <div style="flex:1;"><img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='80'%3E%3Crect fill='%23e8f5e9' width='100' height='80'/%3E%3Ctext x='50' y='45' text-anchor='middle' fill='%2327ae60' font-size='12'%3EImage 1%3C/text%3E%3C/svg%3E" style="width:100%;height:auto;border-radius:6px;cursor:pointer;" /><p style="font-size:12px;color:#888;text-align:center;margin:4px 0">Caption 1</p></div>
                            <div style="flex:1;"><img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='80'%3E%3Crect fill='%23e8f5e9' width='100' height='80'/%3E%3Ctext x='50' y='45' text-anchor='middle' fill='%2327ae60' font-size='12'%3EImage 2%3C/text%3E%3C/svg%3E" style="width:100%;height:auto;border-radius:6px;cursor:pointer;" /><p style="font-size:12px;color:#888;text-align:center;margin:4px 0">Caption 2</p></div>
                        </div>`);
                }
            },
            {
                name: 'imgGrid3', text: '⬛⬛⬛ 3-Col', tooltip: 'Insert 3-column image grid',
                exec(editor) {
                    editor.s.insertHTML(`
                        <div style="display:flex;gap:8px;align-items:flex-start;margin:12px 0;">
                            <div style="flex:1;"><img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='80'%3E%3Crect fill='%23e8f5e9' width='100' height='80'/%3E%3Ctext x='50' y='45' text-anchor='middle' fill='%2327ae60' font-size='12'%3EImage 1%3C/text%3E%3C/svg%3E" style="width:100%;height:auto;border-radius:6px;cursor:pointer;" /></div>
                            <div style="flex:1;"><img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='80'%3E%3Crect fill='%23e8f5e9' width='100' height='80'/%3E%3Ctext x='50' y='45' text-anchor='middle' fill='%2327ae60' font-size='12'%3EImage 2%3C/text%3E%3C/svg%3E" style="width:100%;height:auto;border-radius:6px;cursor:pointer;" /></div>
                            <div style="flex:1;"><img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='80'%3E%3Crect fill='%23e8f5e9' width='100' height='80'/%3E%3Ctext x='50' y='45' text-anchor='middle' fill='%2327ae60' font-size='12'%3EImage 3%3C/text%3E%3C/svg%3E" style="width:100%;height:auto;border-radius:6px;cursor:pointer;" /></div>
                        </div>`);
                }
            }
        ],

        uploader: { insertImageAsBase64URI: true },
        
        // ✅ Disable Jodit's native conflicting image features so our custom premium ones take over
        disablePlugins: 'imageProcessor,imageProperties,resizer',
        image: { editSrc: false, editTitle: false, editAlt: false },

        // ✅ THE KEY FIX: unicode-bidi:plaintext makes mixed Arabic/English work exactly like Outlook
        // Each paragraph gets its own bidi direction based on content, not the parent container
        style: {
            'font-family': "'Cairo', 'Poppins', sans-serif",
            'font-size': '15px',
            'line-height': '1.9',
            'padding': '16px',
            'unicode-bidi': 'plaintext',  // ⭐ THE OUTLOOK SECRET
        },

        events: {
            // ✅ afterInit: inject CSS directly into editor iframe — the definitive bidi fix
            afterInit: function() {
                setTimeout(() => {
                    try {
                        const editorEl2 = joditEditor.editor;
                        if (editorEl2) {
                            // Scope CSS to .jodit-wysiwyg — don't affect main document elements
                            const existing = document.getElementById('hdb-bidi-fix');
                            if (!existing) {
                                const style = document.createElement('style');
                                style.id = 'hdb-bidi-fix';
                                style.innerHTML = `
                                    /* ⭐ Scoped bidi fix — only targets editor content */
                                    .jodit-wysiwyg { unicode-bidi: plaintext !important; }
                                    .jodit-wysiwyg p, .jodit-wysiwyg div, .jodit-wysiwyg li,
                                    .jodit-wysiwyg h1, .jodit-wysiwyg h2, .jodit-wysiwyg h3,
                                    .jodit-wysiwyg h4, .jodit-wysiwyg blockquote,
                                    .jodit-wysiwyg td, .jodit-wysiwyg th {
                                        unicode-bidi: plaintext !important;
                                    }
                                    .jodit-wysiwyg .bidi-warn {
                                        outline: 2px dashed #f39c12 !important;
                                    }
                                `;
                                document.head.appendChild(style);
                            }
                        }
                    } catch(e) { console.warn('CSS inject failed:', e); }

                    // ─── Windows-standard Direction Shortcuts ─────────────────────
                    try {
                    const editorEl = joditEditor.editor;
                    if (editorEl) {
                    let _shiftOnlyDown = false;
                    let _shiftSide     = 0; // 1=left, 2=right

                    editorEl.addEventListener('keydown', (e) => {


                        // ── Track if ONLY Shift is pressed (no other key) ──────────
                        if (e.key === 'Shift' && !e.ctrlKey && !e.altKey && !e.metaKey) {
                            _shiftOnlyDown = true;
                            _shiftSide = e.location; // 1=left, 2=right
                        } else {
                            _shiftOnlyDown = false; // another key pressed → not "Shift alone"
                        }

                        // ── Alt+Shift → toggle direction ───────────────────────────
                        if (e.altKey && e.shiftKey && !e.ctrlKey) {
                            e.preventDefault();
                            const sel = (editorEl.ownerDocument || document).getSelection();
                            if (!sel || sel.rangeCount === 0) return;
                            const node = sel.getRangeAt(0).startContainer;
                            const block = (node.nodeType === 3 ? node.parentElement : node)
                                .closest('p,li,h1,h2,h3,h4,div,blockquote');
                            if (block) {
                                const cur = block.dir || 'rtl';
                                const nd  = cur === 'rtl' ? 'ltr' : 'rtl';
                                block.dir = nd;
                                block.dataset.dirLocked = '1';
                                block.style.textAlign = nd === 'rtl' ? 'right' : 'left';
                                updateDirIndicator(joditEditor.editor);
                            }
                            return;
                        }

                        // ── Spacebar → smart direction check after each word ───────
                        if (e.key === ' ' && !e.ctrlKey && !e.altKey && !e.shiftKey) {
                            const doc2 = editorEl.ownerDocument || document;
                            const sel2 = doc2.getSelection();
                            if (sel2 && sel2.rangeCount > 0) {
                                const nd2 = sel2.getRangeAt(0).startContainer;
                                const blk2 = (nd2.nodeType === 3 ? nd2.parentElement : nd2)
                                    .closest('p,li,h1,h2,h3,h4,div,blockquote');
                                // Only re-evaluate if NOT manually locked
                                if (blk2 && !blk2.dataset.dirLocked) {
                                    const txt = (blk2.innerText || '').trim();
                                    const detectedDir = getStrongDir(txt);
                                    if (detectedDir === 'rtl') { blk2.dir = 'rtl'; blk2.style.textAlign = 'right'; }
                                    else if (detectedDir === 'ltr') { blk2.dir = 'ltr'; blk2.style.textAlign = 'left'; }
                                    updateDirIndicator(joditEditor.editor);
                                }
                            }
                        }

                        // ── Arabic Punctuation Auto-Convert ───────────────────────
                        const doc2 = editorEl.ownerDocument || document;
                        const sel2 = doc2.getSelection();
                        if (!sel2 || sel2.rangeCount === 0) return;
                        const node2 = sel2.getRangeAt(0).startContainer;
                        const block2 = (node2.nodeType === 3 ? node2.parentElement : node2)
                            .closest('p,li,h1,h2,h3,h4,div,blockquote');
                        const isArabicPara = block2 && (
                            block2.dir === 'rtl' ||
                            getStrongDir((block2.innerText || '').trim()) === 'rtl'
                        );

                        if (isArabicPara) {
                            if (e.key === ',' && !e.ctrlKey && !e.altKey) {
                                e.preventDefault();
                                doc2.execCommand('insertText', false, '،');
                            } else if (e.key === '?' && !e.ctrlKey && !e.altKey) {
                                e.preventDefault();
                                doc2.execCommand('insertText', false, '؟');
                            } else if (e.key === ';' && !e.ctrlKey && !e.altKey) {
                                e.preventDefault();
                                doc2.execCommand('insertText', false, '؛');
                            }
                        }
                    });

                    // ── keyup: detect Right Shift alone OR Left Shift alone ──────
                    editorEl.addEventListener('keyup', (e) => {
                        if (e.key === 'Shift' && _shiftOnlyDown) {
                            const doc3 = editorEl.ownerDocument || document;
                            const sel3 = doc3.getSelection();
                            if (!sel3 || sel3.rangeCount === 0) { _shiftOnlyDown = false; return; }
                            const node3 = sel3.getRangeAt(0).startContainer;
                            const block3 = (node3.nodeType === 3 ? node3.parentElement : node3)
                                .closest('p,li,h1,h2,h3,h4,div,blockquote');
                            if (block3) {
                                if (_shiftSide === 2) {
                                    // ✅ RIGHT SHIFT → RTL (Arabic) — Windows standard
                                    block3.dir = 'rtl';
                                    block3.style.textAlign = 'right';
                                    block3.dataset.dirLocked = '1';
                                } else if (_shiftSide === 1) {
                                    // ✅ LEFT SHIFT → LTR (English) — Windows standard
                                    block3.dir = 'ltr';
                                    block3.style.textAlign = 'left';
                                    block3.dataset.dirLocked = '1';
                                }
                                updateDirIndicator(joditEditor.editor);
                            }
                        }
                        _shiftOnlyDown = false;
                        try { updateDirIndicator(joditEditor.editor); } catch(err) {}
                    });

                    editorEl.addEventListener('click', () => {
                        try { updateDirIndicator(joditEditor.editor); } catch(e) {}
                    });

                    // ─── Auto Language Detection (Win+Space equivalent) ──────────
                    // Win+Space switches keyboard language at OS level (browser can't see it).
                    // Solution: detect the language of EVERY typed character via 'input' event.
                    // The first Arabic character → RTL instantly. First Latin → LTR instantly.
                    // This fires immediately after Win+Space + first keystroke.
                    editorEl.addEventListener('input', (e) => {
                        try {
                            const typed = e.data; // the actual character(s) typed
                            if (!typed) return;

                            const doc4 = editorEl.ownerDocument || document;
                            const sel4 = doc4.getSelection();
                            if (!sel4 || sel4.rangeCount === 0) return;

                            const node4 = sel4.getRangeAt(0).startContainer;
                            const block4 = (node4.nodeType === 3 ? node4.parentElement : node4)
                                .closest('p,li,h1,h2,h3,h4,div,blockquote');

                            // Only auto-switch if NOT manually locked by user
                            if (!block4 || block4.dataset.dirLocked) return;

                            // Check FIRST strong character in the typed text
                            const detectedDir = getStrongDir(typed);
                            if (detectedDir === 'rtl') {
                                block4.dir = 'rtl';
                                block4.style.textAlign = 'right';
                                updateDirIndicator(joditEditor.editor);
                            } else if (detectedDir === 'ltr') {
                                block4.dir = 'ltr';
                                block4.style.textAlign = 'left';
                                updateDirIndicator(joditEditor.editor);
                            }
                        } catch(err) {}
                    });

                    } // end if(editorEl)
                    } catch(e) { console.warn('Shortcuts setup failed:', e); }


                    // ✅ Setup image click controls (header toolbar row)
                    try { setupImageClickControls(joditEditor.editor); } catch(e) {}

                    // ✅ Setup image resize handles (8-point, premium pill/round handles)
                    try { setupImageResizer(); } catch(e) {}

                    // ✅ Enable drag & drop image repositioning (within editor)
                    try { enableImageDragDrop(joditEditor.editor); } catch(e) {}

                    // ✅ Enable desktop file drag-into-editor with overlay + progress
                    try { setupEditorDropZone(joditEditor.editor); } catch(e) {}

                    // ✅ Custom paste handler — intercept BEFORE Jodit processes paste
                    try {
                        const editorForPaste = joditEditor.editor;
                        if (editorForPaste) {
                            editorForPaste.addEventListener('paste', (pasteEvent) => {
                                const cd = pasteEvent.clipboardData || window.clipboardData;
                                if (!cd) return;

                                // Priority 1: Direct image from clipboard (screenshot, Snipping Tool, etc.)
                                const items = cd.items;
                                if (items) {
                                    for (const item of items) {
                                        if (item.type.startsWith('image/')) {
                                            pasteEvent.preventDefault();
                                            pasteEvent.stopPropagation();
                                            const blob = item.getAsFile();
                                            if (!blob) return;
                                            const reader = new FileReader();
                                            reader.onload = (ev) => {
                                                compressImageDataUrl(ev.target.result, (compressed) => {
                                                    joditEditor.s.insertHTML(
                                                        `<img src="${compressed}" style="max-width:100%;height:auto;border-radius:6px;display:block;margin:8px 0;cursor:pointer;" />`
                                                    );
                                                    if (typeof showToast === 'function') showToast('Image inserted ✅', 'success');
                                                });
                                            };
                                            reader.readAsDataURL(blob);
                                            return;
                                        }
                                    }
                                }

                                // Priority 2: HTML from Word/Outlook — clean it, keep images
                                const htmlData = cd.getData('text/html');
                                if (htmlData && (htmlData.includes('mso-') || htmlData.includes('MsoNormal') || htmlData.includes('urn:schemas-microsoft'))) {
                                    pasteEvent.preventDefault();
                                    pasteEvent.stopPropagation();
                                    const cleaned = cleanWordHtml(htmlData);
                                    joditEditor.s.insertHTML(cleaned);
                                    if (typeof showToast === 'function') showToast('Word content cleaned ✅', 'success');
                                    return;
                                }
                                // Otherwise: let Jodit handle it normally (text, web HTML, etc.)
                            }, true); // capture phase — runs BEFORE Jodit's own paste handler
                        }
                    } catch(e) { console.warn('Paste handler failed:', e); }

                    try { applySmartDirection(joditEditor.editor); } catch(e) {}
                }, 300);
            },


            change: function () {
                if (!joditEditor) return;
                const html = joditEditor.value;
                const text = html.replace(/<[^>]*>/g, '');

                // ✅ Char + Word + Reading time counter
                const words = text.trim() ? text.trim().split(/\s+/).length : 0;
                const readMins = Math.ceil(words / 200);
                const el = document.getElementById('charCountDisplay');
                if (el) {
                    el.innerText = `${text.length} chars · ${words} words · ~${readMins} min read`;
                    el.style.color = text.length > 1000 ? '#e74c3c' : text.length > 600 ? '#f39c12' : '#27ae60';
                }

                // ✅ Auto-save
                triggerAutoSave();

                // ✅ Per-paragraph smart direction (only for unlocked paragraphs)
                try { applySmartDirection(joditEditor.editor); } catch(e) {}
            },

            afterSetValue: function() {
                // Apply direction after content is set (e.g. when editing existing mail)
                setTimeout(() => {
                    try { applySmartDirection(joditEditor.editor); } catch(e) {}
                }, 100);
            }
        }
    });

    // ✅ Restore draft if available
    const savedDraft = localStorage.getItem('adminDraftContent');
    const draftStatus = document.getElementById('autoSaveStatus');
    if (savedDraft && draftStatus) {
        const savedTime = localStorage.getItem('adminDraftSaved') || '';
        draftStatus.innerHTML = `💾 Draft saved at ${savedTime} — <a href="#" onclick="restoreDraft(); return false;" style="color:#3498db;">Restore?</a>`;
    }
});

function restoreDraft() {
    const saved = localStorage.getItem('adminDraftContent');
    if (saved && joditEditor) {
        joditEditor.value = saved;
        showToast('Draft restored ✅', 'success');
        setTimeout(() => { try { applySmartDirection(joditEditor.editor); } catch(e){} }, 200);
    }
}

function clearEditorDraft() {
    localStorage.removeItem('adminDraftContent');
    localStorage.removeItem('adminDraftSaved');
}


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
            "code", "topic", "idea", "sender", "keywords", "category", "tags", "cleanContent"
        ],
        shouldSort: true,
        // ✅ FIX #12: Enable extremely forgiving fuzzy tolerance — handle Typos, Eng/Ar swap, misspellings
        threshold: 0.6,
        distance: 1000,
        ignoreLocation: true,
        minMatchCharLength: 2,
        includeMatches: true
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

    const filtered = result.map(res => {
        res.item._fuseMatches = res.matches;
        return res.item;
    });
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

// ✅ FIX #11: Show only last 2 searches by default + expand arrow for full list
function showSearchHistory() {
    const box = document.getElementById('searchHistoryBox');
    if (!box) return;

    let listToRender = searchHistory;
    const hasMore = listToRender.length > 2;
    const visibleItems = listToRender.slice(0, 2);
    const hiddenItems  = listToRender.slice(2);

    // M1: Use onmousedown instead of onclick — fires BEFORE blur so dropdown stays open
    const makeAction = (cleanTerm) =>
        `onmousedown="event.preventDefault(); document.getElementById('searchInput').value='${cleanTerm}'; debouncedSearch('${cleanTerm}'); document.getElementById('searchHistoryBox').classList.remove('show');"`;

    // If history empty, show contextual suggestions
    if (listToRender.length === 0) {
        listToRender = ["🔥 Top: credit cards", "🔥 Top: fraud alerts", "🔥 Top: loans policy"];
        box.innerHTML = listToRender.map(term => {
            const cleanTerm = term.replace(/🔥 Top: /, '');
            return `<div ${makeAction(cleanTerm)}>🕒 ${term}</div>`;
        }).join('');
        box.classList.add('show');
    } else {
        const renderItem = term => {
            const cleanTerm = term.replace(/🔥 Top: /, '');
            return `<div class="sh-item" ${makeAction(cleanTerm)}>🕒 ${term}</div>`;
        };

        const expandBtnHtml = hasMore
            ? `<div class="sh-expand-btn" id="shExpandBtn" onmousedown="event.preventDefault(); expandSearchHistory(event)">▼ Show ${hiddenItems.length} more</div>`
            : '';

        box.innerHTML =
            visibleItems.map(renderItem).join('') +
            `<div id="shHiddenItems" style="display:none;">${hiddenItems.map(renderItem).join('')}</div>` +
            expandBtnHtml;

        box.classList.add('show');
    }

    // Close on outside click
    setTimeout(() => {
        document.addEventListener('click', function closeBox(e) {
            if (!e.target.closest('.search-box')) {
                box.classList.remove('show');
                document.removeEventListener('click', closeBox);
            }
        });
    }, 100);
}

function expandSearchHistory(e) {
    e.stopPropagation();
    const hidden = document.getElementById('shHiddenItems');
    const btn    = document.getElementById('shExpandBtn');
    if (!hidden || !btn) return;
    if (hidden.style.display === 'none') {
        hidden.style.display = 'block';
        btn.innerHTML = '▲ Show less';
    } else {
        hidden.style.display = 'none';
        btn.innerHTML = `▼ Show ${hidden.querySelectorAll('.sh-item').length} more`;
    }
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
    await db.collection("mails").doc(id).update({
        isDeleted: true,
        deletedAt: new Date().toISOString(),
        keepInTrash: false
    });
}

// ⭐ التعديل 7: حماية الايميل المسترد
async function toggleKeepInTrash(id, status) {
    if (!isAdminSession) return;
    try {
        await db.collection("mails").doc(id).update({ keepInTrash: status });
        showToast(status ? "Protected from auto-delete 🛡️" : "Protection removed ⏳");
    } catch (e) {
        showToast("Error updating protection", "error");
    }
}
function showMailActions(event, mail) {
    const currentRow = event.currentTarget;
    if (!currentRow) return;

    const bar = document.getElementById('rowHoverBar');
    if (!bar) return;

    // Remove old actions-container-row if any
    document.querySelectorAll('.actions-container-row').forEach(el => el.remove());

    // Build buttons based on context
    let buttonsHTML = '';
    if (showingTrash) {
        if (isAdminSession) {
            buttonsHTML = `
                <div class="action-btn btn-restore-style" title="Restore" onclick="restoreMail('${mail.id}')" style="width:36px;height:36px;"><span>&#8617;</span></div>
                <div class="bar-sep"></div>
                <div class="action-btn btn-delete" title="Delete Forever" onclick="askPermanentDelete('${mail.id}')" style="width:36px;height:36px;"><span>✖</span></div>
            `;
        } else {
            buttonsHTML = `
                <div class="action-btn btn-restore-style" title="Restore" onclick="userRestoreMail('${mail.id}')" style="width:36px;height:36px;"><span>&#8617;</span></div>
            `;
        }
    } else {
        if (isAdminSession) {
            buttonsHTML = `
                <div class="action-btn" title="Export to Outlook" onclick="exportToOutlook('${mail.id}')" style="width:36px;height:36px;"><span>✉️</span></div>
                <div class="action-btn" title="Clone / Duplicate" onclick="cloneMail('${mail.id}')" style="width:36px;height:36px;"><span>📋</span></div>
                <div class="bar-sep"></div>
                <div class="action-btn" title="Edit" onclick="editMail('${mail.id}')" style="width:36px;height:36px;"><span>✏️</span></div>
                <div class="action-btn btn-delete" title="Delete for Everyone" onclick="askDeleteMail('${mail.id}')" style="width:36px;height:36px;"><span>🗑️</span></div>
                <div class="bar-sep"></div>
                <div class="action-btn btn-pin ${mail.isPinned ? 'active' : ''}" title="Pin for Everyone" onclick="pinMail('${mail.id}')" style="width:36px;height:36px;"><span>📌</span></div>
            `;
        } else {
            buttonsHTML = `
                <div class="action-btn btn-delete" title="Delete for your profile" onclick="askDeleteMail('${mail.id}', 'user')" style="width:36px;height:36px;"><span>🗑️</span></div>
                <div class="bar-sep"></div>
                <div class="action-btn btn-pin ${userPinned.includes(mail.id) ? 'active' : ''}" title="Pin to your profile" onclick="toggleUserPin('${mail.id}')" style="width:36px;height:36px;"><span>📌</span></div>
                <div class="action-btn btn-fav ${userFavorites.includes(mail.id) ? 'active' : ''}" title="Add to Favorites" onclick="toggleFav('${mail.id}')" style="width:36px;height:36px;"><span>★</span></div>
            `;
        }
    }

    bar.innerHTML = buttonsHTML;

    // Position bar: center-right over the row
    const rect = currentRow.getBoundingClientRect();
    const barW = isAdminSession ? (showingTrash ? 120 : 260) : (showingTrash ? 80 : 200);
    let left = rect.right - barW - 16;
    if (left < 8) left = 8;
    bar.style.left = left + 'px';
    bar.style.top = (rect.top + (rect.height - 46) / 2) + 'px';

    bar.classList.add('visible');
    window.lastOpenActionMailId = mail.id;

    // Keep bar visible when mouse is over it
    bar.onmouseenter = () => clearTimeout(window._rowHideTimer);
    bar.onmouseleave = () => {
        window._rowHideTimer = setTimeout(() => bar.classList.remove('visible'), 160);
    };
}

// ⭐ تعديل 4: تحديث زرار Trash في الـ Watermark Menu
function updateTrashMenuButton() {
    const trashMenuItem = document.querySelector('.menu-item[onclick="toggleTrashView()"]');
    if (trashMenuItem) {
        trashMenuItem.innerHTML = showingTrash ? '📥 Inbox' : '🗑️ Trash';
    }
    // عنوان الـ view فوق الجدول — يظهر بس في الترَاش
    const viewLabel = document.getElementById('currentViewLabel');
    if (viewLabel) {
        if (showingTrash) {
            viewLabel.style.display = 'inline-block';
            viewLabel.innerHTML = '🗑️ Trash';
            viewLabel.style.background = 'rgba(231,76,60,0.1)';
            viewLabel.style.color = '#c0392b';
            viewLabel.style.borderColor = 'rgba(231,76,60,0.3)';
        } else {
            viewLabel.style.display = 'none';
        }
    }
}

// ⭐ تعديل 8: حذف نهائي (Permanent Delete)
// Use window.selectedIdsForPermanentDelete to avoid quotes issues
function askPermanentDelete(id, mode = 'single') {
    const oldModal = document.getElementById('custom-confirm-modal');
    if (oldModal) oldModal.remove();

    const isBulk = mode === 'bulk';
    const selectedIds = isBulk ? getSelectedMailIds() : [id];
    if (isBulk && selectedIds.length === 0) return showToast('No mails selected ⚠️', 'error');

    window.selectedIdsForPermanentDelete = selectedIds;

    const modal = document.createElement('div');
    modal.id = 'custom-confirm-modal';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-icon" style="color:#c0392b;">✖</div>
            <h3 style="margin:0 0 10px; color:#c0392b; font-family:sans-serif;">Permanent Delete${isBulk ? ` (${selectedIds.length} mails)` : ''}?</h3>
            <p style="color:#666; font-family:sans-serif;">This action is <b>irreversible</b>. The mail will be permanently removed from the database and cannot be recovered.</p>
            <div class="modal-buttons">
                <button class="cancel-btn" onclick="closeConfirmModal()">Cancel</button>
                <button class="confirm-btn" style="background:#c0392b;" onclick="executePermanentDelete()">Delete Forever</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

async function executePermanentDelete() {
    const ids = window.selectedIdsForPermanentDelete || [];
    if (ids.length === 0) return;

    closeConfirmModal();
    document.querySelectorAll('.actions-container-row').forEach(el => el.remove());
    try {
        for (let id of ids) {
            await db.collection('mails').doc(id).delete();
        }
        showToast(`🗑️ ${ids.length} mail${ids.length > 1 ? 's' : ''} permanently deleted`, 'success');
        if (ids.length > 1) {
            document.getElementById('selectAllCheckbox').checked = false;
            updateBulkActionsBar();
        }
    } catch (e) {
        console.error(e);
        showToast('Error during permanent delete', 'error');
    }
}

function bulkPermanentDelete() {
    askPermanentDelete(null, 'bulk');
}

function toggleTrashView() {

    showingTrash = !showingTrash;
    closeWatermarkMenu();

    // ⭐ تعديل 1: مسح السيرش عند تغيير الـ view
    window.lastSearchTerm = '';
    const searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.value = '';
    const clearBtn = document.getElementById('searchClear');
    if (clearBtn) clearBtn.style.display = 'none';

    // ⭐ تعديل 4: تحديث الزرار
    updateTrashMenuButton();

    document.querySelectorAll('.actions-container-row').forEach(el => el.remove());

    const dataToRender = getVisibleMails();
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

        // ⭐ التعديل: إغلاق ذكي واحترافي يحترم الـ Focus جوا مربع البحث ويدي مهلة كافية
        const wrapper = dropdown.closest('.dropdown');
        if (wrapper) {
            wrapper.onmouseleave = () => {
                wrapper.leaveTimeout = setTimeout(() => {
                    // السيستم الاحترافي مش بيقفل القايمة لو العميل لسة بيكتب جوا السيرش!
                    if (dropdown.contains(document.activeElement)) {
                        document.activeElement.addEventListener('blur', () => {
                            setTimeout(() => {
                                if (!wrapper.matches(':hover')) dropdown.classList.remove("show");
                            }, 200);
                        }, { once: true });
                        return;
                    }
                    dropdown.classList.remove("show");
                    wrapper.onmouseleave = null;
                    wrapper.onmouseenter = null;
                }, 600); // 600ms سماحية في الحركة الاحترافية
            };
            wrapper.onmouseenter = () => {
                clearTimeout(wrapper.leaveTimeout);
            };
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

    // Cascading: calc available data based on other active filters
    let tempFilters = { ...activeFilters };
    delete tempFilters[field];
    // Also exclude 'category' temp filter when showing code column
    if (field === 'code') delete tempFilters['category'];

    let mailsForDropdown = getVisibleMails();
    if (Object.keys(tempFilters).length > 0) {
        mailsForDropdown = mailsForDropdown.filter(m => {
            return Object.keys(tempFilters).every(f => {
                const filterVal = tempFilters[f];
                if (f === 'keywords') {
                    const mailKeys = (m.keywords || m.sender || "").split(',').map(s => s.trim());
                    return mailKeys.includes(filterVal);
                }
                return (m[f] || "---") === filterVal;
            });
        });
    }

    // For 'code' field — show both unique codes AND categories as filter groups
    if (field === 'code') {
        const uniqueCategories = [...new Set(mailsForDropdown.map(m => m.category || 'General'))].sort();
        const uniqueCodes = [...new Set(mailsForDropdown.map(m => m.code || '---'))].sort();

        itemsContainer.innerHTML =
            '<div style="padding:4px 10px; font-size:10px; font-weight:700; color:#7f8c8d; text-transform:uppercase; letter-spacing:0.5px; border-bottom:1px solid rgba(0,0,0,0.07);">Filter by Status</div>' +
            uniqueCategories.map(val => `
                <div class="menu-item-option ${activeFilters['category'] === val ? 'active' : ''}" onclick="applyFilter('category', '${val.replace(/'/g, "\\'")}')"
                    style="padding-left:18px;">
                    ${val}
                    ${activeFilters['category'] === val ? '<span>✓</span>' : ''}
                </div>
            `).join('') +
            '<div style="padding:4px 10px; font-size:10px; font-weight:700; color:#7f8c8d; text-transform:uppercase; letter-spacing:0.5px; border-bottom:1px solid rgba(0,0,0,0.07); border-top:1px solid rgba(0,0,0,0.07); margin-top:4px;">Filter by Code</div>' +
            uniqueCodes.map(val => `
                <div class="menu-item-option ${activeFilters['code'] === val ? 'active' : ''}" onclick="applyFilter('code', '${val.replace(/'/g, "\\'")}')"
                    style="padding-left:18px;">
                    ${val}
                    ${activeFilters['code'] === val ? '<span>✓</span>' : ''}
                </div>
            `).join('');
        return;
    }

    let uniqueValues = [];
    if (field === 'keywords') {
        // Special logic for comma separated keywords
        const allKeywords = [];
        mailsForDropdown.forEach(m => {
            const keys = (m.keywords || m.sender || "").split(',').map(s => s.trim()).filter(s => s);
            allKeywords.push(...keys);
        });
        uniqueValues = [...new Set(allKeywords)];
    } else {
        uniqueValues = [...new Set(mailsForDropdown.map(m => m[field] || "---"))];
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
        delete activeFilters[field]; // deselect
    } else {
        activeFilters[field] = value;
    }

    refreshDisplay();
    // Update filter icons — 'category' uses the 'code' column icon
    ['code', 'topic', 'idea', 'keywords'].forEach(f => updateFilterIcon(f));
    // Show code column icon active when category filter is on
    if (field === 'category') {
        const codeIcon = document.querySelector('[onclick*="code"] .filter-icon');
        if (codeIcon) {
            if (activeFilters['category']) {
                codeIcon.classList.add('active');
                codeIcon.style.opacity = '1';
                codeIcon.style.color = '#f1c40f';
            } else {
                codeIcon.classList.remove('active');
                codeIcon.style.opacity = '0.4';
                codeIcon.style.color = 'white';
            }
        }
    }
    renderActiveFiltersBar();

    // Close dropdown after selection
    document.querySelectorAll(".dropdown-content").forEach(d => d.classList.remove("show"));

    // ⭐ تعديل: سلسلة الفلاتر تتفتح تلقائياً لو اخترت Topic أو Idea بس
    if (activeFilters[field] === value && (field === 'topic' || field === 'idea')) {
        setTimeout(() => {
            toggleDropdown(null, 'keywords');
        }, 150);
    }
}

// ⭐ إضافة شريط الفلاتر الذكي
function renderActiveFiltersBar() {
    let bar = document.getElementById('activeFiltersBar');
    if (!bar) {
        bar = document.createElement('div');
        bar.id = 'activeFiltersBar';
        bar.style.cssText = 'margin: 5px auto 12px; width: 94%; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; transition: all 0.3s; min-height: 24px;';
        const table = document.getElementById('table');
        table.parentNode.insertBefore(bar, table);
    }

    if (Object.keys(activeFilters).length === 0) {
        bar.innerHTML = '';
        return;
    }

    let html = `<span style="font-size: 13px; font-weight: bold; color: #7f8c8d; margin-right: 5px;">Active Filters:</span>`;
    for (let f in activeFilters) {
        const valSafe = activeFilters[f].replace(/'/g, "\\'");
        html += `<span style="background: #2980b9; color: white; padding: 4px 10px; border-radius: 12px; font-size: 11px; font-weight: bold; display: flex; align-items: center; gap: 6px; box-shadow: 0 2px 6px rgba(41,128,185,0.3);">
            <span style="opacity:0.8; text-transform:uppercase; font-size:9px;">${f}</span> ${activeFilters[f]}
            <span style="cursor: pointer; background: rgba(0,0,0,0.2); border-radius: 50%; width: 14px; height: 14px; display: flex; align-items: center; justify-content: center; font-size: 9px; transition: 0.2s;" onmouseover="this.style.background='rgba(231,76,60,0.8)'" onmouseout="this.style.background='rgba(0,0,0,0.2)'" onclick="applyFilter('${f}', '${valSafe}')">✖</span>
        </span>`;
    }

    html += `<span style="font-size: 11px; font-weight: bold; color: #e74c3c; cursor: pointer; margin-left: 10px; padding: 3px 8px; border-radius: 10px; transition: 0.2s;" onmouseover="this.style.background='rgba(231,76,60,0.1)'" onmouseout="this.style.background='transparent'" onclick="clearAllFilters()">🗑️ Clear All</span>`;
    bar.innerHTML = html;
}

function clearAllFilters() {
    activeFilters = {};
    refreshDisplay();
    ['code', 'topic', 'idea', 'keywords'].forEach(f => updateFilterIcon(f));
    renderActiveFiltersBar();
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
    const menu = document.getElementById("watermarkMenu");
    if (menu) {
        if (isAdminSession) {
            menu.classList.add('is-admin');
            menu.classList.remove('is-agent');
        } else {
            menu.classList.add('is-agent');
            menu.classList.remove('is-admin');
        }
    }
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

// ============================================================
// ===  MAIL BOX — Premium Functions (Zero-State / Zen Mode) ===
// ============================================================

/** Close the mail box (reset to zero-state) */
/** Close the mail box — if in Zen Mode, exit zen first; second press closes box */
function closeMailBox() {
    const box = document.getElementById('mailBox');
    if (!box) return;

    // If currently in Zen Mode, just exit zen mode (don't close the box)
    if (box.classList.contains('zen-mode')) {
        toggleMailZenMode(false);
        return;
    }

    // ✅ FIX #12: Ensure side panel mode is properly turned off so table expands again SMOOTHLY
    if (box.classList.contains('side-panel')) {
        box.classList.remove('visible', 'minimized', 'floating'); // ✅ FIX: Must remove visible so it can be re-opened later!
        box.style.transition = 'all 0.38s cubic-bezier(0.22, 1, 0.36, 1)';
        box.style.opacity = '0';
        box.style.flex = '0 0 0%';
        box.style.width = '0px';
        box.style.minWidth = '0px';
        box.style.padding = '0px';
        box.style.borderWidth = '0px';
        box.style.margin = '0px';
        
        setTimeout(() => {
            toggleSidePanelMode();
            box.style = ''; // reset inline styles
            box.style.display = 'none';
            box.innerHTML = '<h3 id="mailPlaceholder" style="display:none;">Select a mail</h3>';
            box.removeAttribute('data-category');
            window.currentlyOpenMailId = null;
        }, 380);
        return;
    }

    // Otherwise fully close the normal mail box
    box.classList.remove('visible', 'minimized', 'floating');
    box.style.opacity = '0';
    box.style.transform = 'translateY(20px)';
    setTimeout(() => {
        box.style.display = 'none';
        box.style.opacity = '';
        box.style.transform = '';
        box.innerHTML = '<h3 id="mailPlaceholder" style="display:none;">Select a mail</h3>';
        box.removeAttribute('data-category');
    }, 380);
    window.currentlyOpenMailId = null;
}

/** Toggle Zen Mode — 84vw centered, icon swaps to restore */
function toggleMailZenMode(enable) {
    const box = document.getElementById('mailBox');
    const overlay = document.getElementById('mailBoxOverlay');
    if (!box) return;

    const zenBtn = box.querySelector('[data-zen-btn]');

    if (enable) {
        box.classList.add('zen-mode');
        box.classList.remove('minimized');
        if (overlay) { overlay.style.display = 'block'; }
        document.body.style.overflow = 'hidden';
        if (zenBtn) { zenBtn.textContent = '⊡'; zenBtn.title = 'Exit Full Screen'; }
        // Close overlay click exits zen
        if (overlay) overlay.onclick = () => toggleMailZenMode(false);
    } else {
        box.classList.remove('zen-mode');
        if (overlay) { overlay.style.display = 'none'; overlay.onclick = null; }
        document.body.style.overflow = '';
        if (zenBtn) { zenBtn.textContent = '⛶'; zenBtn.title = 'Full Screen'; }
    }
}


/** Glassmorphism: add "floating" class when mail box is sticky over content */
(function initMailBoxScrollEffect() {
    window.addEventListener('scroll', () => {
        const box = document.getElementById('mailBox');
        if (!box || !box.classList.contains('visible')) return;
        const rect = box.getBoundingClientRect();
        if (rect.top <= 16) {
            box.classList.add('floating');
        } else {
            box.classList.remove('floating');
        }
    }, { passive: true });
})();

/** Fade gradient — hide when scrolled to bottom, show back-to-top when scrolled down */
function checkMailFade() {
    const body = document.getElementById('mailBoxBody');
    const fade = document.getElementById('mailBoxFade');
    const arrow = document.getElementById('mailBoxArrow');
    const topBtn = document.getElementById('mailBoxScrollTop');
    if (!body || !fade) return;
    const atBottom = body.scrollHeight - body.scrollTop - body.clientHeight < 10;
    const scrolledDown = body.scrollTop > 60;
    // Fade + down arrow
    if (atBottom) {
        fade.classList.add('hidden');
        if (arrow) arrow.classList.add('hidden');
    } else {
        fade.classList.remove('hidden');
        if (arrow) arrow.classList.remove('hidden');
    }
    // Back to top
    if (topBtn) {
        scrolledDown ? topBtn.classList.add('visible') : topBtn.classList.remove('visible');
    }
}

/** Font size — supports long press to hold and continuously resize */
let _fontSizeInterval = null;
function changeMailFontSize(delta) {
    const content = document.getElementById('mailBoxContent');
    const fsVal = document.getElementById('mailFontSizeVal');
    if (!content) return;
    let current = parseInt(content.style.fontSize || '15');
    current = Math.min(24, Math.max(11, current + delta));
    content.style.fontSize = current + 'px';
    if (fsVal) fsVal.textContent = current;
    localStorage.setItem('mailFontSize', current);
}

function startFontSizeHold(delta) {
    changeMailFontSize(delta);
    _fontSizeInterval = setInterval(() => changeMailFontSize(delta), 120);
}

function stopFontSizeHold() {
    clearInterval(_fontSizeInterval);
    _fontSizeInterval = null;
}

/** Ripple effect on action buttons */
function addRipple(e, btn) {
    const ripple = document.createElement('span');
    ripple.classList.add('ripple');
    const rect = btn.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    ripple.style.width = ripple.style.height = size + 'px';
    ripple.style.left = (e.clientX - rect.left - size / 2) + 'px';
    ripple.style.top = (e.clientY - rect.top - size / 2) + 'px';
    btn.appendChild(ripple);
    ripple.addEventListener('animationend', () => ripple.remove());
}

/** Confetti — HDB green palette, no sound */
function launchMailConfetti() {
    let canvas = document.getElementById('mailConfettiCanvas');
    if (!canvas) {
        canvas = document.createElement('canvas');
        canvas.id = 'mailConfettiCanvas';
        document.body.appendChild(canvas);
    }
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    canvas.style.opacity = '1';
    const ctx = canvas.getContext('2d');
    const colors = ['#2e7d32', '#27ae60', '#52c41a', '#a8e063', '#ffffff', '#b8f0c8'];
    const particles = Array.from({ length: 80 }, () => ({
        x: Math.random() * canvas.width,
        y: Math.random() * -100,
        r: Math.random() * 7 + 3,
        d: Math.random() * 80 + 10,
        color: colors[Math.floor(Math.random() * colors.length)],
        tilt: Math.random() * 10 - 5,
        tiltSpeed: Math.random() * 0.1 + 0.05,
        speed: Math.random() * 3 + 1.5
    }));
    let frame = 0;
    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        particles.forEach(p => {
            p.y += p.speed;
            p.tilt += p.tiltSpeed;
            p.x += Math.sin(p.tilt) * 1.5;
            ctx.beginPath();
            ctx.ellipse(p.x, p.y, p.r, p.r * 0.5, p.tilt, 0, 2 * Math.PI);
            ctx.fillStyle = p.color;
            ctx.fill();
        });
        frame++;
        if (frame < 120) requestAnimationFrame(draw);
        else {
            canvas.style.opacity = '0';
            setTimeout(() => { ctx.clearRect(0, 0, canvas.width, canvas.height); }, 400);
        }
    }
    draw();
}

/** Keyboard navigation — arrow up/down between mail rows */
(function initKeyboardNav() {
    let kbIndex = -1;
    document.addEventListener('keydown', (e) => {
        const rows = [...document.querySelectorAll('#tableBody tr[data-id]:not(.preview)')];
        if (!rows.length) return;
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            // Remove old focus
            rows.forEach(r => r.classList.remove('kb-focused'));
            if (e.key === 'ArrowDown') kbIndex = Math.min(kbIndex + 1, rows.length - 1);
            else kbIndex = Math.max(kbIndex - 1, 0);
            const target = rows[kbIndex];
            if (target) {
                target.classList.add('kb-focused');
                target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }
        }
        if (e.key === 'Enter' && kbIndex >= 0) {
            const target = rows[kbIndex];
            if (target) target.click();
        }
        if (e.key === 'Escape') closeMailBox();
    });
})();

/** Live time updater — updates every 60s */
(function initLiveTimeUpdater() {
    function updateTimes() {
        const el = document.getElementById('mailLiveTime');
        if (!el) return;
        const ts = el.getAttribute('data-ts');
        if (!ts) return;
        const d = new Date(parseInt(ts) * 1000);
        const diff = Math.floor((Date.now() - d) / 1000);
        let txt = '';
        if (diff < 60) txt = 'منذ ثوان';
        else if (diff < 3600) txt = `منذ ${Math.floor(diff / 60)} دقيقة`;
        else if (diff < 86400) txt = `منذ ${Math.floor(diff / 3600)} ساعة`;
        else if (diff < 172800) txt = 'أمس';
        else if (diff < 604800) txt = `منذ ${Math.floor(diff / 86400)} أيام`;
        else txt = d.toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' });
        el.textContent = txt;
    }
    setInterval(updateTimes, 60000);
})();

// ============================================================
// ===  NEW PREMIUM FEATURES — Round 2
// ============================================================

/** Peek Preview — hover card on table rows */
(function initPeekPreview() {
    let card = null;
    let hideTimer = null;

    function showPeek(e, m) {
        clearTimeout(hideTimer);
        if (!card) {
            card = document.createElement('div');
            card.className = 'peek-preview-card';
            document.body.appendChild(card);
        }
        const preview = (m.content || '').replace(/<[^>]*>/g, '').substring(0, 160);
        card.innerHTML = `
            <div class="peek-topic">${m.topic || ''}</div>
            <div class="peek-body">${preview}...</div>
        `;
        card.style.display = 'block';
        positionPeek(e);
    }

    function positionPeek(e) {
        if (!card) return;
        const x = e.clientX + 14;
        const y = e.clientY - 10;
        const cardW = 320;
        const cardH = 110;
        card.style.left = (x + cardW > window.innerWidth ? x - cardW - 20 : x) + 'px';
        card.style.top = (y + cardH > window.innerHeight ? y - cardH : y) + 'px';
    }

    function hidePeek() {
        hideTimer = setTimeout(() => {
            if (card) card.style.display = 'none';
        }, 120);
    }

    document.addEventListener('mouseover', (e) => {
        const row = e.target.closest('#tableBody tr[data-id]:not(.preview)');
        if (!row) { hidePeek(); return; }
        const id = row.getAttribute('data-id');
        const m = allMails.find(x => x.id === id);
        if (!m) return;
        showPeek(e, m);
    });

    document.addEventListener('mousemove', (e) => {
        if (card && card.style.display !== 'none') positionPeek(e);
    });

    document.addEventListener('mouseout', (e) => {
        const row = e.target.closest('#tableBody tr[data-id]:not(.preview)');
        if (row) hidePeek();
    });
})();

/** Toggle Minimize mail box — fold to header strip */
function toggleMailMinimize() {
    const box = document.getElementById("mailBox");
    if (!box) return;
    const btn = box.querySelector(".mail-box-minimize-btn");
    
    // If in Zen Mode, just exit Zen Mode instead of minimizing
    if (box.classList.contains("zen-mode")) {
        toggleMailZenMode(false);
        return;
    }
    
    if (box.classList.contains("minimized")) {
        box.classList.remove("minimized");
        if (btn) btn.innerHTML = "➖"; // Minus icon
        const hdr = box.querySelector(".mail-box-header");
        if (hdr) hdr.onclick = null;
    } else {
        box.classList.add("minimized");
        if (btn) btn.innerHTML = "➕"; // Plus icon
        const hdr = box.querySelector(".mail-box-header");
        if (hdr) hdr.onclick = (e) => {
            if (!e.target.closest(".mail-box-action-btn") && !e.target.closest(".mail-box-minimize-btn")) {
                toggleMailMinimize();
            }
        };
    }
}

/** Toggle Side Panel Mode — FIX #14 */
function toggleSidePanelMode() {
    const box = document.getElementById('mailBox');
    if (!box) return;

    const sidePanelBtn = box.querySelector('.mail-box-minimize-btn[title="Side Panel"]') ||
                         box.querySelector('.mail-box-minimize-btn');

    if (box.classList.contains('side-panel')) {
        // --- CLOSE side panel ---
        box.classList.remove('side-panel');
        document.body.classList.remove('side-panel-open');
        if (sidePanelBtn) sidePanelBtn.classList.remove('sp-active');

        // \u2705 FIX #14a: Force table area to restore full width
        const tableArea = document.getElementById('tableContentArea') || document.querySelector('.table-area');
        if (tableArea) {
            tableArea.style.flex = '';
            tableArea.style.maxWidth = '';
        }
    } else {
        // --- OPEN side panel ---
        box.classList.remove('zen-mode', 'minimized');
        toggleMailZenMode(false);
        box.classList.add('side-panel');
        document.body.classList.add('side-panel-open');

        // \u2705 FIX #14b: Mark button active so user sees it is toggled on
        if (sidePanelBtn) sidePanelBtn.classList.add('sp-active');

        // \u2705 FIX #14c: Force overflow-y:auto on mailBoxBody in case it was overridden
        const bodyEl = document.getElementById('mailBoxBody');
        if (bodyEl) {
            bodyEl.style.overflowY = 'auto';
            bodyEl.style.maxHeight = '';
        }

        // \u2705 FIX #14d: Re-run checkMailFade to sync scroll arrows for side-panel view
        setTimeout(checkMailFade, 80);
    }
}

/** Updated copyMailContent — with icon feedback */
function copyMailContent() {
    const contentEl = document.getElementById('mailBoxContent');
    if (!contentEl) return;
    const text = contentEl.innerText || contentEl.textContent || '';

    // Find the copy button in action bar
    const btns = document.querySelectorAll('.mail-box-action-btn');
    let copyBtn = null;
    btns.forEach(b => { if (b.title === 'Copy content') copyBtn = b; });

    navigator.clipboard.writeText(text).then(() => {
        showToast('✅ Mail content copied!', 'success');
        if (copyBtn) {
            const orig = copyBtn.innerHTML;
            copyBtn.innerHTML = '✅';
            copyBtn.style.background = '#27ae60';
            copyBtn.style.color = 'white';
            setTimeout(() => {
                copyBtn.innerHTML = orig;
                copyBtn.style.background = '';
                copyBtn.style.color = '';
            }, 2000);
        }
    }).catch(() => {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        showToast('✅ Copied!', 'success');
    });
}

/** Number/Term highlighting — DISABLED (user feedback: disrupts mail layout) */
function enhanceMailContent(html) {
    return html; // pass-through only
}

/** Detect if content is mostly Arabic (RTL) */
function detectContentDirection(htmlContent) {
    const text = htmlContent.replace(/<[^>]*>/g, '');
    const arabicChars = (text.match(/[\u0600-\u06FF]/g) || []).length;
    const totalChars = text.replace(/\s/g, '').length;
    return (totalChars > 0 && arabicChars / totalChars > 0.4) ? 'rtl' : 'ltr';
}

// ============================================================
// ===  AGENT PRIORITY STAR (per-agent, localStorage)
// ============================================================

/** Toggle star priority for a mail (agent only) */
function toggleAgentPriority(mailId, starEl) {
    const key = `agentPriority_${currentUser || 'agent'}`;
    const stars = JSON.parse(localStorage.getItem(key) || '{}');
    const isActive = stars[mailId];
    if (isActive) {
        delete stars[mailId];
        starEl.classList.remove('active');
        starEl.title = 'Mark as Important';
    } else {
        stars[mailId] = true;
        starEl.classList.add('active');
        starEl.title = 'Remove Priority';
    }
    localStorage.setItem(key, JSON.stringify(stars));
    // Re-render table to apply visual update
    renderTable();
}

/** Check if a mail is starred by current agent */
function isMailStarred(mailId) {
    const key = `agentPriority_${currentUser || 'agent'}`;
    const stars = JSON.parse(localStorage.getItem(key) || '{}');
    return !!stars[mailId];
}

// ============================================================
// ===  TAG SUGGESTIONS (Admin Compose Form)
// ============================================================

function showTagSuggestions(inputEl) {
    const box = document.getElementById('tagSuggestionsBox');
    if (!box) return;

    const raw = inputEl.value;
    const parts = raw.split(',');
    const typing = parts[parts.length - 1].trim().toLowerCase();

    if (!typing) { box.style.display = 'none'; return; }

    // Collect all existing tags from allMails
    const allTags = new Set();
    allMails.forEach(m => { if (m.tags) m.tags.forEach(t => allTags.add(t)); });

    const matches = [...allTags].filter(t => t.toLowerCase().startsWith(typing) && t.toLowerCase() !== typing);

    if (!matches.length) { box.style.display = 'none'; return; }

    box.innerHTML = matches.slice(0, 8).map(t => `
        <div onclick="acceptTagSuggestion('${t}', document.getElementById('addTags'))"
             style="padding:7px 12px; cursor:pointer; font-size:13px; color:#2e7d32; font-weight:600; border-bottom:1px solid rgba(46,125,50,0.07);"
             onmouseover="this.style.background='rgba(46,125,50,0.07)'"
             onmouseout="this.style.background=''">
            + ${t}
        </div>`).join('');
    box.style.display = 'block';

    // Close on outside click
    document.addEventListener('click', () => { box.style.display = 'none'; }, { once: true });
}

function acceptTagSuggestion(tag, inputEl) {
    const parts = inputEl.value.split(',');
    parts[parts.length - 1] = ' ' + tag;
    inputEl.value = parts.join(',').replace(/^,\s*/, '') + ', ';
    inputEl.focus();
    const box = document.getElementById('tagSuggestionsBox');
    if (box) box.style.display = 'none';
}

// ============================================================
// ===  COMPACT CARD MODE (Inline expand in table)
// ============================================================

let _compactOpenId = null;

function toggleCompactCard(mailId) {
    const tbody = document.getElementById('tableBody');
    if (!tbody) return;

    // If same mail, close it
    if (_compactOpenId === mailId) {
        const existing = document.getElementById('compactCard_' + mailId);
        if (existing) existing.parentElement.remove();
        _compactOpenId = null;
        return;
    }

    // Close any previously open compact card
    if (_compactOpenId) {
        const old = document.getElementById('compactCard_' + _compactOpenId);
        if (old) old.parentElement.remove();
    }

    const m = allMails.find(x => x.id === mailId);
    if (!m) return;
    _compactOpenId = mailId;

    const row = tbody.querySelector(`tr[data-id="${mailId}"]`);
    if (!row) return;

    const contentClean = (m.content || '').replace(/<[^>]*>/g, '').substring(0, 400);
    const colSpan = row.cells.length || 6;

    const cardRow = document.createElement('tr');
    cardRow.className = 'compact-card-row';
    cardRow.innerHTML = `<td colspan="${colSpan}" style="padding:0; border:none;">
        <div class="compact-mail-card" id="compactCard_${mailId}">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                <strong style="font-size:13px; color:#1a2e1b;">${m.topic || ''}</strong>
                <button onclick="document.getElementById('compactCard_${mailId}').closest('tr').remove(); _compactOpenId=null;"
                    style="background:none; border:none; cursor:pointer; color:#aaa; font-size:16px; padding:0 4px;">&times;</button>
            </div>
            <p style="font-size:12px; color:#555; line-height:1.7; margin:0 0 8px;">${contentClean}${m.content && m.content.length > 400 ? '...' : ''}</p>
            <div style="display:flex; gap:8px; font-size:11px; color:#aaa;">
                <span>📅 ${m.createdAt ? new Date(m.createdAt.seconds * 1000).toLocaleDateString('ar-EG') : ''}</span>
                ${m.content && m.content.length > 800 ? `<button onclick="document.getElementById('compactCard_${mailId}').closest('tr').remove(); _compactOpenId=null; document.querySelector('[data-id=\\'${mailId}\\']').click();" style="background:rgba(46,125,50,0.1); color:#2e7d32; border:none; border-radius:6px; padding:2px 8px; cursor:pointer; font-size:11px;">Open Full ↗</button>` : ''}
            </div>
        </div>
    </td>`;

    row.after(cardRow);
}

// ============================================================
// ===  READ BY DEADLINE (Admin View in Mail Box)
// ============================================================

/** Show deadline countdown in mail box footer — admin only */
function renderDeadlineChip(expiryDateStr) {
    if (!expiryDateStr || !isAdminSession) return '';
    const expiry = new Date(expiryDateStr);
    const now = new Date();
    const diff = expiry - now;
    if (diff < 0) return `<span style="background:#e74c3c; color:white; font-size:11px; padding:2px 8px; border-radius:20px; font-weight:700;">⏰ Expired</span>`;
    const days = Math.floor(diff / 86400000);
    const hrs = Math.floor((diff % 86400000) / 3600000);
    const color = days < 1 ? '#e74c3c' : days < 3 ? '#e67e22' : '#27ae60';
    return `<span style="background:${color}; color:white; font-size:11px; padding:3px 10px; border-radius:20px; font-weight:700;">⏰ ${days > 0 ? days + 'd ' : ''}${hrs}h left</span>`;
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

    // تحديث الـ Category بناءً على الـ DB
    document.getElementById('addCategory').value = mail.category || "General";
    checkCustomCategory();
    if (document.getElementById('addCategory').value === "Custom") {
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

    if (!isAdminSession || selected.length < 2) {
        bulkBar.style.display = 'none';
        // ✅ FIX #6: Bulk delete only appears with 2+ selected mails
    } else {
        bulkBar.style.display = 'flex';
        countLabel.innerText = `${selected.length}`;

        // ⭐ تعديل 8: تغيير وظيفة الزرار الـ Bulk وشكله وإحنا في الترَاش
        const textSpan = bulkBar.querySelector('span');
        if (showingTrash) {
            bulkBar.style.background = '#c0392b';
            bulkBar.setAttribute('onclick', 'bulkPermanentDelete()');
            if (textSpan) textSpan.innerHTML = '✖ Delete Forever Selected';
        } else {
            bulkBar.style.background = 'rgba(231, 76, 60, 0.9)';
            bulkBar.setAttribute('onclick', 'bulkDelete()');
            if (textSpan) textSpan.innerHTML = '🗑️ Delete Selection';
        }
    }

    if (selectAllCheckbox) {
        selectAllCheckbox.checked = totalCheckboxes > 0 && selected.length === totalCheckboxes;
        selectAllCheckbox.indeterminate = selected.length > 0 && selected.length < totalCheckboxes;
    }
}

// Confirm Read Function
async function confirmReadMail(id, buttonEl, version) {
    if (!currentUser) {
        showToast("Please login first ⚠️", "error");
        return;
    }

    const mail = allMails.find(m => m.id === id);
    if (!mail) return;

    // ⭐ تعديل 9: حفظ نسخة الميل إياها في التأكيد لتفادي ظهور التأكيد القديم
    let agentConfirmedVersions = JSON.parse(localStorage.getItem('agentConfirmedVersions') || '{}');
    agentConfirmedVersions[id] = version;
    localStorage.setItem('agentConfirmedVersions', JSON.stringify(agentConfirmedVersions));

    // ✅ FIX #10: Remove confetti — just silent feedback without removing the button to avoid layout jump
    buttonEl.innerHTML = '✅ Confirmed!';
    buttonEl.style.background = '#27ae60';
    buttonEl.style.transform = 'none';
    buttonEl.disabled = true;

    // We do NOT remove the button anymore, to keep the row height stable.

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

// ⭐ تعديل 6: عرض نافذة الـ History
/** Save admin private note to localStorage */
function saveAdminNote(mailId) {
    const ta = document.getElementById('adminQuickNote');
    if (!ta) return;
    const notes = JSON.parse(localStorage.getItem('adminNotes') || '{}');
    notes[mailId] = ta.value.trim();
    localStorage.setItem('adminNotes', JSON.stringify(notes));
    // Visual feedback
    const btn = ta.nextElementSibling;
    if (btn) {
        const orig = btn.textContent;
        btn.textContent = '✅ Saved!';
        btn.style.background = 'linear-gradient(135deg,#27ae60,#2ecc71)';
        setTimeout(() => { btn.textContent = orig; btn.style.background = 'linear-gradient(135deg,#2e7d32,#27ae60)'; }, 1500);
    }
}

function showHistoryLog(id) {
    const m = allMails.find(x => x.id === id);
    if (!m || !m.historyLog || m.historyLog.length === 0) return;

    let html = `<div style="padding: 10px 5px; max-height: 500px; overflow-y: auto;">`;

    // Sort descending so newest is first
    const sortedLogs = [...m.historyLog].reverse();

    sortedLogs.forEach((log) => {
        const d = new Date(log.modifiedAt).toLocaleString('en-US', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
        html += `
            <div style="margin-bottom: 20px; border: 1px solid #eee; padding: 15px; border-radius: 8px; background: #fff; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
                <div style="display: flex; justify-content: space-between; margin-bottom: 12px; border-bottom: 2px dashed #eee; padding-bottom: 8px;">
                    <div style="color: #34495e; font-size:14px;">🔄 Edited by <strong style="color:#2c3e50;">${log.modifiedBy || 'Unknown'}</strong></div>
                    <div style="color: #7f8c8d; font-size:12px;">🕒 ${d}</div>
                </div>
                <div style="background: #fff5f5; padding: 12px; border-radius: 6px; border-left: 4px solid #e74c3c;">
                    <div style="font-weight: 800; color: #c0392b; margin-bottom: 8px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">🔴 Old Version Details</div>
                    <div style="font-size: 13px; color: #2c3e50; display: flex; flex-direction: column; gap: 6px;">
                        <div><strong style="color:#7f8c8d;">Topic:</strong> ${log.old.topic || 'N/A'}</div>
                        <div><strong style="color:#7f8c8d;">Status:</strong> <span style="background:#e74c3c; color:white; padding:1px 6px; border-radius:4px; font-size:10px;">${log.old.category || 'N/A'}</span></div>
                        <div style="margin-top: 5px; font-weight: bold; color:#7f8c8d;">Content:</div>
                        <div style="background: white; padding: 10px; border: 1px solid #f1a9a0; border-radius: 4px; max-height: 150px; overflow-y: auto;">${log.old.content || '<em style="color:#aaa;">No Content</em>'}</div>
                    </div>
                </div>
            </div>
        `;
    });

    html += `</div>`;
    showCustomModal(`📝 History Log for: ${m.code}`, html);
}

// --- Manage Options Modal ---
let currentManageType = '';

function openManageModal(type) {
    currentManageType = type;
    const titles = {
        topics: '📂 Manage Topics',
        senders: '👤 Manage Senders',
        categories: '🎨 Manage Categories'
    };
    document.getElementById('manageTitle').innerText = titles[type] || 'Manage Options';
    document.getElementById('newOptionInput').value = '';

    // ⭐ تعديل 10: إضافة حقل اختيار اللون لو بنتحكم في الـ Categories
    let colorPicker = document.getElementById('manageColorPicker');
    if (!colorPicker) {
        colorPicker = document.createElement('input');
        colorPicker.type = 'color';
        colorPicker.id = 'manageColorPicker';
        colorPicker.style.cssText = 'height: 38px; border:none; padding:0; width:50px; cursor: pointer; border-radius:5px; margin-right:5px;';

        const inputDiv = document.getElementById('newOptionInput').parentElement;
        inputDiv.insertBefore(colorPicker, document.getElementById('newOptionInput'));
    }
    colorPicker.style.display = type === 'categories' ? 'block' : 'none';

    renderManageList();
    document.getElementById('manageOptionsModal').style.display = 'flex';
}

function renderManageList() {
    const list = document.getElementById('optionsList');
    const arr = appSettingsOptions[currentManageType] || [];

    if (currentManageType === 'categories') {
        list.innerHTML = arr.map(item => `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:10px; border-bottom:1px solid #ddd;">
                <span style="font-weight:bold; color:${item.color};">${item.name} <span style="background:${item.color}; width:10px; height:10px; display:inline-block; border-radius:50%; margin-left:5px;"></span></span>
                <button onclick="removeOption('${item.name.replace(/'/g, "\\'")}')" style="background:#e74c3c; color:white; border:none; border-radius:50%; width:30px; height:30px; cursor:pointer; font-weight:bold;">×</button>
            </div>
        `).join('');
    } else {
        list.innerHTML = arr.map(item => `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:10px; border-bottom:1px solid #ddd;">
                <span style="font-weight:bold; color:#333;">${item}</span>
                <button onclick="removeOption('${item.replace(/'/g, "\\'")}')" style="background:#e74c3c; color:white; border:none; border-radius:50%; width:30px; height:30px; cursor:pointer; font-weight:bold;">×</button>
            </div>
        `).join('');
    }
}

function addCurrentOption() {
    const val = document.getElementById('newOptionInput').value.trim();
    if (!val) return;

    if (!appSettingsOptions[currentManageType]) appSettingsOptions[currentManageType] = [];

    if (currentManageType === 'categories') {
        const color = document.getElementById('manageColorPicker').value || '#95a5a6';
        if (!appSettingsOptions.categories.find(c => c.name === val)) {
            appSettingsOptions.categories.push({ name: val, color: color });
        }
    } else {
        if (!appSettingsOptions[currentManageType].includes(val)) {
            appSettingsOptions[currentManageType].push(val);
        }
    }

    db.collection("appSettings").doc("options").set(appSettingsOptions);
    document.getElementById('newOptionInput').value = '';
    renderManageList();
}

function removeOption(val) {
    if (currentManageType === 'categories') {
        appSettingsOptions.categories = appSettingsOptions.categories.filter(c => c.name !== val);
    } else {
        appSettingsOptions[currentManageType] = appSettingsOptions[currentManageType].filter(x => x !== val);
    }
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

        // ⭐ تعديل 6: حفظ الـ History بتاع التعديلات مع الاحتفاظ بآخر نقطتين بس عشان المساحة
        let oldHistory = oldMail.historyLog || [];
        if (oldHistory.length >= 2) oldHistory = oldHistory.slice(-1);

        const newLog = {
            modifiedAt: new Date().toISOString(),
            modifiedBy: safeUsername,
            old: {
                topic: oldMail.topic || "",
                category: oldMail.category || "",
                content: oldMail.content || ""
            }
        };
        oldHistory.push(newLog);

        const updateData = {
            topic, idea, keywords, content,
            category, categoryColor, tags, requireReadReceipt,
            attachmentUrl, isDraft, publishAt, isSticky,
            expiryDate: expiry || null,
            lastUpdatedAt: new Date().toISOString(), // ⭐ تعديل 5 و 9
            readConfirmations: firebase.firestore.FieldValue.delete(), // ⭐ تعديل 9: مسح التأكيدات السابقة
            historyLog: oldHistory
        };

        try {
            await docRef.update(updateData);
        } catch (updateErr) {
            if (updateErr.message && (updateErr.message.includes('too large') || updateErr.code === 'out-of-range')) {
                console.warn("Document too large, emergency clearing history...");
                updateData.historyLog = [newLog]; // Reset history to just the last one
                await docRef.update(updateData);
            } else {
                throw updateErr;
            }
        }

        cancelEdit();
        // ✅ FIX #9: Clear from publishedMailIds so scheduled trigger works fresh after edit
        if (typeof window._publishedMailIds !== 'undefined') window._publishedMailIds.delete(currentlyEditingId);
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
        await db.collection("mails").doc(id).update({
            isDeleted: true,
            deletedAt: new Date().toISOString(),
            keepInTrash: false
        });
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
    const roleEl = document.getElementById('newUserRole'); if (roleEl) roleEl.value = 'agent';

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

        // T8: Hide delete for protected accounts AND for all admin role accounts
        const isProtected = ['primary_admin'].includes((u.username || '').toLowerCase()) || u.role === 'admin';
        const deleteBtnHTML = isProtected ? `<span style="font-size:18px;" title="${u.role === 'admin' ? 'Admin — Cannot Delete' : 'Protected Account'}">🛡️</span>` : `<button onclick="deleteDocUser('${u.id}', '${u.username}')" style="background:#e74c3c; color:white; border:none; border-radius:4px; padding:5px 10px; cursor:pointer; font-size:12px;">Delete</button>`;

        listArea.innerHTML += `
            <div class="user-row-admin" data-name="${u.username.toLowerCase()}" style="display:flex; justify-content:space-between; align-items:center; padding:16px; margin-bottom:10px; background:white; border:1px solid #eef2f5; border-radius:12px; box-shadow:0 2px 8px rgba(0,0,0,0.04);">
                <div style="display:flex; align-items:center; gap:14px; flex:1;">
                    <div class="user-avatar" style="width:40px; height:40px; font-size:16px;">${avatarStr}</div>
                    <div style="display:flex; flex-direction:column; gap:2px;">
                        <div style="display:flex; align-items:center; gap:8px;">
                            <strong style="color:#2c3e50; font-size:15px;">${u.username}</strong>
                            <span class="${roleBadgeClass}">${u.role}</span>
                        </div>
                        ${lastLoginHTML}
                    </div>
                </div>
                
                <div style="display:flex; gap:12px; align-items:center;">
                    <div class="pass-container" title="User Password" style="background:#f8f9fa; padding:4px 8px; border-radius:8px; border:1px solid #e9ecef;">
                        <input type="password" id="pass_${u.id}" class="pass-input" value="${u.password || ''}" readonly style="background:transparent; border:none; width:90px; color:#555; font-size:13px;">
                        <button class="icon-btn" onclick="toggleAdminPassVisibility('${u.id}')" title="Show/Hide">👁️</button>
                        <button class="icon-btn" onclick="copyAdminPass('${u.id}')" title="Copy">📋</button>
                        <button class="icon-btn" onclick="changeUserPassword('${u.id}', '${(u.username||'').replace(/'/g, '')}')" title="Change Password" style="color:#e67e22;">✏️</button>
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

// M6: Inline password change — premium UI instead of browser prompt
async function changeUserPassword(userId, username) {
    // Remove any existing inline form for this user
    const existingForm = document.getElementById(`pass-form-${userId}`);
    if (existingForm) { existingForm.remove(); return; } // Toggle off if already open

    // Find the user row
    const userRow = document.querySelector(`.user-row-admin[data-name="${username.toLowerCase()}"]`);
    if (!userRow) return;

    // Build inline form
    const formDiv = document.createElement('div');
    formDiv.id = `pass-form-${userId}`;
    formDiv.style.cssText = [
        'padding: 14px 16px',
        'background: linear-gradient(135deg, rgba(46,125,50,0.06), rgba(39,174,96,0.03))',
        'border: 1px solid rgba(46,204,113,0.2)',
        'border-radius: 10px',
        'margin: 6px 10px 10px 10px',
        'display: flex',
        'flex-direction: column',
        'gap: 10px',
        'animation: slideDown 0.2s ease'
    ].join(';');

    if (!document.getElementById('pass-form-style')) {
        const s = document.createElement('style');
        s.id = 'pass-form-style';
        s.textContent = '@keyframes slideDown{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}';
        document.head.appendChild(s);
    }

    formDiv.innerHTML = `
        <div style="font-size:12px; font-weight:700; color:#2e7d32; margin-bottom:2px;">🔐 Change Password for "<strong>${username}</strong>"</div>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <input type="password" id="newPassInput_${userId}" placeholder="New Password" 
                style="flex:1; min-width:140px; padding:8px 12px; border:1px solid rgba(46,204,113,0.3); border-radius:8px; font-size:13px; outline:none; background:rgba(255,255,255,0.9);">
            <input type="password" id="confirmPassInput_${userId}" placeholder="Confirm Password"
                style="flex:1; min-width:140px; padding:8px 12px; border:1px solid rgba(46,204,113,0.3); border-radius:8px; font-size:13px; outline:none; background:rgba(255,255,255,0.9);">
        </div>
        <div id="passFormError_${userId}" style="color:#e74c3c; font-size:11px; font-weight:600; display:none;"></div>
        <div style="display:flex; gap:8px; justify-content:flex-end;">
            <button onclick="document.getElementById('pass-form-${userId}').remove()" 
                style="padding:7px 16px; border:1px solid #ddd; border-radius:8px; background:transparent; cursor:pointer; font-size:12px; color:#666;">Cancel</button>
            <button onclick="confirmPasswordChange('${userId}', '${username}')"
                style="padding:7px 18px; border:none; border-radius:8px; background:linear-gradient(135deg,#2e7d32,#27ae60); color:white; font-weight:700; cursor:pointer; font-size:12px; box-shadow:0 2px 8px rgba(46,125,50,0.3);">
                ✅ Update Password
            </button>
        </div>
    `;

    userRow.insertAdjacentElement('afterend', formDiv);
    document.getElementById(`newPassInput_${userId}`).focus();
}

async function confirmPasswordChange(userId, username) {
    const newPass = document.getElementById(`newPassInput_${userId}`).value.trim();
    const confirmPass = document.getElementById(`confirmPassInput_${userId}`).value.trim();
    const errEl = document.getElementById(`passFormError_${userId}`);

    // Validation
    if (newPass.length < 3) {
        errEl.textContent = '⚠️ Password must be at least 3 characters';
        errEl.style.display = 'block'; return;
    }
    if (newPass !== confirmPass) {
        errEl.textContent = '❌ Passwords do not match — please try again';
        errEl.style.display = 'block';
        document.getElementById(`confirmPassInput_${userId}`).style.borderColor = '#e74c3c';
        return;
    }

    formDiv.onclick = (e) => e.stopPropagation();

    try {
        await db.collection('users').doc(userId).update({ password: newPass, forceLogout: true });
        // Update visible input live
        const inp = document.getElementById('pass_' + userId);
        if (inp) inp.value = newPass;
        // Close the form
        const form = document.getElementById(`pass-form-${userId}`);
        if (form) form.remove();
        showToast(`✅ Password updated for "${username}"`, 'success');
    } catch (e) {
        console.error(e);
        errEl.textContent = '❌ Failed to update: ' + e.message;
        errEl.style.display = 'block';
    }
}

async function createNewUser() {
    const username = document.getElementById('newUserName').value.trim();
    const pass = document.getElementById('newUserPass').value.trim();
    const role = 'agent';

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

    // T8: Protection for Primary Admin and ALL admin accounts
    const protectedNames = ['primary_admin'];
    if (protectedNames.includes(username.toLowerCase())) {
        return showToast("Cannot delete the Primary Admin account!", "error");
    }

    // T8: Block deletion of any user with role='admin'
    const userDoc = window.allUsersCache ? window.allUsersCache.find(u => u.id === id) : null;
    if (userDoc && userDoc.role === 'admin') {
        return showToast("Cannot delete an Admin account. Demote the user first.", "error");
    }

    if (confirm(`Are you sure you want to delete user "${username}"?`)) {
        await db.collection('users').doc(id).delete();
        showToast("User successfully removed", "success");
    }
}

// ==========================================
// ⭐ تعديل 5: نظام الإشعارات الذكي (Announcement Banner)
// ==========================================
function renderStickyBanners() {
    if (isAdminSession) return; // الأدمن مش محتاج يشوف البانر المزعج

    const bannerContainer = document.getElementById('globalAnnouncementBar');
    const content = document.getElementById('broadcastContent');
    if (!bannerContainer || !content) return;

    // بنجيب أحدث ميل بس الأول نتأكد إنه المفروض يظهر أصلا (عشان نستثني الـ Scheduled)
    const visibleNow = getVisibleMails();
    let agentConfirmedVersions = JSON.parse(localStorage.getItem('agentConfirmedVersions') || '{}');

    // ✅ FIX #5: Don't show sticky banner if agent already confirmed reading it
    const stickyMails = visibleNow.filter(m => {
        if (!m.isSticky) return false;
        if (!m.requireReadReceipt) return true; // Keep sticky if it doesn't require confirmation
        const mailVer = m.lastUpdatedAt || m.createdAt?.seconds || "v1";
        return agentConfirmedVersions[m.id] !== mailVer; // Only show if NOT confirmed
    });

    if (stickyMails.length === 0) {
        bannerContainer.style.display = 'none';
        return;
    }

    // ترتيب عشان نجيب أحدث واحد
    stickyMails.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const latestSticky = stickyMails[0];

    // لو الـ Agent قفل البانر ده قبل كدا (بنفس الـ Update) مش هيظهر تاني
    const dismissedBanners = JSON.parse(localStorage.getItem('dismissedBanners') || '{}');
    const mailVersion = latestSticky.lastUpdatedAt || latestSticky.createdAt;

    if (dismissedBanners[latestSticky.id] === mailVersion) {
        bannerContainer.style.display = 'none';
        return;
    }

    // عرض البانر المحدث وتغيير العنوان لـ Important Update
    content.innerHTML = `
        <span style="font-size: 24px;">📢</span>
        <div>
            <strong style="display:block; font-size:16px; margin-bottom:2px; font-weight:800;">Important Update</strong>
            <div style="display:flex; align-items:center; gap:8px;">
                <span style="font-size:11px; text-transform:uppercase; font-weight:bold; background:rgba(255,255,255,0.2); padding:2px 6px; border-radius:4px;">${latestSticky.category || 'General'}</span>
                <span style="font-size:13px; opacity:0.95;">${latestSticky.topic}</span>
            </div>
        </div>
        <button onclick="viewStickyMail('${latestSticky.id}', '${mailVersion}')" style="margin-left: 20px; background: white; color: #c0392b; border: none; padding: 6px 14px; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 12px; box-shadow: 0 4px 10px rgba(0,0,0,0.1); transition: 0.2s;">View Mail ➔</button>
    `;
    bannerContainer.style.display = 'flex';
}

function viewStickyMail(id, version) {
    // 1. اخفاء البانر فورا
    const bannerContainer = document.getElementById('globalAnnouncementBar');
    if (bannerContainer) bannerContainer.style.display = 'none';

    // 2. تحديث الـ LocalStorage عشان ميظهرش تاني لنفس النسخة
    let dismissed = JSON.parse(localStorage.getItem('dismissedBanners') || '{}');
    dismissed[id] = version;
    localStorage.setItem('dismissedBanners', JSON.stringify(dismissed));

    // 3. مسح السيرش عشان يضمن ان الميل موجود في الجدول العادي
    const searchInput = document.getElementById('searchInput');
    if (searchInput && searchInput.value !== '') {
        searchInput.value = '';
        window.lastSearchTerm = '';
        refreshDisplay();
    }

    // 4. فتح الميل في الجدول
    setTimeout(() => {
        const tbody = document.querySelector('#table tbody');
        if (!tbody) return;

        // البحث الدقيق عن الصف باستخدام الـ data-id اللي ضفناه
        let matchedRow = tbody.querySelector(`tr[data-id="${id}"]`);

        if (matchedRow) {
            matchedRow.click();
            // Scroll لأسفل عشان الميل يظهر بشكل سريع ومباشر
            setTimeout(() => {
                const mailBox = document.getElementById('mailBox');
                if (mailBox) {
                    const boxTop = mailBox.getBoundingClientRect().top + window.scrollY - 80;
                    window.scrollTo({ top: boxTop, behavior: 'instant' });
                    // ومضة تأكيدية للميل عشان عينه تنزل عليه مباشر
                    mailBox.style.transition = 'box-shadow 0.3s ease';
                    mailBox.style.boxShadow = '0 0 0 3px rgba(46, 204, 113, 0.5), 0 4px 25px rgba(0,0,0,0.1)';
                    setTimeout(() => mailBox.style.boxShadow = 'none', 1000);
                }
            }, 50);
        } else {
            showToast("Mail might be hidden or deleted.", "warning");
        }
    }, 100);
}

// ═══════════════════════════════════════════════════════════════
// DASHBOARD INTEGRATION FUNCTIONS
// ═══════════════════════════════════════════════════════════════

// Opens dashboard in a new tab (admin only)
function openAdminDashboard() {
    closeWatermarkMenu();
    window.open('admin-dashboard/index.html', '_blank');
}

// ─── Force Read Popup ────────────────────────────────────────────
function showForceReadPopup(mailCode, cmdId) {
    const existing = document.getElementById('force-read-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'force-read-modal';
    modal.innerHTML = `
        <div style="position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.85);backdrop-filter:blur(8px);z-index:999999;display:flex;align-items:center;justify-content:center;">
            <div style="background:linear-gradient(135deg, #25283d, #1a1c29); border:1px solid rgba(255,255,255,0.1); padding:40px 30px; border-radius:16px; text-align:center; color:white; box-shadow:0 15px 40px rgba(0,0,0,0.4); max-width:400px; width:90%; animation:zoomIn 0.3s ease-out;">
                <div style="font-size:40px; margin-bottom:15px; display:inline-block; padding:10px 15px; border-radius:8px; filter:drop-shadow(0 2px 4px rgba(0,0,0,0.3));">📧</div>
                <h2 style="font-size:22px; margin-bottom:12px; color:#a29bfe; font-weight:700;">Action Required</h2>
                <p style="font-size:14px; margin-bottom:20px; color:#ccc;">Management has requested you to review mail:</p>
                <div style="font-size:32px; font-weight:800; color:#a29bfe; margin-bottom:30px; letter-spacing:2px; filter:drop-shadow(0 0 8px rgba(162,155,254,0.3));">${mailCode}</div>
                <button onclick="acknowledgeCommand('${cmdId}','force-read-modal'); scrollToMail('${mailCode}')"
                    style="background:#a29bfe; color:white; border:none; padding:14px 30px; border-radius:50px; font-weight:700; font-size:15px; cursor:pointer; width:100%; transition:transform 0.2s;">
                    📖 Understood, I'll Review It
                </button>
            </div>
            <style>@keyframes zoomIn { from { opacity:0; transform:scale(0.9); } to { opacity:1; transform:scale(1); } }</style>
        </div>`;
    document.body.appendChild(modal);
}

// ─── Personal Warning Popup ──────────────────────────────────────
function showPersonalWarningPopup(message, sentBy, cmdId) {
    const existing = document.getElementById('personal-warn-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'personal-warn-modal';
    modal.innerHTML = `
        <div style="position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.85);backdrop-filter:blur(8px);z-index:999999;display:flex;align-items:center;justify-content:center;">
            <div style="background:#11120d; border:1px solid #f1c40f; padding:40px 30px; border-radius:16px; text-align:center; color:white; box-shadow:0 0 50px rgba(241,196,15,0.15); max-width:320px; width:90%; animation:zoomIn 0.3s ease-out;">
                <div style="font-size:45px; margin-bottom:15px; filter:drop-shadow(0 0 10px rgba(241,196,15,0.4));">⚡</div>
                <h2 style="font-size:20px; margin-bottom:5px; color:#f1c40f; font-weight:700;">Personal Notice</h2>
                <p style="font-size:13px; margin-bottom:25px; color:#888;">From: ${sentBy || 'Management'}</p>
                <p style="font-size:16px; margin-bottom:35px; line-height:1.6; font-weight:500;">${message}</p>
                <button onclick="acknowledgeCommand('${cmdId}','personal-warn-modal')"
                    style="background:#f1c40f; color:black; border:none; padding:12px 40px; border-radius:50px; font-weight:700; font-size:15px; cursor:pointer; box-shadow:0 4px 15px rgba(241,196,15,0.3); transition:transform 0.2s;">
                    I Understand ✓
                </button>
            </div>
            <style>@keyframes zoomIn { from { opacity:0; transform:scale(0.9); } to { opacity:1; transform:scale(1); } }</style>
        </div>`;
    document.body.appendChild(modal);
}

// ─── Emergency Broadcast Modal ───────────────────────────────────
function showGlobalEmergencyModal(title, msg, broadcastId = '') {
    const existing = document.getElementById('emergency-global-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'emergency-global-modal';
    modal.innerHTML = `
        <div style="position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.85);backdrop-filter:blur(8px);z-index:9999999;display:flex;align-items:center;justify-content:center;">
            <div style="background:#e74c3c; padding:45px 30px; border-radius:16px; text-align:center; box-shadow:0 0 60px rgba(231,76,60,0.6); max-width:320px; width:90%; color:white; animation:zoomIn 0.3s ease-out;">
                <div style="font-size:50px; margin-bottom:15px; filter:drop-shadow(0 2px 5px rgba(0,0,0,0.2));">⚠️</div>
                <h2 style="font-size:24px; margin-bottom:15px; font-weight:800; letter-spacing:0.5px;">${title}</h2>
                <p style="font-size:15px; margin-bottom:35px; line-height:1.6; font-weight:500;">${msg}</p>
                <button onclick="dismissEmergency('${broadcastId}'); document.getElementById('emergency-global-modal').remove()"
                    style="background:white; color:#e74c3c; border:none; padding:12px 35px; border-radius:50px; font-weight:700; font-size:15px; cursor:pointer; box-shadow:0 4px 15px rgba(0,0,0,0.15); transition:transform 0.2s;">
                    I got it 🚀
                </button>
            </div>
            <style>
                @keyframes zoomIn { from { opacity:0; transform:scale(0.9); } to { opacity:1; transform:scale(1); } }
                #emergency-global-modal button:hover { transform:scale(1.05); }
            </style>
        </div>`;
    document.body.appendChild(modal);
}

function dismissEmergency(broadcastId) {
    if (!broadcastId) return;
    let dismissed = JSON.parse(localStorage.getItem('dismissedEmergency') || '[]');
    if (!dismissed.includes(broadcastId)) dismissed.push(broadcastId);
    localStorage.setItem('dismissedEmergency', JSON.stringify(dismissed));
}

// ─── Agent Poll Modal ─────────────────────────────────────────────
function showAgentPollModal(question, options, broadcastId) {
    const existing = document.getElementById('agent-poll-modal');
    if (existing) existing.remove();
    const modal = document.createElement('div');
    modal.id = 'agent-poll-modal';
    const optBtns = options.map((opt, i) => `
        <button onclick="submitPollVote('${broadcastId}', '${opt.replace(/'/g, "\\'")}', this.closest('#agent-poll-modal'))"
            style="display:block;width:100%;margin-bottom:10px;padding:12px;border-radius:10px;border:1px solid rgba(167,139,250,0.4);background:rgba(167,139,250,0.1);color:#a78bfa;font-size:15px;font-weight:600;cursor:pointer;transition:background 0.2s;">
            ${String.fromCodePoint(0x1F1E6 + i)} ${opt}
        </button>`).join('');
    modal.innerHTML = `
        <div style="position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.8);backdrop-filter:blur(8px);z-index:9999999;display:flex;align-items:center;justify-content:center;">
            <div style="background:linear-gradient(135deg,#1a1a2e,#16213e);border:1px solid rgba(167,139,250,0.3);padding:40px 30px;border-radius:20px;text-align:center;box-shadow:0 0 60px rgba(167,139,250,0.25);max-width:360px;width:90%;color:white;animation:zoomIn 0.3s ease-out;">
                <div style="font-size:40px;margin-bottom:12px;">📊</div>
                <h2 style="font-size:18px;margin-bottom:8px;color:#a78bfa;font-weight:700;">Quick Poll from Admin</h2>
                <p style="font-size:15px;margin-bottom:25px;line-height:1.6;color:#e2e8f0;">${question}</p>
                ${optBtns}
                <button onclick="dismissEmergency('${broadcastId}'); document.getElementById('agent-poll-modal').remove();"
                    style="background:transparent;border:none;color:#64748b;font-size:13px;cursor:pointer;margin-top:5px;">Skip Poll</button>
            </div>
        </div>`;
    document.body.appendChild(modal);
}

function submitPollVote(broadcastId, option, modalEl) {
    if (!broadcastId || !option) return;
    const username = typeof currentUser !== 'undefined' ? (currentUser.username || 'anonymous') : 'anonymous';
    db.collection('systemBroadcasts').doc(broadcastId).update({
        [`votes.${username}`]: option
    }).then(() => {
        if (modalEl) modalEl.remove();
        dismissEmergency(broadcastId);
    }).catch(() => { if (modalEl) modalEl.remove(); });
}

// ─── Maintenance Page ─────────────────────────────────────────────
function showMaintenancePage(message) {
    if (document.getElementById('maintenance-overlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'maintenance-overlay';
    overlay.innerHTML = `
        <div style="position:fixed;inset:0;background:#0B1611;z-index:99999999;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:30px;">
            <div style="font-size:70px;margin-bottom:20px;">🔧</div>
            <h1 style="color:#2ecc71;font-size:28px;font-family:'Cairo',sans-serif;margin-bottom:15px;">System Maintenance</h1>
            <p style="color:#94a3b8;font-size:16px;max-width:400px;line-height:1.8;">${message}</p>
            <div style="margin-top:30px;display:flex;align-items:center;gap:10px;color:#2ecc71;font-size:13px;">
                <div style="width:8px;height:8px;border-radius:50%;background:#2ecc71;animation:pulse 1.5s infinite;"></div>
                Live status — page will restore automatically when system comes back online.
            </div>
        </div>`;
    document.body.appendChild(overlay);
}

// ─── Acknowledge & close any command modal ───────────────────────
function acknowledgeCommand(cmdId, modalId) {
    const el = document.getElementById(modalId);
    if (el) el.remove();
    if (typeof db !== 'undefined' && cmdId) {
        db.collection('systemCommands').doc(cmdId).update({ active: false }).catch(() => { });
    }
}

// ─── Scroll to a mail by its code ────────────────────────────────
function scrollToMail(mailCode) {
    if (window.lastSearchTerm) clearSearch();
    showAll(); // Guarantee filters don't hide the mail

    setTimeout(() => {
        const mail = allMails.find(m => (m.code || '').toLowerCase() === mailCode.toLowerCase());
        if (!mail) { showToast('Mail not found or not published yet.', 'warning'); return; }

        const row = document.querySelector(`tr[data-id="${mail.id}"]`);
        if (row) {
            row.click(); // Opens the mailbox automatically
            row.scrollIntoView({ behavior: 'smooth', block: 'center' });
            row.style.transition = 'background 0.3s';
            row.style.background = 'rgba(46,204,113,0.25)';
            setTimeout(() => row.style.background = '', 3000);

            // Scroll to the opened mailbox directly for better UX
            setTimeout(() => {
                const mailBox = document.getElementById('mailBox');
                if (mailBox) {
                    const boxTop = mailBox.getBoundingClientRect().top + window.scrollY - 80;
                    window.scrollTo({ top: boxTop, behavior: 'smooth' });
                }
            }, 300);
        } else {
            showToast('Mail is hidden by current filters.', 'warning');
        }
    }, 300);
}


// ─── Close watermark menu helper ─────────────────────────────────
function closeWatermarkMenu() {
    const menu = document.getElementById('watermarkMenu');
    const icon = document.querySelector('.watermark-icon');
    if (menu) menu.classList.remove('show');
    if (icon) icon.classList.remove('rotate');
}
// ✅ FIX: removed duplicate closeWatermarkMenu definition (was defined twice)

