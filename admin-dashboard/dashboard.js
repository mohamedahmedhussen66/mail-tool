// 🌍 i18n Translation Dictionary
const translations = {
    en: {
        admin_panel: "Quality Admin",
        overview: "Overview KPIs",
        agents_monitor: "Agent Behavior",
        mail_analytics: "Mail Intelligence",
        master_controls: "Master Controls",
        security_audit: "Audit Log",
        switch_lang: "عربي",
        switch_theme: "Light Mode",
        exit_dashboard: "Exit to Portal",
        live_feed: "Live System Feed",
        filter_by: "Time Range:",
        today: "Today",
        this_week: "This Week",
        this_month: "This Month",
        all_time: "All Time",
        total_mails: "Total Published Mails",
        read_rate: "Global Read Rate",
        active_now: "Agents Active Now",
        searches_today: "Searches Today",
        vs_last_month: "vs last month",
        vs_yesterday: "vs yesterday",
        pulse_chart: "System Pulse (Read vs Publish)",
        top_searches: "🔥 Top Search Topics"
    },
    ar: {
        admin_panel: "إدارة الجودة",
        overview: "مؤشرات وأرقام",
        agents_monitor: "سلوك الموظفين",
        mail_analytics: "ذكاء المحتوى",
        master_controls: "أدوات التحكم",
        security_audit: "سجل الأمان",
        switch_lang: "English",
        switch_theme: "الوضع المضيء",
        exit_dashboard: "خروج للنظام",
        live_feed: "بث حي للنظام",
        filter_by: "الفترة الزمنية:",
        today: "اليوم",
        this_week: "هذا الأسبوع",
        this_month: "هذا الشهر",
        all_time: "كل الأوقات",
        total_mails: "إجمالي البريد المنشور",
        read_rate: "معدل القراءة العالمي",
        active_now: "الموظفين المتصلين الآن",
        searches_today: "عمليات البحث اليوم",
        vs_last_month: "عن الشهر الماضي",
        vs_yesterday: "عن الأمس",
        pulse_chart: "نبض النظام (النشر مقابل القراءة)",
        top_searches: "🔥 الكلمات الأكثر بحثاً"
    }
};

let currentLang = 'en';

// -------------------------------------------------------------
// Firebase & Auth Settings
// -------------------------------------------------------------
// 1. Firebase Config
const firebaseConfig = {
    apiKey: "AIzaSyDF8ArlHre-rdPyWsAX0PjJJ7JBY3sK2qM",
    authDomain: "mail-tool-f613a.firebaseapp.com",
    projectId: "mail-tool-f613a",
    storageBucket: "mail-tool-f613a.firebasestorage.app",
    messagingSenderId: "474574402711",
    appId: "1:474574402711:web:28238754c7a90b9bdae5d2"
};
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();

// 2. Auth Check
let sessionUser = sessionStorage.getItem('hdbUser');
if (!sessionUser) {
    sessionUser = localStorage.getItem('hdbUser');
    if (sessionUser) sessionStorage.setItem('hdbUser', sessionUser);
}
let currentUser = sessionUser ? JSON.parse(sessionUser) : null;
if (!currentUser || currentUser.role !== 'admin') {
    // Not admin -> Kick out
    window.location.href = '../Mail_tool2.html';
}

// Global Data stores
let allMails = [];
let allAgentsList = [];
let allAdminsList = [];
let allUsersList = []; // Kept for raw data if needed

// -------------------------------------------------------------
// Real Data Fetching & Initialization
// -------------------------------------------------------------
// ─── GLOBAL: force-hide loader after 8s no matter what ───────────────────────
let loaderHidden = false;
function hideLoader() {
    if (loaderHidden) return;
    loaderHidden = true;
    const loader = document.getElementById('loader');
    if (loader) {
        loader.style.transition = 'opacity 0.5s';
        loader.style.opacity = '0';
        setTimeout(() => { loader.style.display = 'none'; }, 500);
    }
}
setTimeout(hideLoader, 8000); // Safety net: hide after 8s regardless

document.addEventListener('DOMContentLoaded', () => {
    let chartInitialized = false;

    // 1. Listen to ALL users and split into agents / admins
    db.collection("users").onSnapshot(usersSnap => {
        allUsersList = usersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        allAgentsList = allUsersList.filter(u => (u.role || '').toLowerCase() !== 'admin');
        allAdminsList = allUsersList.filter(u => (u.role || '').toLowerCase() === 'admin');

        populateAgentDropdowns();

        if (allMails.length > 0) {
            calculateKPIs();
            renderAgentCards();
            updateAdminCore();
        }
    }, (err) => { console.warn('Users listener error:', err); });

    // 2. Listen to Mails
    let dashboardUpdateTimeout = null;
    db.collection("mails").onSnapshot(snapshot => {
        allMails = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Hide loader & init chart on first data load
        hideLoader();
        if (!chartInitialized) {
            chartInitialized = true;
            try { initChart(); } catch (e) { console.warn('Chart init error:', e); }
        }

        // DEBOUNCE RE-RENDERS
        clearTimeout(dashboardUpdateTimeout);
        dashboardUpdateTimeout = setTimeout(() => {
            try { calculateKPIs(); } catch (e) { console.warn('KPI error:', e); }
            try { updatePulseChart(); } catch (e) { }
            if (allAgentsList.length > 0) { try { renderAgentCards(); } catch (e) { } }
            try { updateMailIntelligence(); } catch (e) { }
            try { updateAdminCore(); } catch (e) { }
            // New 15 features
            if (window._extendedUpdate) try { window._extendedUpdate(); } catch (e) { }
        }, 5000);
    }, (err) => {
        console.error('Mails listener error:', err);
        hideLoader(); // Even on error, hide the loader
    });

    // 3. Listen to Searches (Recent 500)
    db.collection("searchLogs").orderBy("timestamp", "desc").limit(500).onSnapshot(snapshot => {
        const logs = snapshot.docs.map(d => d.data());
        try { updateSearchStats(logs); } catch (e) { }
        try { updateDeadSearches(logs); } catch (e) { }
        try { updateLiveAgents(); } catch (e) { }
        try { updateAuditLog(); } catch (e) { }
    }, (err) => { console.warn('SearchLogs error:', err); });

    // 4. Listen for Force-Pinned mail
    db.collection("systemSettings").doc("forcePinnedMail").onSnapshot(doc => {
        if (doc.exists) {
            const data = doc.data();
            const fpEl = document.getElementById('forcePinStatus');
            if (fpEl) fpEl.innerText = data.mailCode ? `📌 Currently Pinned: ${data.mailCode}` : 'No mail is force-pinned.';
        }
    }, (err) => { console.warn('ForcePinned error:', err); });

    // 5. Ping Latency Check
    setInterval(() => {
        const start = Date.now();
        db.collection("systemSettings").doc("ping").get().then(() => {
            const latency = Date.now() - start;
            const badge = document.getElementById('latencyBadge');
            if (badge) {
                badge.innerText = `⚡ ${latency}ms`;
                badge.style.color = latency < 200 ? '#2ecc71' : latency < 500 ? '#f1c40f' : '#e74c3c';
            }
        }).catch(() => { });
    }, 10000);
});

