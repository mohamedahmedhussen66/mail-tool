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
    const topicSelect = document.getElementById('addTopic');
    const senderSelect = document.getElementById('addSender');
    const categorySelect = document.getElementById('addCategory');

    if (topicSelect) {
        topicSelect.innerHTML = appSettingsOptions.topics.map(t => `<option value="${t}">${t}</option>`).join('');
    }
    if (senderSelect) {
        senderSelect.innerHTML = appSettingsOptions.senders.map(s => `<option value="${s}">${s}</option>`).join('');
    }
    // ⭐ تعديل 10: تعبئة الفئات ديناميكياً من الـ DB
    if (categorySelect && appSettingsOptions.categories) {
        categorySelect.innerHTML =
            appSettingsOptions.categories.map(c =>
                `<option value="${c.name}">${c.name}</option>`
            ).join('') +
            '<option value="Custom">✨ Custom Category</option>';
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
    } catch(e) { console.error("Heartbeat error", e); }
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
            document.getElementById("adminTopBars").style.display = "block";
        } else {
            setupNotificationPermissionPrompt();
        }
        syncWatermarkMenuByRole();
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
                // Ignore commands older than 90 seconds
                const age = cmd.timestamp ? (Date.now() - cmd.timestamp.toDate().getTime()) / 1000 : 999;
                if (age > 90) return;

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
                const age = data.timestamp ? (Date.now() - data.timestamp.toDate().getTime()) / 1000 : 999;
                if (age > 120) return;

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
            }).catch(() => { });
        }, 1000);
    }
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
            badgeStyle = "";
        } else {
            const isStandard = ["#27ae60", "#3498db", "#95a5a6"].includes(targetColor);
            badgeClass = isStandard ? "category-badge" : "category-badge custom-cat";
            if (targetColor === "#27ae60") badgeClass += " policy";
            if (targetColor === "#3498db") badgeClass += " update";

            if (!isStandard) {
                badgeStyle = `style="background: ${targetColor}15; color: ${targetColor}; border: 1px solid ${targetColor}40;"`;
            }
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

        if (!isRead && !showingTrash) {
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
                    <div style="width: 35px; display: flex; gap: 2px; justify-content: center;">
                        <span style="color:#f1c40f; font-size: 14px;">${userFavorites.includes(m.id) ? '★' : ''}</span>
                        <span style="font-size: 14px;">${m.isPinned || userPinned.includes(m.id) ? '📌' : ''}</span>
                    </div>
                    
                    <span style="font-weight: bold; color: #2e7d32; min-width: 65px;">${m.code}</span>
                    
                    ${trashTimerHtml}
                    <span class="${badgeClass}" ${badgeStyle}>
                        ${m.category || 'General'}
                    </span>
                    <span title="Has Attachment" style="font-size:12px; margin-left:2px;">📎</span>
                    ${m.isDraft ? '<span title="Draft" style="background:#f39c12; color:white; padding:2px 6px; border-radius:4px; font-size:9px; margin-left:2px;">Draft</span>' : ''}
                    ${m.publishAt && m.publishAt > new Date().toISOString() ? '<span title="Scheduled" style="background:#8e44ad; color:white; padding:2px 6px; border-radius:4px; font-size:9px; margin-left:2px;">Scheduled</span>' : ''}
                </div>
            </td>
            
            <td style="font-weight: 500;">${highlight(m.topic)}</td>
            <td>${highlight(m.idea) || '---'}</td>
            <td>
                ${(m.keywords || m.sender || "").split(',').map(k => k.trim() ? `<span style="background:rgba(46,125,50,0.1); color:#2e7d32; padding:3px 8px; border-radius:12px; font-size:11px; font-weight:bold; margin:2px; display:inline-block;">${highlight(k.trim())}</span>` : '').join('') || '---'}
            </td>
        `;

        // Double click action (show controls) - ⭐ تعديل: تمرير event صح علشان currentTarget يشتغل
        row.ondblclick = (e) => {
            if (e.target.closest('.bulk-cb')) return;
            e.preventDefault();
            // نعدل الـ currentTarget يدوياً لأن ondblclick بتخليه null بعد الـ dispatch
            const fakeEvent = { currentTarget: row };
            showMailActions(fakeEvent, m);
        };

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

            const generatedMailBoxHTML = `
                <div style="background: #f8f9fa; border: 1px solid #eaeaea; padding: 12px 18px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.03); position: relative;">
                    ${m.historyLog && m.historyLog.length > 0 && isAdminSession ? `<div style="position: absolute; top: 12px; right: 18px; cursor: pointer; font-size: 20px; transition: transform 0.2s; z-index: 10;" onmouseover="this.style.transform='scale(1.2)'" onmouseout="this.style.transform='scale(1)'" onclick="showHistoryLog('${m.id}')" title="View Edit History">🕐</div>` : ''}
                    <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap; padding-right: 35px;">
                        ${innerTrashHtml}
                        <span class="${glowClass}" style="background: ${targetColor}; padding: 4px 12px; border-radius: 6px; color: white; font-weight: bold; font-size: 13px;">
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
            const dummyBox = document.createElement('div');
            dummyBox.innerHTML = generatedMailBoxHTML;
            const currentMailBox = document.getElementById("mailBox");
            if (currentMailBox.innerHTML !== dummyBox.innerHTML) {
                currentMailBox.innerHTML = generatedMailBoxHTML;
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

        // Mail preview row
        let previewRow = document.createElement("tr");
        previewRow.className = "preview";
        let contentClean = m.content ? m.content.replace(/<[^>]*>/g, '') : "";
        previewRow.innerHTML = `<td colspan="${getTableColspan()}" style="text-align:left; color:#888; font-size:11px; padding-left:45px; opacity:0.7;">📄 ${contentClean.substring(0, 80)}...</td>`;
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
            change: function () {
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
            "code", "topic", "idea", "sender", "keywords", "category", "tags", "cleanContent"
        ],
        shouldSort: true,
        threshold: 0.0, // EXACT match only
        ignoreLocation: true,
        minMatchCharLength: 2,
        includeMatches: true // ⭐ التعديل 2
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
    const previewRow = currentRow.nextElementSibling;

    // Track globally what is open
    window.lastOpenActionMailId = mail.id;

    let existingActions = previewRow ? previewRow.nextElementSibling : null;
    if (existingActions && existingActions.classList.contains('actions-container-row')) {
        existingActions.remove();
        window.lastOpenActionMailId = null;
        return;
    }

    document.querySelectorAll('.actions-container-row').forEach(el => el.remove());

    const actionsWrapper = document.createElement('tr');
    actionsWrapper.className = 'actions-container-row';

    let buttonsHTML = '';

    if (showingTrash) {
        if (isAdminSession) {
            // ⭐ تعديل 8: أضفنا زرار الحذف النهائي للأدمن (مع تعديل الشكــل)
            buttonsHTML = `
                <div class="actions-flex-wrapper">
                    <div class="btn-restore-style" title="Restore this mail" onclick="restoreMail('${mail.id}')"><span>&#8617;</span></div>
                    <div class="action-btn" style="border-color:#e74c3c; color:#e74c3c;" title="Delete Forever (cannot be undone)" onclick="askPermanentDelete('${mail.id}')"><span>✖</span></div>
                </div>
            `;
        } else {
            buttonsHTML = `
                <div class="actions-flex-wrapper">
                    <div class="btn-restore-style" title="Restore this mail" onclick="userRestoreMail('${mail.id}')"><span>&#8617;</span></div>
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

    // ⭐ تعديل 3: Cascading - نحسب المتاح بناءً على الفلاتر التانية النشطة
    let tempFilters = { ...activeFilters };
    delete tempFilters[field];

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
    ['code', 'topic', 'idea', 'keywords'].forEach(f => updateFilterIcon(f));
    renderActiveFiltersBar(); // تحديث شريط الفلاتر النشطة

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

    if (!isAdminSession || selected.length === 0) {
        bulkBar.style.display = 'none';
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

// ⭐ تعديل 6: عرض نافذة الـ History
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
        const isProtected = ['primary_admin'].includes((u.username || '').toLowerCase());
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
    const stickyMails = visibleNow.filter(m => m.isSticky);
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
        <button onclick="submitPollVote('${broadcastId}', '${opt.replace(/'/g,"\\'")}', this.closest('#agent-poll-modal'))"
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
        db.collection('systemCommands').doc(cmdId).update({ active: false }).catch(() => {});
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