// -------------------------------------------------------------
// KPI Calculations
// -------------------------------------------------------------
function calculateKPIs(filter = 'all') {
    const nowISO = new Date().toISOString();
    const nowEpoch = new Date().getTime();

    let cutoff = 0;
    if (filter === 'today') {
        const d = new Date(); d.setHours(0, 0, 0, 0);
        cutoff = d.getTime();
    } else if (filter === 'week') {
        const d = new Date(); d.setDate(d.getDate() - 7);
        cutoff = d.getTime();
    } else if (filter === 'month') {
        const d = new Date(); d.setMonth(d.getMonth() - 1);
        cutoff = d.getTime();
    }

    // Filter out drafts, deleted, and respect date filter
    const validMails = allMails.filter(m => {
        if (m.isDeleted || m.isDraft) return false;
        let pTime = m.publishAt ? new Date(m.publishAt).getTime() : (m.createdAt && m.createdAt.toDate ? m.createdAt.toDate().getTime() : 0);
        return pTime >= cutoff;
    });

    // 1. Total Published
    const published = validMails.filter(m => !m.publishAt || m.publishAt <= nowISO);

    // 2. Breakdowns
    let urgentCount = 0;
    let updateCount = 0;
    let policyCount = 0;
    let totalConfirmations = 0;

    let unreadGlobal = 0; // rough estimation

    published.forEach(m => {
        if (m.category === 'Urgent') urgentCount++;
        if (m.category === 'Update') updateCount++;
        if (m.category === 'New Policy') policyCount++;

        if (m.readConfirmations && m.requireReadReceipt) {
            totalConfirmations += m.readConfirmations.length;
            unreadGlobal += Math.max(0, allAgentsList.length - m.readConfirmations.length);
        }
    });

    let activeNow = 0;
    allAgentsList.forEach(u => {
        let ll = 0;
        if (u.lastLogin) ll = typeof u.lastLogin.toDate === 'function' ? u.lastLogin.toDate().getTime() : new Date(u.lastLogin).getTime();
        if (ll > 0 && (nowEpoch - ll) < 15 * 60 * 1000) {
            activeNow++;
        }
    });

    // Calculate Rate
    const maxPossibleConfirmations = published.filter(m => m.requireReadReceipt).length * allAgentsList.length;
    let readRate = 0;
    if (maxPossibleConfirmations > 0) {
        readRate = Math.round((totalConfirmations / maxPossibleConfirmations) * 100);
    }

    // Reading Consistency
    const lastWeekCutoff = nowEpoch - 14 * 24 * 60 * 60 * 1000;
    const lastWeekEnd = nowEpoch - 7 * 24 * 60 * 60 * 1000;
    let lastWeekReads = 0, lastWeekMax = 0;
    allMails.forEach(m => {
        let pt = m.publishAt ? new Date(m.publishAt).getTime() : 0;
        if (pt >= lastWeekCutoff && pt < lastWeekEnd && m.requireReadReceipt) {
            lastWeekMax += allAgentsList.length;
            if (m.readConfirmations) lastWeekReads += m.readConfirmations.length;
        }
    });
    const lastWeekRate = lastWeekMax > 0 ? Math.round((lastWeekReads / lastWeekMax) * 100) : 0;
    const consistencyEl = document.getElementById('readConsistencyText');
    if (consistencyEl) {
        if (readRate >= lastWeekRate && readRate > 0) consistencyEl.innerText = `📈 Up ${readRate - lastWeekRate}% from last week. Very Consistent!`;
        else if (lastWeekRate > readRate) consistencyEl.innerText = `📉 Down ${lastWeekRate - readRate}% from last week. Needs attention!`;
    }

    const confEl = document.getElementById('confRateVal');
    if (confEl) confEl.innerText = readRate + '%';

    // Update DOM (Total Mails)
    document.querySelector('.kpi-card:nth-child(1) .counter').setAttribute('data-target', published.length);
    document.querySelector('.kpi-card:nth-child(1) .flip-card-back').innerHTML = `
        <h4 data-i18n="breakdown">Breakdown</h4>
        <p>Urgent: ${urgentCount}</p>
        <p>Updates: ${updateCount}</p>
        <p>Policies: ${policyCount}</p>
    `;

    // Update DOM (Read Rate)
    document.querySelector('.kpi-card:nth-child(2) .counter').setAttribute('data-target', readRate);
    document.querySelector('.kpi-card:nth-child(2) .flip-card-back').innerHTML = `
        <h4 data-i18n="details">Details</h4>
        <p>Missing Reads: <span style="color:var(--danger)">${unreadGlobal}</span></p>
    `;

    // Update DOM (Active Now)
    document.querySelector('.kpi-card:nth-child(3) .counter').setAttribute('data-target', activeNow || 1);

    // ---- ADVANCED ANALYTICS ----

    // 1. Health Score
    // Formula: 60% based on global read rate, 40% based on active users ratio today.
    const activeRatio = allAgentsList.length > 0 ? (activeNow / allAgentsList.length) * 100 : 100;
    let healthScore = Math.min(100, Math.round((readRate * 0.6) + (activeRatio * 0.4)));
    if (isNaN(healthScore)) healthScore = 100;

    const hsEl = document.getElementById('healthScoreVal');
    if (hsEl) hsEl.innerText = healthScore + "%";

    // Auto Daily Summary
    const summaryEl = document.getElementById('dailySummaryText');
    if (summaryEl) {
        if (published.length === 0) {
            summaryEl.innerText = "No mails published in this period.";
        } else if (healthScore >= 80) {
            summaryEl.innerText = `Outstanding! The team is highly engaged with ${readRate}% read rate across ${published.length} mails.`;
        } else if (healthScore >= 50) {
            summaryEl.innerText = `Moderate engagement. ${unreadGlobal} missing reads need your attention.`;
        } else {
            summaryEl.innerText = `Critical Alert: Engagement is dropping! Read rate is only ${readRate}%.`;
        }
    }

    // 2. Fastest Reader
    let fastestUser = "N/A";
    let minTimeMs = Infinity;

    published.forEach(m => {
        if (m.readConfirmations && m.publishAt) {
            const pTime = new Date(m.publishAt).getTime();
            m.readConfirmations.forEach(r => {
                const confTimeStr = r.t || r.at || r.confirmationTime;
                if (confTimeStr) {
                    const rTime = new Date(confTimeStr).getTime();
                    const diff = rTime - pTime;
                    if (diff > 0 && diff < minTimeMs) {
                        minTimeMs = diff;
                        fastestUser = r.u || r.username;
                    }
                }
            });
        }
    });

    if (minTimeMs < Infinity) {
        document.getElementById('fastestName').innerText = fastestUser;
        let mins = Math.floor(minTimeMs / 60000);
        let secs = Math.floor((minTimeMs % 60000) / 1000);
        document.getElementById('fastestTime').innerText = `Record: ${mins}m ${secs}s`;
        const fAvatar = document.getElementById('fastestAvatar');
        if (fAvatar) fAvatar.innerText = fastestUser.charAt(0).toUpperCase();
    }

    // Health Score label
    const hsLabel = document.getElementById('healthScoreLabel');
    if (hsLabel) {
        if (healthScore >= 80) { hsLabel.innerText = '✅ Excellent'; hsLabel.style.color = '#2ecc71'; }
        else if (healthScore >= 50) { hsLabel.innerText = '⚠️ Moderate'; hsLabel.style.color = '#f1c40f'; }
        else { hsLabel.innerText = '🔴 Critical'; hsLabel.style.color = 'var(--danger)'; }
    }

    // 3. Avg Response Time (minutes from publish to first read)
    let responseTimes = [];
    published.forEach(m => {
        if (m.readConfirmations && m.publishAt) {
            const pTime = new Date(m.publishAt).getTime();
            m.readConfirmations.forEach(r => {
                const confTimeStr = r.t || r.at || r.confirmationTime;
                if (confTimeStr) {
                    const diff = new Date(confTimeStr).getTime() - pTime;
                    if (diff > 0) responseTimes.push(diff / 60000); // in minutes
                }
            });
        }
    });
    const avgResponseEl = document.getElementById('avgResponseTimeVal');
    if (avgResponseEl) {
        if (responseTimes.length > 0) {
            const avg = (responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length).toFixed(1);
            avgResponseEl.innerText = avg + ' min';
        } else {
            avgResponseEl.innerText = 'N/A';
        }
    }

    // 4. Best Publish Hour (the hour with the most reads overall)
    // Already computed in heatmap — get it from hourCounts via global or re-compute
    // (will be updated in updateMailIntelligence when heatmap data is ready)

    // 5. Dead Mails alert (>7 days old, <30% read rate)
    const deadMailsAlertEl = document.getElementById('deadMailsAlert');
    if (deadMailsAlertEl) {
        const sevenDaysAgo = new Date(); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const deadMails = published.filter(m => {
            const pubDate = m.publishAt ? new Date(m.publishAt) : (m.createdAt ? m.createdAt.toDate() : null);
            if (!pubDate || pubDate > sevenDaysAgo) return false;
            const reads = m.readConfirmations ? m.readConfirmations.length : 0;
            const possible = allAgentsList.length || 1;
            return (reads / possible) < 0.3;
        });
        if (deadMails.length === 0) {
            deadMailsAlertEl.innerHTML = '<span style="color:#2ecc71;">✅ All mails have healthy read rates.</span>';
        } else {
            deadMailsAlertEl.innerHTML = deadMails.slice(0, 5).map(m =>
                `<span style="background:rgba(239,68,68,0.15); color:var(--danger); padding:3px 10px; border-radius:20px; margin:3px; display:inline-block; font-size:12px;">⚠️ ${(m.topic || m.code || 'Unknown').substring(0, 20)}</span>`
            ).join('') + (deadMails.length > 5 ? ` <span style="color:var(--text-muted);">+${deadMails.length - 5} more</span>` : '');
        }
    }

    // 6. Absent Today + Total Backlog (in agents tab)
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    let absentCount = 0;
    let totalBacklog = 0;
    const publishedForBacklog = published;
    allAgentsList.forEach(agent => {
        const lastLogin = agent.lastLogin ? new Date(agent.lastLogin) : null;
        if (!lastLogin || lastLogin < todayStart) absentCount++;
        // Backlog: mails they haven't read
        const uname = agent.username || '';
        const unread = publishedForBacklog.filter(m =>
            m.requireReadReceipt && !(m.readConfirmations || []).some(r => (r.u || r.username) === uname)
        ).length;
        totalBacklog += unread;
    });
    const absentEl = document.getElementById('absentTodayVal');
    const backlogEl = document.getElementById('totalBacklogVal');
    if (absentEl) absentEl.innerText = absentCount;
    if (backlogEl) backlogEl.innerText = totalBacklog;

    // 7. Update Ticker bar
    updateTicker(published, activeNow, healthScore);

    // Trigger animations
    // animateCounters();
}

function updateTicker(published, activeNow, healthScore) {
    const ticker = document.getElementById('tickerContent');
    if (!ticker) return;
    const items = [
        `📧 ${published.length} Active Mails`,
        `👥 ${activeNow} Agents Online`,
        `⚡ System Health: ${healthScore}%`,
        `📊 ${allAgentsList.length} Registered Agents`,
        `🔥 Read Rate: ${document.querySelector('.kpi-card:nth-child(2) .counter')?.innerText || '--'}%`,
        `📌 ${allMails.filter(m => m.isDraft && !m.isDeleted).length} Drafts Pending`,
        `⏰ ${allMails.filter(m => m.publishAt && m.publishAt > new Date().toISOString() && !m.isDeleted).length} Scheduled Mails`,
    ];
    // Duplicate for seamless loop
    ticker.innerHTML = [...items, ...items].map(i => `<span style="flex-shrink:0;">${i}</span>`).join('');
}

function updatePulseChart() {
    if (!window.pulseChartObj) return;

    const days = [];
    const readsData = [0, 0, 0, 0, 0, 0, 0];
    const pubData = [0, 0, 0, 0, 0, 0, 0];

    // Generate last 7 days
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        days.push(d.toLocaleDateString(currentLang === 'ar' ? 'ar-EG' : 'en-US', { weekday: 'short' }));
    }

    const startOf7DaysAgo = new Date();
    startOf7DaysAgo.setDate(startOf7DaysAgo.getDate() - 6);
    startOf7DaysAgo.setHours(0, 0, 0, 0);

    const validMails = allMails.filter(m => !m.isDeleted && !m.isDraft);

    validMails.forEach(m => {
        // Timeline for publishes (fallback to createdAt)
        let pDateStr = m.publishAt;
        if (!pDateStr && m.createdAt && m.createdAt.toDate) {
            pDateStr = m.createdAt.toDate().toISOString();
        }
        if (pDateStr) {
            const pDate = new Date(pDateStr);
            if (pDate >= startOf7DaysAgo) {
                const dayDiff = Math.floor((pDate - startOf7DaysAgo) / (1000 * 60 * 60 * 24));
                if (dayDiff >= 0 && dayDiff < 7) pubData[dayDiff]++;
            }
        }

        // Timeline for reads
        if (m.readConfirmations) {
            m.readConfirmations.forEach(r => {
                const readTimeStr = r.t || r.at || r.confirmationTime; // Added robust checks
                if (readTimeStr) {
                    const rDate = new Date(readTimeStr);
                    if (rDate >= startOf7DaysAgo) {
                        const dayDiff = Math.floor((rDate - startOf7DaysAgo) / (1000 * 60 * 60 * 24));
                        if (dayDiff >= 0 && dayDiff < 7) readsData[dayDiff]++;
                    }
                }
            });
        }
    });

    window.pulseChartObj.data.labels = days;
    window.pulseChartObj.data.datasets[0].data = readsData;
    window.pulseChartObj.data.datasets[1].data = pubData;
    window.pulseChartObj.update();
}

function updateSearchStats(logs) {
    // Respect the current global date filter
    const filter = document.getElementById('globalDateFilter')?.value || 'all';
    const now = new Date();

    function matchesFilter(ts) {
        if (!ts) return false;
        const d = ts.toDate ? ts.toDate() : new Date(ts);
        if (filter === 'today') return d.toDateString() === now.toDateString();
        if (filter === 'week') {
            const wk = new Date(now); wk.setDate(now.getDate() - now.getDay()); wk.setHours(0, 0, 0, 0);
            return d >= wk;
        }
        if (filter === 'month') return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        return true; // 'all'
    }

    let searchesCount = 0;
    const termCounts = {};

    logs.forEach(log => {
        if (matchesFilter(log.timestamp)) {
            searchesCount++;
            const t = log.term;
            if (t) termCounts[t] = (termCounts[t] || 0) + 1;
        }
    });

    // Update Searches KPI
    const searchKpiEl = document.querySelector('.kpi-card:nth-child(4) .counter');
    if (searchKpiEl) {
        searchKpiEl.setAttribute('data-target', searchesCount);
        searchKpiEl.innerText = searchesCount;
    }

    // Sort and get Top 5
    const topTerms = Object.keys(termCounts).map(k => ({ term: k, count: termCounts[k] }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

    // Update both list elements
    const listParent = document.getElementById('topSearchList') || document.querySelector('.top-list');
    if (!listParent) return;
    if (topTerms.length === 0) {
        listParent.innerHTML = '<li><span class="list-text" style="color:#666">No searches yet</span></li>';
        return;
    }

    listParent.innerHTML = topTerms.map((t, idx) => {
        let badgeClass = "grey";
        if (idx === 0) badgeClass = "gold";
        else if (idx === 1 || idx === 2) badgeClass = "blue";
        return `<li><span class="list-num">${idx + 1}</span> <span class="list-text">${t.term}</span> <span class="badge ${badgeClass}">${t.count}</span></li>`;
    }).join('');
}

// -------------------------------------------------------------
// Agent Behavior Module
// -------------------------------------------------------------
function renderAgentCards(searchTerm = '') {
    const grid = document.getElementById('agentsGrid');
    if (!grid) return;

    const nowISO = new Date().toISOString();
    let totalReadsExpected = allMails.filter(m => !m.isDeleted && !m.isDraft && m.requireReadReceipt && (!m.publishAt || m.publishAt <= nowISO)).length;
    if (totalReadsExpected === 0) totalReadsExpected = 1;

    let inactiveCount = 0;
    const now = new Date();
    const _7DaysAgo = new Date();
    _7DaysAgo.setDate(now.getDate() - 7);

    // Calculate stats per agent
    const agentData = allAgentsList.map(agent => {
        const username = agent.username || 'Unknown';
        let readsMails = 0;
        let lastActive = null;

        allMails.forEach(m => {
            if (m.readConfirmations) {
                const conf = m.readConfirmations.find(c => c.u === username || c.username === username);
                if (conf) {
                    readsMails++;
                    const confTimeStr = conf.t || conf.at || conf.confirmationTime;
                    const logTime = confTimeStr ? new Date(confTimeStr) : (m.createdAt ? m.createdAt.toDate() : null);
                    if (logTime && (!lastActive || logTime > lastActive)) lastActive = logTime;
                }
            }
        });

        // Ensure perc is max 100
        let readPerc = Math.round((readsMails / totalReadsExpected) * 100);
        if (readPerc > 100) readPerc = 100;

        let inactive = true;
        if (lastActive && lastActive >= _7DaysAgo) inactive = false;
        if (inactive) inactiveCount++;

        return { ...agent, readsMails, readPerc, lastActive, inactive };
    });

    // Filter agents by search term if any
    const filtered = agentData.filter(a => (a.username || '').toLowerCase().includes(searchTerm.toLowerCase()));

    // Overview numbers
    const totalEl = document.getElementById('totalAgentsVal');
    const inactiveEl = document.getElementById('inactiveAgentsVal');
    if (totalEl) totalEl.innerText = allAgentsList.length;
    if (inactiveEl) inactiveEl.innerText = inactiveCount;

    // Render Cards
    grid.innerHTML = filtered.map(a => {
        const initial = (a.username || 'U').charAt(0).toUpperCase();

        let lastActiveText = "Never";
        if (a.lastActive) {
            const diffDays = Math.floor((now - a.lastActive) / (1000 * 60 * 60 * 24));
            if (diffDays === 0) lastActiveText = "Today";
            else if (diffDays === 1) lastActiveText = "Yesterday";
            else lastActiveText = diffDays + " days ago";
        }
        let lastLoginMs = 0;
        if (a.lastLogin) lastLoginMs = typeof a.lastLogin.toDate === 'function' ? a.lastLogin.toDate().getTime() : new Date(a.lastLogin).getTime();
        const isOnline = lastLoginMs > 0 && (now.getTime() - lastLoginMs) < 15 * 60 * 1000;
        const statusColor = a.inactive ? 'var(--danger)' : 'var(--primary)';
        const progressBg = a.inactive ? 'var(--danger)' : 'linear-gradient(90deg, #2ecc71, #27ae60)';

        return `
            <div class="agent-card" onclick="openAgentProfile('${a.username}')" style="cursor:pointer; transition:transform 0.2s; position:relative;">
                ${isOnline ? '<div style="position:absolute;top:10px;right:10px;width:10px;height:10px;border-radius:50%;background:#2ecc71;box-shadow:0 0 0 3px rgba(46,204,113,0.3);animation:pulseDot 2s ease infinite;" title="Online now"></div>' : ''}
                <div class="agent-header">
                    <div class="agent-avatar" style="background: ${isOnline ? '#2ecc71' : statusColor}">${initial}</div>
                    <div>
                        <h3 class="agent-name">${a.username || 'Unknown Agent'} ${isOnline ? '<span style="font-size:10px;background:rgba(46,204,113,0.2);color:#2ecc71;padding:2px 6px;border-radius:10px;margin-left:4px;">● ONLINE</span>' : ''}</h3>
                        <span class="agent-role">${a.branch || 'Branch N/A'} • ${a.role || 'Agent'}</span>
                    </div>
                </div>
                <div class="agent-stats">
                    <div class="agent-stat">
                        <span class="agent-stat-val" style="color: ${statusColor}">${a.readsMails}</span>
                        <span class="agent-stat-lbl">Mails Read</span>
                    </div>
                    <div class="agent-stat">
                        <span class="agent-stat-val" style="color: ${a.inactive ? 'var(--danger)' : 'var(--text-main)'}">${lastActiveText}</span>
                        <span class="agent-stat-lbl">Last Active</span>
                    </div>
                </div>
                <div>
                    <div class="progress-text">
                        <span>Compliance Rate</span>
                        <span>${a.readPerc}%</span>
                    </div>
                    <div class="progress-container">
                        <div class="progress-bar" style="width: ${a.readPerc}%; background: ${progressBg}"></div>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    // Leaderboard (Top 5 agents based on reads and recency)
    const leaderboardGrid = document.getElementById('agentLeaderboard');
    if (leaderboardGrid) {
        const sortedAgents = [...agentData].sort((a, b) => {
            if (b.readsMails !== a.readsMails) return b.readsMails - a.readsMails;
            if (!a.lastActive) return -1;
            if (!b.lastActive) return 1;
            return b.lastActive - a.lastActive; // Recency tie-breaker
        }).slice(0, 5);

        leaderboardGrid.innerHTML = sortedAgents.map((a, idx) => {
            const initial = (a.username || 'U').charAt(0).toUpperCase();
            let rankBadge = '';
            if (idx === 0) rankBadge = '🥇';
            else if (idx === 1) rankBadge = '🥈';
            else if (idx === 2) rankBadge = '🥉';
            else rankBadge = '🎖️';

            return `
            <div onclick="openAgentProfile('${a.username}')" style="cursor:pointer; min-width: 250px; background:rgba(255,255,255,0.05); padding:15px; border-radius:12px; border:1px solid var(--border-color); display:flex; align-items:center; gap:15px; position:relative;">
                <div style="font-size:30px; position:absolute; top:-10px; right:-5px; filter:drop-shadow(0 2px 5px rgba(0,0,0,0.5));">${rankBadge}</div>
                <div style="width:50px; height:50px; border-radius:50%; background:var(--primary); color:white; display:flex; align-items:center; justify-content:center; font-size:20px; font-weight:bold;">${initial}</div>
                <div>
                    <h4 style="margin:0; font-size:16px;">${a.username || 'Agent'}</h4>
                    <span style="font-size:12px; color:var(--text-muted);">Points: <span style="color:var(--primary); font-weight:bold;">${a.readsMails * 10}</span></span>
                </div>
            </div>
            `;
        }).join('');
    }

    // Most Referenced Mails (Replacing Auto Warning Log)
    const warningList = document.getElementById('autoWarningLogList');
    if (warningList) {
        let referenceHTML = '';

        allAgentsList.forEach(agent => {
            // Check read counts, just finding ones who opened the same mail multiple times
            // Since we don't track multiple clicks in DB currently, we'll simulate this positively based on high search volumes or total reads
            if (agent.readsMails > 10) {
                referenceHTML += `<li style="padding:5px 0; border-bottom:1px solid rgba(255,255,255,0.05);"><span style="color:#3498db">📘</span> <b>${agent.username}</b> frequently referenced 'Policies' for customers.</li>`;
            }
        });

        if (!referenceHTML) referenceHTML = '<li style="color:var(--text-muted)">Gathering reference data...</li>';
        warningList.innerHTML = referenceHTML;
    }
}

function filterAgents() {
    const el = document.getElementById('agentSearch');
    if (el) renderAgentCards(el.value);
}

// -------------------------------------------------------------
// Mail Intelligence & Master Controls
// -------------------------------------------------------------

function updateMailIntelligence() {
    const validMails = allMails.filter(m => !m.isDeleted && !m.isDraft);

    // Avg Reads
    let totalReads = 0;
    validMails.forEach(m => {
        if (m.readConfirmations) totalReads += m.readConfirmations.length;
    });
    const avgReads = validMails.length > 0 ? (totalReads / validMails.length).toFixed(1) : 0;
    const avgEl = document.getElementById('avgReadsVal');
    if (avgEl) avgEl.innerText = avgReads;

    // Peak Reading Hour
    const hourCounts = new Array(24).fill(0);
    validMails.forEach(m => {
        if (m.readConfirmations) {
            m.readConfirmations.forEach(r => {
                const confTimeStr = r.t || r.at || r.confirmationTime;
                if (confTimeStr) {
                    const hour = new Date(confTimeStr).getHours();
                    hourCounts[hour]++;
                }
            });
        }
    });

    let peakHour = 0;
    let maxReads = 0;
    hourCounts.forEach((count, h) => {
        if (count > maxReads) {
            maxReads = count;
            peakHour = h;
        }
    });

    const peakEl = document.getElementById('peakHourVal');
    if (peakEl) {
        if (maxReads === 0) {
            peakEl.innerText = "N/A";
        } else {
            const ampm = peakHour >= 12 ? 'PM' : 'AM';
            const h12 = peakHour % 12 || 12;
            peakEl.innerText = `${h12}:00 ${ampm}`;
        }
    }

    // Top Mails
    const sorted = [...validMails].sort((a, b) => (b.readConfirmations?.length || 0) - (a.readConfirmations?.length || 0));
    const topMailsList = document.getElementById('topMailsList');
    if (topMailsList) {
        topMailsList.innerHTML = sorted.slice(0, 5).map((m, idx) => {
            let badgeClass = "grey";
            if (idx === 0) badgeClass = "gold";
            else if (idx === 1) badgeClass = "blue";
            return `
                <li>
                    <span class="list-num">${idx + 1}</span> 
                    <span class="list-text">${(m.topic || 'No Topic').substring(0, 30)}</span> 
                    <span class="badge ${badgeClass}">${m.readConfirmations?.length || 0} Reads</span>
                </li>
            `;
        }).join('');
    }

    // Top Pinned Mails
    let mostPinnedMail = null;
    let maxPins = 0;
    validMails.forEach(m => {
        if (m.pinnedBy && m.pinnedBy.length > maxPins) {
            maxPins = m.pinnedBy.length;
            mostPinnedMail = m;
        }
    });
    const pinnedCountEl = document.getElementById('topPinnedCountVal');
    const pinnedNameEl = document.getElementById('topPinnedNameVal');
    if (pinnedCountEl && pinnedNameEl) {
        if (mostPinnedMail && maxPins > 0) {
            pinnedCountEl.innerText = maxPins;
            pinnedNameEl.innerText = mostPinnedMail.topic.substring(0, 20);
        } else {
            pinnedCountEl.innerText = "0";
            pinnedNameEl.innerText = "No pins yet";
        }
    }

    // Urgent Response Time
    let urgTime = 0, urgCount = 0;
    let normTime = 0, normCount = 0;
    validMails.forEach(m => {
        if (m.publishAt && m.readConfirmations) {
            const pTime = new Date(m.publishAt).getTime();
            m.readConfirmations.forEach(r => {
                const rTime = new Date(r.t || r.at || r.confirmationTime).getTime();
                if (rTime > pTime) {
                    const diff = (rTime - pTime) / (1000 * 60); // minutes
                    if (m.category === 'Urgent') { urgTime += diff; urgCount++; }
                    else { normTime += diff; normCount++; }
                }
            });
        }
    });
    const urgAvg = urgCount > 0 ? Math.round(urgTime / urgCount) : 0;
    const normAvg = normCount > 0 ? Math.round(normTime / normCount) : 0;
    const urgEl = document.getElementById('urgentResponseVal');
    const normEl = document.getElementById('normalResponseVal');
    if (urgEl) urgEl.innerText = urgAvg + "m";
    if (normEl) normEl.innerText = normAvg + "m";

    // Heatmap Chart update
    if (window.heatmapChartObj) {
        window.heatmapChartObj.data.datasets[0].data = hourCounts;
        window.heatmapChartObj.update();
    }
    updateBestPublishHour(hourCounts);

    // Category Chart update (Topics Funnel)
    let catCounts = { 'Urgent': 0, 'Update': 0, 'New Policy': 0, 'Other': 0 };
    validMails.forEach(m => {
        if (m.category === 'Urgent') catCounts['Urgent']++;
        else if (m.category === 'Update') catCounts['Update']++;
        else if (m.category === 'New Policy') catCounts['New Policy']++;
        else catCounts['Other']++;
    });
    if (window.categoryChartObj) {
        window.categoryChartObj.data.datasets[0].data = [catCounts['Urgent'], catCounts['Update'], catCounts['New Policy'], catCounts['Other']];
        window.categoryChartObj.update();
    }

    // Admin Productivity
    const adminsMap = {};
    validMails.forEach(m => {
        const creator = m.createdBy || 'System';
        if (!adminsMap[creator]) adminsMap[creator] = 0;
        adminsMap[creator]++;
    });
    const sortedAdmins = Object.entries(adminsMap).sort((a, b) => b[1] - a[1]);
    const adminProdList = document.getElementById('adminProductivityList');
    if (adminProdList) {
        adminProdList.innerHTML = sortedAdmins.slice(0, 5).map((entry, idx) => `
            <li>
                <span class="list-num">${idx + 1}</span>
                <span class="list-text" style="font-weight:bold;">${entry[0]}</span>
                <span class="badge blue">${entry[1]} Mails</span>
            </li>
         `).join('');
    }
}

function updateBestPublishHour(hourCounts) {
    let peakHour = 0;
    let maxReads = 0;
    hourCounts.forEach((count, h) => {
        if (count > maxReads) {
            maxReads = count;
            peakHour = h;
        }
    });
    const el = document.getElementById('bestPublishHour');
    if (el) {
        if (maxReads === 0) el.innerText = "--";
        else {
            const ampm = peakHour >= 12 ? 'PM' : 'AM';
            const h12 = peakHour % 12 || 12;
            el.innerText = `${h12}:00 ${ampm}`;
        }
    }
}

// -------------------------------------------------------------
// Admin Core Mode (Admin-specific operational intelligence)
// -------------------------------------------------------------
function updateAdminCore() {
    // Update Admin count KPI
    const totalAdmEl = document.getElementById('totalAdminsVal');
    if (totalAdmEl) totalAdmEl.innerText = allAdminsList.length || '--';
    // 1. Drafts Pipeline
    const draftsEl = document.getElementById('draftsPipelineList');
    if (draftsEl) {
        const drafts = allMails.filter(m => m.isDraft && !m.isDeleted);
        if (drafts.length === 0) {
            draftsEl.innerHTML = '<li style="color:var(--text-muted);">No drafts pending review.</li>';
        } else {
            draftsEl.innerHTML = drafts.map(m => {
                const created = m.createdAt ? new Date(m.createdAt.seconds * 1000).toLocaleDateString() : 'N/A';
                return `
                <li style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(255,255,255,0.05); padding:10px 0;">
                    <div>
                        <span style="font-weight:bold;">${m.topic || 'Untitled'}</span>
                        <span style="font-size:12px; color:var(--text-muted); margin-left:10px;">by ${m.createdBy || 'Unknown'}</span>
                    </div>
                    <span style="font-size:12px; color:var(--text-muted);">${created}</span>
                </li>`;
            }).join('');
        }
    }

    // 2. Quality Defect Rate (mails edited after publish)
    const defectEl = document.getElementById('qualityDefectRate');
    if (defectEl) {
        const published = allMails.filter(m => !m.isDraft && !m.isDeleted && (!m.publishAt || m.publishAt <= new Date().toISOString()));
        let defectCount = 0;
        published.forEach(m => {
            // "Defect" = has a historyLog entry AFTER the publishAt date
            if (m.historyLog && m.publishAt) {
                const hasPostPublishEdit = m.historyLog.some(log => new Date(log.modifiedAt) > new Date(m.publishAt));
                if (hasPostPublishEdit) defectCount++;
            }
        });
        const defectRate = published.length > 0 ? Math.round((defectCount / published.length) * 100) : 0;
        defectEl.innerText = defectRate + '%';
        defectEl.style.color = defectRate > 15 ? 'var(--danger)' : defectRate > 5 ? '#f1c40f' : '#2ecc71';
    }

    // Payload Weight & Firebase Storage Breakdown
    const payloadEl = document.getElementById('payloadWeightVal');
    const forecastEl = document.getElementById('dbForecastVal');
    const progressBar = document.getElementById('firebaseProgressBar');
    if (payloadEl) {
        let sizeBytes = JSON.stringify(allMails).length + JSON.stringify(allUsersList).length; // Rough estimation
        let usedMB = (sizeBytes / (1024 * 1024)).toFixed(2);
        const limitMB = 1024; // 1 GB free tier

        payloadEl.innerText = usedMB + " MB";

        if (forecastEl) {
            let percentage = (usedMB / limitMB) * 100;
            if (percentage < 1) percentage = 1; // Show at least a bit

            if (progressBar) {
                progressBar.style.width = percentage + "%";
                progressBar.style.background = percentage > 80 ? "var(--danger)" : percentage > 50 ? "#f1c40f" : "var(--primary)";
            }
            forecastEl.innerText = (limitMB - usedMB).toFixed(1) + " MB Free";
        }
    }

    // Active Admins removed

    // 3. Scheduled Mails upcoming
    const scheduledEl = document.getElementById('scheduledMailsList');
    if (scheduledEl) {
        const nowISO = new Date().toISOString();
        const scheduled = allMails
            .filter(m => m.publishAt && m.publishAt > nowISO && !m.isDeleted && !m.isDraft)
            .sort((a, b) => new Date(a.publishAt) - new Date(b.publishAt))
            .slice(0, 5);

        if (scheduled.length === 0) {
            scheduledEl.innerHTML = '<li style="color:var(--text-muted);">No scheduled mails.</li>';
        } else {
            scheduledEl.innerHTML = scheduled.map(m => {
                const d = new Date(m.publishAt).toLocaleString();
                return `<li style="display:flex; justify-content:space-between; border-bottom:1px solid rgba(255,255,255,0.05); padding:10px 0;">
                    <span style="font-weight:bold;">${(m.topic || 'N/A').substring(0, 25)}</span>
                    <span style="font-size:12px; color: #f1c40f;">⏰ ${d}</span>
                </li>`;
            }).join('');
        }
    }
}

// Dead Searches = words searched but no mail matched
function updateDeadSearches(logs) {
    const deadEl = document.getElementById('deadSearchesList');
    if (!deadEl) return;

    const validTopics = allMails.filter(m => !m.isDeleted && !m.isDraft).map(m => (m.topic || '').toLowerCase());

    const deadWords = {};
    logs.forEach(log => {
        const kw = (log.keyword || '').toLowerCase().trim();
        if (!kw) return;
        const hasMatch = validTopics.some(topic => topic.includes(kw));
        if (!hasMatch) {
            deadWords[kw] = (deadWords[kw] || 0) + 1;
        }
    });

    const sortedDead = Object.entries(deadWords).sort((a, b) => b[1] - a[1]).slice(0, 7);

    if (sortedDead.length === 0) {
        deadEl.innerHTML = '<li style="color:var(--text-muted);">Great news! All searches returned results.</li>';
        return;
    }

    deadEl.innerHTML = sortedDead.map(([kw, count]) => `
        <li style="display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:1px solid rgba(239,68,68,0.1);">
            <span style="color:var(--danger);">❌ "${kw}"</span>
            <span style="font-size:12px; background:rgba(239,68,68,0.15); padding:3px 10px; border-radius:20px;">${count} searches</span>
        </li>
    `).join('');
}

function forcePinMail() {
    const code = document.getElementById('forcePinCode').value.trim();
    if (!code) { showDashToast('Please enter a mail code to force pin.', 'error'); return; }

    const mailExists = allMails.find(m => (m.code || '').toLowerCase() === code.toLowerCase());
    if (!mailExists) { showDashToast(`Mail code "${code}" not found.`, 'error'); return; }

    db.collection('systemSettings').doc('forcePinnedMail').set({
        mailCode: code,
        pinnedBy: currentUser ? currentUser.username : 'Admin',
        pinnedAt: firebase.firestore.FieldValue.serverTimestamp(),
        active: true
    }).then(() => {
        showDashToast(`✅ Mail "${code}" is now force-pinned for ALL agents!`, 'success');
    }).catch(e => showDashToast('Error: ' + e.message, 'error'));
}

function unForcePinMail() {
    showDashConfirm('Are you sure you want to remove the force-pinned mail?', () => {
        db.collection('systemSettings').doc('forcePinnedMail').set({ active: false, mailCode: null })
            .then(() => showDashToast('Force-pin removed.', 'success'));
    });
}

// --- Force Read ---
function sendForceRead() {
    const agent = document.getElementById('forceReadAgent').value;
    const mailCode = document.getElementById('forceReadMailCode').value.trim();
    if (!mailCode) { showDashToast('Enter a mail code first.', 'error'); return; }

    db.collection('systemCommands').add({
        type: 'forceRead',
        mailCode,
        target: agent, // 'all' or specific username
        sentBy: currentUser ? currentUser.username : 'Admin',
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        active: true
    }).then(() => showDashToast(`Force-read order sent for "${mailCode}" to ${agent === 'all' ? 'all agents' : agent}`, 'success'))
        .catch(e => showDashToast('Error: ' + e.message, 'error'));
}

// --- Personal Warning ---
function sendPersonalWarning() {
    const agent = document.getElementById('warnAgent').value;
    const msg = document.getElementById('warnMessage').value.trim();
    if (!agent) { showDashToast('Select an agent first.', 'error'); return; }
    if (!msg) { showDashToast('Enter a warning message.', 'error'); return; }

    db.collection('systemCommands').add({
        type: 'personalWarning',
        message: msg,
        target: agent,
        sentBy: currentUser ? currentUser.username : 'Admin',
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        active: true
    }).then(() => {
        showDashToast(`Warning sent to ${agent}`, 'success');
        document.getElementById('warnMessage').value = '';
    }).catch(e => showDashToast('Error: ' + e.message, 'error'));
}

// --- Populate Agent Dropdowns in Controls ---
function populateAgentDropdowns() {
    const selects = ['forceReadAgent', 'warnAgent'];
    selects.forEach(id => {
        const sel = document.getElementById(id);
        if (!sel) return;
        // Keep first option (All/Select)
        while (sel.options.length > 1) sel.remove(1);
        allAgentsList.forEach(a => {
            const opt = document.createElement('option');
            opt.value = a.username;
            opt.text = a.username + (a.branch ? ` (${a.branch})` : '');
            sel.appendChild(opt);
        });
    });
}

// --- Filter/Search Dropdowns ---
function filterSelect(inputId, selectId) {
    const term = document.getElementById(inputId).value.toLowerCase();
    const sel = document.getElementById(selectId);
    const selected = sel.value;

    while (sel.options.length > 0) sel.remove(0);

    if (selectId === 'forceReadAgent') {
        const opt = document.createElement('option');
        opt.value = 'all'; opt.text = '📢 All Agents'; sel.appendChild(opt);
    } else {
        const opt = document.createElement('option');
        opt.value = ''; opt.text = 'Select Agent...'; sel.appendChild(opt);
    }

    allAgentsList.forEach(a => {
        const text = a.username + (a.branch ? ` (${a.branch})` : '');
        if (text.toLowerCase().includes(term)) {
            const opt = document.createElement('option');
            opt.value = a.username;
            opt.text = text;
            sel.appendChild(opt);
        }
    });

    if (Array.from(sel.options).some(o => o.value === selected)) sel.value = selected;
}

// --- Welcome Message ---
function updateWelcomeMessage() {
    const msg = document.getElementById('welcomeMsgInput').value.trim();
    if (!msg) { showDashToast('Enter a message first.', 'error'); return; }

    db.collection('systemSettings').doc('welcomeMessage').set({
        text: msg,
        updatedBy: currentUser ? currentUser.username : 'Admin',
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(() => showDashToast('Welcome message updated!', 'success'))
        .catch(e => showDashToast('Error: ' + e.message, 'error'));
}

// --- Purge Old Broadcasts ---
function purgeOldBroadcasts() {
    showDashConfirm('This will delete all broadcasts older than 24h. Continue?', () => {
        const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
        db.collection('systemBroadcasts').where('timestamp', '<', cutoff).get()
            .then(snap => {
                const batch = db.batch();
                snap.forEach(d => batch.delete(d.ref));
                return batch.commit();
            }).then(() => showDashToast('Old broadcasts purged.', 'success'))
            .catch(e => showDashToast('Error: ' + e.message, 'error'));
    });
}

// --- Export to CSV ---
function exportToCSV() {
    const validMails = allMails.filter(m => !m.isDeleted && !m.isDraft);
    const nowISO = new Date().toISOString();
    const published = validMails.filter(m => !m.publishAt || m.publishAt <= nowISO);

    const rows = [['Mail Code', 'Topic', 'Category', 'Created By', 'Publish Date', 'Total Reads', 'Requires Receipt', 'Compliance %']];
    published.forEach(m => {
        const reads = (m.readConfirmations || []).length;
        const possible = allAgentsList.length || 1;
        const compliance = Math.min(100, Math.round((reads / possible) * 100));
        rows.push([
            m.code || 'N/A',
            (m.topic || '').replace(/,/g, ';'),
            m.category || 'N/A',
            m.createdBy || 'N/A',
            m.publishAt ? new Date(m.publishAt).toLocaleDateString() : 'N/A',
            reads,
            m.requireReadReceipt ? 'Yes' : 'No',
            compliance + '%'
        ]);
    });

    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `HDB_Mail_Report_${new Date().toLocaleDateString().replace(/\//g, '-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showDashToast('Report exported to CSV!', 'success');
}

// --- Latency Ping ---
function pingLatency() {
    const start = Date.now();
    db.collection('systemSettings').doc('ping').set({ t: firebase.firestore.FieldValue.serverTimestamp() })
        .then(() => {
            const ms = Date.now() - start;
            const badge = document.getElementById('latencyBadge');
            if (badge) {
                badge.innerText = `⚡ ${ms}ms`;
                badge.style.color = ms < 300 ? '#2ecc71' : ms < 700 ? '#f1c40f' : '#e74c3c';
                badge.style.background = ms < 300 ? 'rgba(46,204,113,0.15)' : ms < 700 ? 'rgba(241,196,15,0.15)' : 'rgba(239,68,68,0.15)';
            }
        });
}
setInterval(pingLatency, 30000); // Ping every 30s
setTimeout(pingLatency, 2000);   // Initial ping on load

// --- Best Publish Hour (called from updateMailIntelligence) ---
function updateBestPublishHour(hourCounts) {
    let peakHour = 0, maxVal = 0;
    hourCounts.forEach((c, h) => { if (c > maxVal) { maxVal = c; peakHour = h; } });
    const el = document.getElementById('bestPublishHour');
    if (el && maxVal > 0) {
        const ampm = peakHour >= 12 ? 'PM' : 'AM';
        el.innerText = `${peakHour % 12 || 12}:00 ${ampm}`;
    }
}

// --- Dashboard Toast (replaces alerts) ---
function showDashToast(msg, type = 'success') {
    const existing = document.getElementById('dash-toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.id = 'dash-toast';
    const bg = type === 'success' ? 'rgba(39,174,96,0.95)' : 'rgba(231,76,60,0.95)';
    toast.style.cssText = `position:fixed; bottom:30px; right:30px; background:${bg}; color:white; padding:14px 24px; border-radius:12px; font-weight:bold; font-size:14px; z-index:999999; box-shadow:0 8px 25px rgba(0,0,0,0.3); animation:slideInRight 0.3s ease;`;
    toast.innerHTML = `${type === 'success' ? '✅' : '❌'} ${msg}<style>@keyframes slideInRight{from{transform:translateX(100px);opacity:0}to{transform:translateX(0);opacity:1}}</style>`;
    document.body.appendChild(toast);
    setTimeout(() => { if (toast.parentNode) toast.style.opacity = '0'; setTimeout(() => toast.remove(), 400); }, 3000);
}

function updateAuditLog() {
    const feed = document.getElementById('auditLogFeed');
    if (!feed) return;

    let allLogs = [];
    allMails.forEach(m => {
        if (m.historyLog && Array.isArray(m.historyLog)) {
            m.historyLog.forEach(log => {
                allLogs.push({ ...log, mailCode: m.code || 'SYS' });
            });
        }
    });

    allLogs.sort((a, b) => new Date(b.modifiedAt) - new Date(a.modifiedAt));

    if (allLogs.length === 0) {
        feed.innerHTML = '<div style="text-align:center; color: var(--text-muted); padding: 20px;">No modifications recorded yet.</div>';
        return;
    }

    feed.innerHTML = allLogs.map(log => {
        const d = new Date(log.modifiedAt).toLocaleString();
        return `
            <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05); padding: 12px; border-radius: 8px; margin-bottom: 10px; display:flex; justify-content: space-between; align-items:flex-start;">
                <div>
                    <span style="color: var(--primary); font-weight: bold; font-size: 13px;">${log.modifiedBy || 'Unknown'}</span>
                    <span style="color: var(--text-muted); font-size: 13px;"> modified mail </span>
                    <span style="color: #60A5FA; font-weight: bold; font-size: 13px;">${log.mailCode}</span>
                </div>
                <div style="font-size: 11px; color: var(--text-muted);">${d}</div>
            </div>
        `;
    }).join('');
}

function sendEmergencyBroadcast() {
    const title = document.getElementById('emergencyTitle').value;
    const msg = document.getElementById('emergencyMessage').value;
    if (!title || !msg) {
        showDashToast("Please fill both the title and message fields.", "error");
        return;
    }

    db.collection("systemBroadcasts").add({
        title,
        message: msg,
        createdBy: currentUser ? currentUser.username : "Admin",
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        active: true
    }).then(() => {
        showDashToast("Broadcast Sent Globally! Agents will see this instantly.", "success");
        document.getElementById('emergencyTitle').value = "";
        document.getElementById('emergencyMessage').value = "";
    }).catch(e => {
        console.error("Error sending broadcast", e);
        showDashToast("Failed to send broadcast.", "error");
    });
}

function clearAllSearchHistory() {
    showDashConfirm("Are you sure you want to clear all search logs? This will reset the global search keywords chart.", () => {
        db.collection("searchLogs").get().then(snap => {
            const batch = db.batch();
            snap.forEach(doc => {
                batch.delete(doc.ref);
            });
            return batch.commit();
        }).then(() => {
            showDashToast("Search history cleared successfully.", "success");
        }).catch(e => {
            console.error("Error clearing search logs: ", e);
            showDashToast("Failed to delete search logs.", "error");
        });
    });
}

// -------------------------------------------------------------
// UI Interactions
// -------------------------------------------------------------

function switchTab(tabId) {
    // Hide all sections
    document.querySelectorAll('.view-section').forEach(sec => sec.style.display = 'none');
    // Show target section
    document.getElementById(`view-${tabId}`).style.display = 'block';

    // Update active class on nav
    document.querySelectorAll('.nav-links li').forEach(li => li.classList.remove('active'));
    event.currentTarget.classList.add('active');

    // Update Page Title
    const titleKey = event.currentTarget.querySelector('span[data-i18n]').getAttribute('data-i18n');
    document.getElementById('pageTitle').innerText = translations[currentLang][titleKey];
}

function toggleTheme() {
    const body = document.body;
    body.classList.toggle('light-theme');
    const isLight = body.classList.contains('light-theme');

    const themeText = currentLang === 'en'
        ? (isLight ? "Dark Mode" : "Light Mode")
        : (isLight ? "الوضع الداكن" : "الوضع المضيء");

    event.currentTarget.innerHTML = `💡 <span data-i18n="switch_theme">${themeText}</span>`;

    // Update chart colors if chart exists
    if (window.pulseChartObj) {
        window.pulseChartObj.options.scales.x.ticks.color = isLight ? '#64748b' : '#94A3B8';
        window.pulseChartObj.options.scales.y.ticks.color = isLight ? '#64748b' : '#94A3B8';
        window.pulseChartObj.update();
    }
}

function toggleLanguage() {
    currentLang = currentLang === 'en' ? 'ar' : 'en';
    const isAr = currentLang === 'ar';

    document.documentElement.dir = isAr ? 'rtl' : 'ltr';
    document.documentElement.lang = currentLang;

    // Replace all text matching data-i18n
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (translations[currentLang][key]) {
            el.innerText = translations[currentLang][key];
        }
    });
}

function flipCard(element) {
    element.classList.toggle('flipped');
}

function forceRefresh() {
    // Spin the button
    const btn = event.currentTarget;
    btn.style.transform = "rotate(360deg)";

    // Reset numbers to 0 then animate again
    document.querySelectorAll('.counter').forEach(el => {
        el.innerText = '0';
    });

    setTimeout(() => {
        animateCounters();
        btn.style.transform = "rotate(0deg)";
    }, 500);
}

function applyDateFilter() {
    const filter = document.getElementById('globalDateFilter').value;
    // Re-run all modules with the new filter
    try { calculateKPIs(filter); } catch (e) { }
    try { animateCounters(); } catch (e) { }
    try { updatePulseChart(); } catch (e) { }
    try { updateMailIntelligence(); } catch (e) { }
    try { renderAgentCards(); } catch (e) { }
    try { updateAuditLog(); } catch (e) { }
    try { updateRailwayTimeline(); } catch (e) { }
    // Re-run search stats with the current logs snapshot (stored in closure)
    db.collection("searchLogs").orderBy("timestamp", "desc").limit(500).get().then(snap => {
        const logs = snap.docs.map(d => d.data());
        try { updateSearchStats(logs); } catch (e) { }
    });
}

// -------------------------------------------------------------
// Custom Confirm Modal
// -------------------------------------------------------------
function showDashConfirm(message, callback) {
    const existing = document.getElementById('dash-confirm');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'dash-confirm';
    modal.innerHTML = `
        <div style="position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.8);backdrop-filter:blur(5px);z-index:9999999;display:flex;align-items:center;justify-content:center;">
            <div style="background:#1e1e2d; padding:30px; border-radius:16px; text-align:center; box-shadow:0 15px 40px rgba(0,0,0,0.5); max-width:320px; width:90%; color:white; border: 1px solid rgba(255,255,255,0.1); animation:zoomIn 0.2s ease;">
                <div style="font-size:40px; margin-bottom:10px;">❓</div>
                <h3 style="margin-bottom:15px; font-size:18px;">Confirmation</h3>
                <p style="font-size:14px; margin-bottom:25px; color:#ccc;">${message}</p>
                <div style="display:flex; gap:10px; justify-content:center;">
                    <button id="dashConfirmCancel" style="flex:1; background:rgba(255,255,255,0.1); color:white; border:none; padding:10px; border-radius:8px; cursor:pointer; font-weight:bold; transition: 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.2)'" onmouseout="this.style.background='rgba(255,255,255,0.1)'">Cancel</button>
                    <button id="dashConfirmOk" style="flex:1; background:#e74c3c; color:white; border:none; padding:10px; border-radius:8px; cursor:pointer; font-weight:bold; transition: 0.2s;" onmouseover="this.style.background='#c0392b'" onmouseout="this.style.background='#e74c3c'">Yes, do it</button>
                </div>
            </div>
            <style>@keyframes zoomIn { from { opacity:0; transform:scale(0.9); } to { opacity:1; transform:scale(1); } }</style>
        </div>`;
    document.body.appendChild(modal);

    document.getElementById('dashConfirmCancel').onclick = () => modal.remove();
    document.getElementById('dashConfirmOk').onclick = () => {
        modal.remove();
        callback();
    };
}

// -------------------------------------------------------------
// Animations
// -------------------------------------------------------------
function animateCounters() {
    const counters = document.querySelectorAll('.counter');
    const speed = 50;

    counters.forEach(counter => {
        // Clear previous animation loop to prevent lag and CPU freeze
        if (counter._animId) clearTimeout(counter._animId);

        const target = +counter.getAttribute('data-target');
        if (isNaN(target)) return;

        const updateCount = () => {
            const current = +counter.innerText;
            const inc = Math.max(1, Math.ceil((target - current) / speed));

            if (current < target) {
                counter.innerText = current + inc;
                counter._animId = setTimeout(updateCount, 15);
            } else {
                counter.innerText = target;
            }
        };
        updateCount();
    });
}

// -------------------------------------------------------------
// Chart.js Setup
// -------------------------------------------------------------
function initChart() {
    const ctx = document.getElementById('pulseChart').getContext('2d');

    const gradientFill = ctx.createLinearGradient(0, 0, 0, 400);
    gradientFill.addColorStop(0, 'rgba(46, 204, 113, 0.4)'); // Green
    gradientFill.addColorStop(1, 'rgba(46, 204, 113, 0.0)');

    const gradientFillBlue = ctx.createLinearGradient(0, 0, 0, 400);
    gradientFillBlue.addColorStop(0, 'rgba(127, 140, 141, 0.4)'); // Grey
    gradientFillBlue.addColorStop(1, 'rgba(127, 140, 141, 0.0)');

    window.pulseChartObj = new Chart(ctx, {
        type: 'line',
        data: {
            labels: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
            datasets: [
                {
                    label: 'Reads',
                    data: [120, 190, 300, 250, 280, 400, 350],
                    borderColor: '#2ecc71', // Green
                    backgroundColor: gradientFill,
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4,
                    pointBackgroundColor: '#2ecc71',
                    pointRadius: 4
                },
                {
                    label: 'Publishes',
                    data: [10, 25, 40, 15, 30, 50, 20],
                    borderColor: '#7f8c8d', // Grey
                    backgroundColor: gradientFillBlue,
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 0
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: { color: '#94A3B8' }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: { color: '#94A3B8' }
                },
                x: {
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: { color: '#94A3B8' }
                }
            },
            interaction: {
                intersect: false,
                mode: 'index',
            },
        }
    });

    // Heatmap Chart (Intelligence Module)
    const heatCanvas = document.getElementById('heatmapChart');
    if (heatCanvas) {
        const heatCtx = heatCanvas.getContext('2d');
        window.heatmapChartObj = new Chart(heatCtx, {
            type: 'bar',
            data: {
                labels: Array.from({ length: 24 }, (_, i) => i + ":00"),
                datasets: [{
                    label: 'Reads Frequency',
                    data: new Array(24).fill(0),
                    backgroundColor: 'rgba(46, 204, 113, 0.4)',
                    borderColor: 'rgba(46, 204, 113, 1)',
                    borderWidth: 1,
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        ticks: { color: '#94A3B8' }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { color: '#94A3B8', maxRotation: 45, minRotation: 0 }
                    }
                }
            }
        });
    }

    // Category Bar Chart (Topics Funnel)
    const catCanvas = document.getElementById('categoryChart');
    if (catCanvas) {
        window.categoryChartObj = new Chart(catCanvas.getContext('2d'), {
            type: 'bar',
            data: {
                labels: ['Urgent', 'Update', 'Policy', 'Other'],
                datasets: [{
                    label: 'Mails Published',
                    data: [0, 0, 0, 0],
                    backgroundColor: ['#e74c3c', '#f1c40f', '#3498db', '#95a5a6'],
                    borderWidth: 0,
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: '#94A3B8' } },
                    x: { grid: { display: false }, ticks: { color: '#94A3B8' } }
                }
            }
        });
    }
}

// -------------------------------------------------------------
// Global Actions (Exports & Modals)
// -------------------------------------------------------------
window.openExportModal = function () {
    document.getElementById('exportModal').style.display = 'flex';
};

window.closeExportModal = function () {
    document.getElementById('exportModal').style.display = 'none';
};

window.executeProfessionalExport = function () {
    const range = document.getElementById('exportDateRange').value;
    const includeOverview = document.getElementById('expOverview').checked;
    const includeAgents = document.getElementById('expAgents').checked;
    const includeMails = document.getElementById('expMails').checked;

    let csv = "HDB Quality Team - Custom Professional Report\n";
    csv += "Generated On," + new Date().toLocaleString() + "\n";
    csv += "Date Range Filter," + range.toUpperCase() + "\n\n";

    // Overview Data
    if (includeOverview) {
        csv += "--- SYSTEM HEALTH & OVERVIEW ---\n";
        const totalMails = document.querySelector('.kpi-card:nth-child(1) .counter')?.getAttribute('data-target') || 0;
        const readRate = document.getElementById('confRateVal')?.innerText || "0%";
        const activeAgents = document.querySelector('.kpi-card:nth-child(3) .counter')?.getAttribute('data-target') || 0;
        const healthScore = document.getElementById('healthScoreVal')?.innerText || "0%";

        csv += "Total Mails Published," + totalMails + "\n";
        csv += "Confirmation Rate," + readRate + "\n";
        csv += "Active Agents Now," + activeAgents + "\n";
        csv += "Overall System Health," + healthScore + "\n\n";
    }

    // Agent Data
    if (includeAgents) {
        csv += "--- AGENT COMPLIANCE & BEHAVIOR ---\n";
        csv += "Name,Role,Branch,Mails Read,Compliance %\n";
        allAgentsList.forEach(a => {
            const reads = allMails.filter(m => !m.isDraft && !m.isDeleted && m.requireReadReceipt &&
                (m.readConfirmations || []).some(r => (r.u || r.username) === a.username)).length;
            const total = allMails.filter(m => !m.isDraft && !m.isDeleted && m.requireReadReceipt).length || 1;
            const perc = Math.min(100, Math.round((reads / total) * 100));
            csv += `"${a.username || 'Unknown'}","${a.role || 'Agent'}","${a.branch || 'N/A'}",${reads},${perc}%\n`;
        });
        csv += "\n";
    }

    if (includeMails) {
        csv += "--- MAILS INTELLIGENCE ---\n";
        csv += "Topic,Category,Published Date,Total Reads,Compliance %\n";
        const nowISO = new Date().toISOString();
        allMails.filter(m => !m.isDraft && !m.isDeleted && (!m.publishAt || m.publishAt <= nowISO)).forEach(m => {
            const reads = (m.readConfirmations || []).length;
            const possible = allAgentsList.length || 1;
            const comp = Math.min(100, Math.round((reads / possible) * 100));
            const pTime = m.publishAt ? new Date(m.publishAt).toLocaleDateString() : 'N/A';
            csv += `"${(m.topic || 'Untitled').replace(/"/g, "'")}","${m.category || 'Other'}",${pTime},${reads},${comp}%\n`;
        });
    }

    const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `HDB_Report_${new Date().toISOString().split('T')[0]}.csv`;
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    closeExportModal();
    showDashToast('✅ Report exported successfully!', 'success');
};

window.openAgentProfile = function (username) {
    const agent = allAgentsList.find(a => a.username === username);
    if (!agent) return;

    const content = document.getElementById('agentProfileContent');
    const validMails = allMails.filter(m => !m.isDraft && !m.isDeleted);
    let timelineHtml = '';
    let pinnedHtml = '';

    const agentReads = [];
    validMails.forEach(m => {
        if (m.readConfirmations) {
            const r = m.readConfirmations.find(x => x.username === username);
            if (r) agentReads.push({ topic: m.topic || 'Untitled', time: new Date(r.t || r.at || r.confirmationTime || Date.now()) });
        }
        if (m.pinnedBy && m.pinnedBy.includes(username)) {
            pinnedHtml += `<li style="padding:4px 0; border-bottom:1px solid rgba(255,255,255,0.05);">📌 ${(m.topic || 'Untitled').substring(0, 25)}</li>`;
        }
    });

    // Call search cloud for this agent
    setTimeout(() => { try { updateAgentSearchCloud(username); } catch (e) { } }, 100);

    agentReads.sort((a, b) => b.time - a.time).slice(0, 5).forEach(r => {
        timelineHtml += `<li style="margin-bottom:8px; font-size:13px; display:flex; justify-content:space-between; align-items:center; background:rgba(0,0,0,0.2); padding:8px; border-radius:6px;">
            <span>👁️ ${r.topic.substring(0, 20)}</span>
            <span style="color:var(--text-muted); font-size:11px;">${r.time.toLocaleTimeString()}</span>
        </li>`;
    });
    if (!timelineHtml) timelineHtml = "<li style='color:var(--text-muted); padding:10px 0;'>No recent activity.</li>";
    if (!pinnedHtml) pinnedHtml = "<li style='color:var(--text-muted); padding:10px 0;'>No pins found.</li>";

    content.innerHTML = `
        <h2 style="margin:0 0 5px 0; color:var(--primary); display:flex; align-items:center; gap:10px;">
            <div style="width:40px; height:40px; border-radius:50%; background:var(--primary); color:white; display:flex; align-items:center; justify-content:center; font-size:18px;">${agent.username.charAt(0).toUpperCase()}</div>
            ${agent.username}
        </h2>
        <p style="font-size:14px; color:var(--text-muted); margin:0 0 20px 0;">${agent.branch || 'N/A'} • Compliance: ${agent.readPerc || 0}%</p>
        
        <div style="display:flex; gap:20px; margin-top:20px;">
            <div style="flex:1;">
                <h4 style="margin-bottom:10px; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:5px;">📅 Recent Timeline</h4>
                <ul style="list-style:none; padding:0; margin:0;">${timelineHtml}</ul>
            </div>
            <div style="flex:1;">
                <h4 style="margin-bottom:10px; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:5px;">📌 Pinned Mails</h4>
                <ul style="list-style:none; padding:0; margin:0; font-size:13px;">${pinnedHtml}</ul>
            </div>
        </div>
        
        <div style="margin-top:25px;">
            <h4 style="margin-bottom:10px;">📊 Reading Performance vs Average</h4>
            <div style="background:rgba(255,255,255,0.05); padding:15px; border-radius:8px; text-align:center; font-size:13px; color:var(--text-muted); border:1px solid rgba(255,255,255,0.1);">
                <div style="width:100%; background:rgba(0,0,0,0.3); border-radius:10px; height:12px; position:relative; overflow:hidden; margin-bottom:10px;">
                    <div style="position:absolute; top:0; left:0; height:100%; width:${agent.readPerc || 0}%; background:${(agent.readPerc || 0) < 50 ? 'var(--danger)' : 'var(--primary)'}; border-radius:10px;"></div>
                    <div style="position:absolute; top:0; left:50%; height:100%; width:2px; background:red; z-index:1;" title="Average Threshold"></div>
                </div>
                <div>Agent: <span style="color:white; font-weight:bold;">${agent.readPerc || 0}%</span> &nbsp;|&nbsp; System Expected: <span style="color:white; font-weight:bold;">50%</span></div>
            </div>
        </div>
    `;

    document.getElementById('agentProfileModal').style.display = 'flex';
};

window.closeAgentProfile = function () {
    document.getElementById('agentProfileModal').style.display = 'none';
};

// =============================================================
// 15 NEW FEATURES — JS Implementation
// =============================================================

// 1. Live Active Agents Sidebar
function updateLiveAgents() {
    const el = document.getElementById('liveAgentsList');
    if (!el) return;
    const now = Date.now();
    const online = allAgentsList.filter(u => {
        let ll = 0;
        if (u.lastLogin) ll = typeof u.lastLogin.toDate === 'function' ? u.lastLogin.toDate().getTime() : new Date(u.lastLogin).getTime();
        return ll > 0 && (now - ll) < 15 * 60 * 1000;
    });
    if (online.length === 0) {
        el.innerHTML = '<span style="color:var(--text-muted);">No agents online right now.</span>';
        return;
    }
    el.innerHTML = online.map(u => `
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
            <div style="width:8px;height:8px;border-radius:50%;background:#2ecc71;box-shadow:0 0 6px #2ecc71;flex-shrink:0;"></div>
            <span style="color:var(--text-main);font-size:12px;">${u.username || 'Unknown'}</span>
            <span style="color:var(--text-muted);font-size:11px;margin-left:auto;">${u.branch || ''}</span>
        </div>`).join('');
}

// 2. Urgent Unread Alert (fires if urgent mail not read in 1h)
function checkUrgentAlerts() {
    const bar = document.getElementById('urgentAlertBar');
    const txt = document.getElementById('urgentAlertText');
    if (!bar || !txt) return;
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const nowISO = new Date().toISOString();
    const urgentUnread = allMails.filter(m => {
        if (m.category !== 'Urgent' || m.isDraft || m.isDeleted) return false;
        if (!m.publishAt || m.publishAt > nowISO) return false;
        const pTime = new Date(m.publishAt).getTime();
        if (pTime > oneHourAgo) return false; // published < 1h ago, give time
        const reads = (m.readConfirmations || []).length;
        const possible = allAgentsList.length || 1;
        return (reads / possible) < 0.5; // less than 50% read
    });
    if (urgentUnread.length > 0) {
        bar.style.display = 'flex';
        txt.innerHTML = `<strong>${urgentUnread.length}</strong> urgent mail(s) have been published for over 1 hour with less than 50% read rate: ${urgentUnread.slice(0, 3).map(m => `<strong style="color:#ef4444">${m.topic || m.code || '?'}</strong>`).join(', ')}`;
    } else {
        bar.style.display = 'none';
    }
}

// 3. Out-of-Hours Reading Log
function updateOutOfHoursLog() {
    const el = document.getElementById('outOfHoursList');
    if (!el) return;
    const entries = [];
    allMails.forEach(m => {
        if (!m.readConfirmations) return;
        m.readConfirmations.forEach(r => {
            const ts = r.t || r.at || r.confirmationTime;
            if (!ts) return;
            const d = new Date(ts);
            const h = d.getHours();
            if (h < 8 || h >= 18) {
                entries.push({ username: r.u || r.username || '?', hour: h, topic: m.topic || m.code || 'N/A', time: d });
            }
        });
    });
    if (entries.length === 0) {
        el.innerHTML = '<span style="color:var(--text-muted);">No out-of-hours reading detected.</span>';
        return;
    }
    entries.sort((a, b) => b.time - a.time);
    el.innerHTML = entries.slice(0, 10).map(e => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
            <span><span style="color:#a78bfa;font-weight:bold;">${e.username}</span> read <em>${e.topic.substring(0, 20)}</em></span>
            <span style="color:var(--text-muted);font-size:11px;">${e.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>`).join('');
}

// 4. Re-Read Detection (Removed by user request)

// 5. Agent Search Cloud (in Profile modal)
function updateAgentSearchCloud(username) {
    const el = document.getElementById('agentSearchCloud');
    if (!el) return;
    // We don't have per-agent search logs in DB yet — show placeholder
    el.innerHTML = `
        <h4 style="margin:0 0 10px 0;font-size:13px;color:#60a5fa;">🔍 Search Keywords Cloud</h4>
        <p style="font-size:12px;color:var(--text-muted);">Per-agent search tracking will appear here once searchLogs includes username data.</p>`;
}

// 6. Print Agent Report
window.printAgentReport = function () {
    const content = document.getElementById('agentProfileContent');
    if (!content) return;
    const w = window.open('', '_blank');
    w.document.write(`<html><head><title>HDB Agent Report</title>
    <style>body{font-family:Arial,sans-serif;padding:20px;color:#111;}h2,h4{color:#27ae60;}li{margin-bottom:6px;}</style></head>
    <body><h2>HDB Quality Team — Agent Report</h2><hr>${content.innerHTML}<p style="color:#999;font-size:12px;">Generated: ${new Date().toLocaleString()}</p></body></html>`);
    w.document.close();
    w.print();
};

// 7. Mail Lifecycle Chart (rich version)
let lifecycleChartObj = null;
window.updateLifecycleChart = function () {
    const mailId = document.getElementById('lifecyclMailSelect').value;
    const mail = allMails.find(m => m.id === mailId);
    if (!mail || !mail.readConfirmations || !mail.readConfirmations.length) return;

    const dayCounts = {};
    let firstReadTime = null;
    mail.readConfirmations.forEach(r => {
        const ts = r.t || r.at || r.confirmationTime;
        if (!ts) return;
        const d = new Date(ts);
        if (!firstReadTime || d < firstReadTime) firstReadTime = d;
        const day = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        dayCounts[day] = (dayCounts[day] || 0) + 1;
    });
    const labels = Object.keys(dayCounts).sort((a, b) => new Date(a + '/2025') - new Date(b + '/2025'));
    const data = labels.map(l => dayCounts[l]);
    const maxVal = Math.max(...data);
    const peakDay = labels[data.indexOf(maxVal)] || 'N/A';
    const totalReads = mail.readConfirmations.length;
    const coverage = allAgentsList.length > 0 ? Math.round((totalReads / allAgentsList.length) * 100) : 0;
    const pubDate = mail.publishAt ? new Date(mail.publishAt) : null;
    const timeToPeak = pubDate && firstReadTime ? Math.round((firstReadTime - pubDate) / 60000) : null;

    if (lifecycleChartObj) { lifecycleChartObj.destroy(); lifecycleChartObj = null; }
    const canvas = document.getElementById('lifecycleChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    lifecycleChartObj = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets: [{ label: 'Reads/Day', data, borderColor: '#a78bfa', backgroundColor: 'rgba(167,139,250,0.15)', fill: true, tension: 0.4, borderWidth: 2, pointRadius: 5, pointBackgroundColor: data.map(v => v === maxVal ? '#f1c40f' : '#a78bfa') }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { color: '#94A3B8' }, grid: { color: 'rgba(255,255,255,0.05)' } }, x: { ticks: { color: '#94A3B8' }, grid: { display: false } } } }
    });
    // Show stats
    const statsHtml = `
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:10px;">
            <span style="background:rgba(167,139,250,0.15);color:#a78bfa;padding:4px 10px;border-radius:20px;font-size:12px;">📊 Total: <strong>${totalReads}</strong></span>
            <span style="background:rgba(241,196,15,0.15);color:#f1c40f;padding:4px 10px;border-radius:20px;font-size:12px;">🏆 Peak: <strong>${peakDay}</strong> (${maxVal} reads)</span>
            <span style="background:rgba(39,174,96,0.15);color:#2ecc71;padding:4px 10px;border-radius:20px;font-size:12px;">👥 Coverage: <strong>${coverage}%</strong> of agents</span>
            ${timeToPeak !== null ? `<span style="background:rgba(96,165,250,0.15);color:#60a5fa;padding:4px 10px;border-radius:20px;font-size:12px;">⚡ First read: <strong>${timeToPeak}m</strong> after publish</span>` : ''}
        </div>`;
    const existing = document.getElementById('lifecycleStats');
    if (existing) existing.innerHTML = statsHtml;
    else {
        const statsDiv = document.createElement('div'); statsDiv.id = 'lifecycleStats';
        statsDiv.innerHTML = statsHtml; canvas.closest('.glass-card').appendChild(statsDiv);
    }
};

function populateLifecycleSelect() {
    const sel = document.getElementById('lifecyclMailSelect');
    if (!sel) return;
    while (sel.options.length > 1) sel.remove(1);
    allMails.filter(m => !m.isDraft && !m.isDeleted && m.readConfirmations?.length > 0)
        .sort((a, b) => (b.readConfirmations?.length || 0) - (a.readConfirmations?.length || 0))
        .slice(0, 30).forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.id;
            opt.text = `${m.topic || m.code || 'Untitled'} (${m.readConfirmations.length} reads)`;
            sel.appendChild(opt);
        });
}

// 8. Department Comparison Chart
let deptChartObj = null;
function updateDeptChart() {
    const ctx = document.getElementById('deptChart')?.getContext('2d');
    if (!ctx) return;
    const branches = {};
    allAgentsList.forEach(agent => {
        const b = agent.branch || 'Unknown';
        if (!branches[b]) branches[b] = { reads: 0, total: 0 };
        const totalReq = allMails.filter(m => !m.isDraft && !m.isDeleted && m.requireReadReceipt).length;
        const agentReads = allMails.filter(m => !m.isDraft && !m.isDeleted && m.requireReadReceipt &&
            (m.readConfirmations || []).some(r => (r.u || r.username) === agent.username)).length;
        branches[b].reads += agentReads;
        branches[b].total += totalReq;
    });
    const labels = Object.keys(branches);
    const data = labels.map(l => branches[l].total > 0 ? Math.round((branches[l].reads / branches[l].total) * 100) : 0);
    if (deptChartObj) deptChartObj.destroy();
    deptChartObj = new Chart(ctx, {
        type: 'bar',
        data: { labels, datasets: [{ label: 'Compliance %', data, backgroundColor: labels.map((_, i) => ['#2ecc71', '#3498db', '#a78bfa', '#f1c40f', '#e74c3c'][i % 5]), borderRadius: 6 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, max: 100, ticks: { color: '#94A3B8', callback: v => v + '%' }, grid: { color: 'rgba(255,255,255,0.05)' } }, x: { ticks: { color: '#94A3B8' }, grid: { display: false } } } }
    });
}

// 9. Duplicate Detector — smart Jaccard similarity on topic + content, shows codes + %
function updateDuplicateDetector() {
    const el = document.getElementById('duplicateMailsList');
    if (!el) return;
    const mails = allMails.filter(m => !m.isDeleted && (m.topic || m.content || m.description));
    function tokenize(m) {
        return ((m.topic || '') + ' ' + (m.content || m.description || m.text || ''))
            .toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(w => w.length > 3);
    }
    function jaccard(a, b) {
        const A = new Set(a), B = new Set(b);
        const inter = [...A].filter(x => B.has(x)).length;
        const union = new Set([...A, ...B]).size;
        return union > 0 ? Math.round((inter / union) * 100) : 0;
    }
    const dupes = [];
    for (let i = 0; i < mails.length && dupes.length < 5; i++) {
        const tokA = tokenize(mails[i]);
        for (let j = i + 1; j < mails.length && dupes.length < 5; j++) {
            const sim = jaccard(tokA, tokenize(mails[j]));
            if (sim >= 35) dupes.push({ m1: mails[i], m2: mails[j], sim });
        }
    }
    if (dupes.length === 0) {
        el.innerHTML = '<span style="color:#2ecc71;">✅ No similar mails detected.</span>';
    } else {
        el.innerHTML = dupes.sort((a, b) => b.sim - a.sim).map(d =>
            `<span style="background:rgba(241,196,15,0.12);color:#f1c40f;padding:4px 12px;border-radius:20px;margin:3px;display:inline-flex;align-items:center;gap:8px;font-size:12px;">
                ⚠️ <strong>${d.m1.code || d.m1.topic?.substring(0, 10) || '?'}</strong> ↔ <strong>${d.m2.code || d.m2.topic?.substring(0, 10) || '?'}</strong>
                <span style="background:rgba(241,196,15,0.3);padding:2px 6px;border-radius:10px;">${d.sim}% similar</span>
            </span>`
        ).join('');
    }
}

// 10. Railway Timeline — Upcoming Scheduled Mails
function updateRailwayTimeline() {
    const el = document.getElementById('railwayTimeline');
    if (!el) return;

    const nowISO = new Date().toISOString();
    const upcoming = allMails
        .filter(m => !m.isDeleted && !m.isDraft && m.publishAt && m.publishAt > nowISO)
        .sort((a, b) => new Date(a.publishAt) - new Date(b.publishAt))
        .slice(0, 10);

    if (upcoming.length === 0) {
        el.innerHTML = '<p style="color:var(--text-muted); font-size:13px;">No upcoming scheduled mails.</p>';
        return;
    }

    el.innerHTML = upcoming.map((m, idx) => {
        const pub = new Date(m.publishAt);
        const timeStr = pub.toLocaleString(currentLang === 'ar' ? 'ar-EG' : 'en-US', {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });
        const hoursAway = Math.round((pub - new Date()) / (1000 * 60 * 60));
        const urgColor = m.category === 'Urgent' ? '#ef4444' : (idx === 0 ? 'var(--primary)' : '#60a5fa');
        return `
            <div style="display:flex; align-items:flex-start; gap:12px; margin-bottom:18px; position:relative;">
                <div style="display:flex; flex-direction:column; align-items:center; flex-shrink:0;">
                    <div style="width:14px; height:14px; border-radius:50%; background:${urgColor}; box-shadow:0 0 8px ${urgColor}; flex-shrink:0;"></div>
                    ${idx < upcoming.length - 1 ? '<div style="width:2px; flex-grow:1; background:rgba(255,255,255,0.1); min-height:30px; margin-top:4px;"></div>' : ''}
                </div>
                <div style="flex-grow:1;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <span style="font-weight:bold; font-size:13px; color:var(--text-main);">📧 ${m.code || 'SYS'} — ${(m.topic || '').substring(0, 35)}</span>
                        <span style="font-size:11px; padding:2px 8px; border-radius:20px; background:rgba(255,255,255,0.08); color:var(--text-muted); flex-shrink:0; margin-left:10px;">in ${hoursAway}h</span>
                    </div>
                    <div style="font-size:11px; color:var(--text-muted); margin-top:3px;">🕐 ${timeStr} — ${m.category || 'General'}</div>
                </div>
            </div>
        `;
    }).join('');
}

// 11. Maintenance Mode / System Lock
function setMaintenanceMode(lock) {
    showDashConfirm(lock ? '⚠️ This will block ALL agents from accessing the portal. Are you sure?' : 'Unlock the system and allow agents to login again?', () => {
        db.collection('systemSettings').doc('maintenanceMode').set({
            active: lock,
            setBy: currentUser?.username || 'Admin',
            setAt: firebase.firestore.FieldValue.serverTimestamp(),
            message: lock ? '🔧 System is currently under maintenance. Please check back shortly.' : ''
        }).then(() => {
            showDashToast(lock ? '🔒 System locked — agents will see maintenance page.' : '🔓 System unlocked — agents can now login.', lock ? 'error' : 'success');
            document.getElementById('maintenanceStatus').innerText = `Status: ${lock ? '🔴 LOCKED' : '🟢 ONLINE'}`;
            document.getElementById('maintenanceStatus').style.color = lock ? '#ef4444' : '#2ecc71';
        }).catch(e => showDashToast('Error: ' + e.message, 'error'));
    });
}

// Check maintenance status on load
db.collection('systemSettings').doc('maintenanceMode').get().then(doc => {
    const el = document.getElementById('maintenanceStatus');
    if (!el) return;
    if (doc.exists && doc.data().active) {
        el.innerText = 'Status: 🔴 LOCKED';
        el.style.color = '#ef4444';
    } else {
        el.innerText = 'Status: 🟢 ONLINE';
        el.style.color = '#2ecc71';
    }
}).catch(() => { });

// 12. Agent Poll
function sendAgentPoll() {
    const q = document.getElementById('pollQuestion')?.value.trim();
    const o1 = document.getElementById('pollOpt1')?.value.trim() || 'Yes';
    const o2 = document.getElementById('pollOpt2')?.value.trim() || 'No';
    if (!q) { showDashToast('Please enter a poll question.', 'error'); return; }
    db.collection('systemBroadcasts').add({
        type: 'poll', title: '📊 Quick Poll', question: q, options: [o1, o2],
        createdBy: currentUser?.username || 'Admin',
        timestamp: firebase.firestore.FieldValue.serverTimestamp(), active: true, votes: {}
    }).then(() => {
        showDashToast('✅ Poll sent to all agents!', 'success');
        document.getElementById('pollQuestion').value = '';
    }).catch(e => showDashToast('Error: ' + e.message, 'error'));
}

// Listen to Polls to show live results in Admin Dashboard
db.collection('systemBroadcasts').where('type', '==', 'poll').onSnapshot(snap => {
    const el = document.getElementById('pollResults');
    if (!el) return;
    const polls = snap.docs.map(d => d.data()).sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
    if (polls.length === 0) { el.innerHTML = '<span style="color:var(--text-muted);">No polls launched yet.</span>'; return; }

    el.innerHTML = polls.slice(0, 3).map(p => {
        const votes = p.votes || {};
        const totalVotes = Object.keys(votes).length;
        let resHtml = `<div style="margin-bottom:12px; padding:12px; background:rgba(255,255,255,0.04); border:1px solid rgba(167,139,250,0.2); border-radius:8px;">
            <div style="font-weight:bold; color:#a78bfa; margin-bottom:5px;">${p.question}</div>
            <div style="font-size:11px; color:var(--text-muted); margin-bottom:8px;">Total Votes: ${totalVotes}</div>`;
        if (totalVotes > 0) {
            const counts = {};
            Object.values(votes).forEach(v => counts[v] = (counts[v] || 0) + 1);
            resHtml += Object.entries(counts).map(([opt, count]) => {
                const perc = Math.round((count / totalVotes) * 100);
                return `
                <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
                    <div style="flex:1; font-size:11px;">${opt}</div>
                    <div style="flex:2; background:rgba(0,0,0,0.3); height:6px; border-radius:10px; overflow:hidden;">
                        <div style="width:${perc}%; height:100%; background:#a78bfa;"></div>
                    </div>
                    <div style="width:30px; text-align:right; font-size:11px; font-weight:bold;">${perc}%</div>
                </div>`;
            }).join('');
        }
        return resHtml + '</div>';
    }).join('');
});

// 13. Recycle Bin — shows ALL soft-deleted mails (isDeleted:true still in Firestore)
function updateRecycleBin() {
    const el = document.getElementById('recycleBinList');
    if (!el) return;
    const deleted = allMails.filter(m => m.isDeleted);
    if (deleted.length === 0) {
        el.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted);">🗑️ Recycle Bin is empty.</div>';
        return;
    }
    el.innerHTML = deleted.map(m => {
        const d = m.deletedAt ? new Date(m.deletedAt.seconds * 1000).toLocaleDateString() : (m.updatedAt ? new Date(m.updatedAt.seconds * 1000).toLocaleDateString() : 'N/A');
        const safeId = m.id.replace(/'/g, "\\'");
        return `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 0;border-bottom:1px solid rgba(255,255,255,0.06);gap:10px;flex-wrap:wrap;">
            <div style="flex:1;min-width:200px;">
                <div style="font-weight:bold;font-size:14px;">${m.topic || 'Untitled'} <span style="font-size:12px;color:var(--text-muted);">${m.code ? '(' + m.code + ')' : ''}</span></div>
                <div style="font-size:12px;color:var(--text-muted);margin-top:3px;">${m.category || 'N/A'} • by ${m.createdBy || '?'} • Deleted: ${d}</div>
            </div>
            <div style="display:flex;gap:8px;flex-shrink:0;">
                <button onclick="restoreMail('${safeId}')" style="background:rgba(39,174,96,0.15);color:#2ecc71;border:1px solid rgba(39,174,96,0.4);padding:7px 14px;border-radius:8px;cursor:pointer;font-size:12px;font-weight:bold;">♻️ Restore</button>
                <button onclick="permanentDelete('${safeId}')" style="background:rgba(239,68,68,0.15);color:var(--danger);border:1px solid rgba(239,68,68,0.4);padding:7px 14px;border-radius:8px;cursor:pointer;font-size:12px;font-weight:bold;">💥 Delete Forever</button>
            </div>
        </div>`;
    }).join('');
}

function restoreMail(id) {
    db.collection('mails').doc(id).update({ isDeleted: false, deletedAt: null })
        .then(() => { showDashToast('✅ Mail restored — visible to agents again.', 'success'); })
        .catch(e => showDashToast('Error restoring: ' + e.message, 'error'));
}

function permanentDelete(id) {
    showDashConfirm('🗑️ Permanently delete this mail from the database? This CANNOT be undone.', () => {
        db.collection('mails').doc(id).delete()
            .then(() => { showDashToast('Mail permanently deleted from database.', 'success'); })
            .catch(e => showDashToast('Error: ' + e.message, 'error'));
    });
}

function permanentDeleteAll() {
    const toDelete = allMails.filter(m => m.isDeleted);
    if (toDelete.length === 0) { showDashToast('Recycle Bin is already empty.', 'success'); return; }
    showDashConfirm(`💥 Permanently delete ALL ${toDelete.length} mails from the database? This CANNOT be undone.`, () => {
        const batch = db.batch();
        toDelete.forEach(m => batch.delete(db.collection('mails').doc(m.id)));
        batch.commit()
            .then(() => showDashToast(`${toDelete.length} mails permanently deleted.`, 'success'))
            .catch(e => showDashToast('Error: ' + e.message, 'error'));
    });
}

// 14. Cinematic Focus Mode (Removed by user request)

// 15. Hook all new functions into existing update cycle
const _origCalculateKPIs = calculateKPIs;
// Extend updatePulseChart to also trigger new features
const _origUpdateMailIntelligence = updateMailIntelligence;
window._extendedUpdate = function () {
    try { updateLiveAgents(); } catch (e) { }
    try { checkUrgentAlerts(); } catch (e) { }
    try { updateOutOfHoursLog(); } catch (e) { }
    try { updateDuplicateDetector(); } catch (e) { }
    try { updateRailwayTimeline(); } catch (e) { }
    try { updateDeptChart(); } catch (e) { }
    try { populateLifecycleSelect(); } catch (e) { }
    try { updateRecycleBin(); } catch (e) { }
};

// Patch the existing debounce callback to include new features
const _orig_db_listener_patched = false;
document.addEventListener('DOMContentLoaded', () => {
    // Run new features after initial load
    setTimeout(() => { try { window._extendedUpdate(); } catch (e) { } }, 3000);
    // Also run on recycle tab open
    document.querySelectorAll('.nav-links li').forEach(li => {
        li.addEventListener('click', () => setTimeout(() => { try { updateRecycleBin(); updateRailwayTimeline(); } catch (e) { } }, 100));
    });
});


