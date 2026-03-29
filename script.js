// 1. إعدادات فايربيز (لازم تكون أول حاجة)
const firebaseConfig = {
    apiKey: "AIzaSyDF8ArlHre-rdPyWsAX0PjJJ7JBY3sK2qM",
    authDomain: "mail-tool-f613a.firebaseapp.com",
    projectId: "mail-tool-f613a",
    storageBucket: "mail-tool-f613a.firebasestorage.app",
    messagingSenderId: "474574402711",
    appId: "1:474574402711:web:28238754c7a90b9bdae5d2",
    measurementId: "G-SVG7M7DMVN"
};

// تشغيل المحرك
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// 2. المتغيرات العامة
let allMails = []; 
let favorites = JSON.parse(localStorage.getItem('favMails')) || [];
let currentIndex = 0;
let visibleRows = [];
let currentFilters = { sender: 'All', topic: 'All' };

// 3. وظائف الأدمن (الإضافة)
function checkAdmin() {
    let p = prompt("أدخل كلمة السر:");
    if(p === "123") document.getElementById('adminPanel').style.display = 'block';
}

async function addNewEntry() {
    const code = document.getElementById('addCode').value;
    const topic = document.getElementById('addTopic').value;
    const idea = document.getElementById('addIdea').value;
    const sender = document.getElementById('addSender').value;
    const content = document.getElementById('addContent').value;

    if(!code || !content) return alert("برجاء ملء البيانات الأساسية");

    try {
        await db.collection("mails").add({
            code, topic, idea, sender, content,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        document.getElementById('adminPanel').style.display = 'none';
        document.querySelectorAll('#adminPanel input, #adminPanel textarea').forEach(i => i.value = "");
        alert("تمت الإضافة بنجاح! ✅");
    } catch (e) { alert("خطأ في الإضافة: " + e.message); }
}

// 4. وظائف الجدول والعرض
function renderTable() {
    const table = document.getElementById("table");
    document.querySelectorAll("tbody").forEach(el => el.remove());
    const tbodyParent = document.createElement("tbody");
    tbodyParent.id = "tableBody";

    allMails.forEach((m) => {
        let isFav = favorites.includes(m[0]);
        let starIcon = isFav ? "★" : "☆";

        let row = document.createElement("tr");
        row.innerHTML = `<td class="star" onclick="toggleFav(event,'${m[0]}')">${starIcon}</td><td>${m[0]}</td><td>${m[1]}</td><td>${m[2]}</td><td>${m[3]}</td>`;
        row.onclick = function(){ showMail(...m); selectRow(row); };

        let preview = document.createElement("tr");
        preview.className = "preview";
        preview.innerHTML = `<td colspan="5">📄 ${m[5].substring(0, 60)}...</td>`;
        preview.onclick = function(){ row.click(); };

        tbodyParent.appendChild(row); 
        tbodyParent.appendChild(preview);
    });
    table.appendChild(tbodyParent);
    updateVisibleRows();
}

function showMail(code, topic, idea, sender, use, content) {
    document.getElementById("mailBox").innerHTML = `<b>${sender}</b> | ${topic}<br><br>${content}`;
}

function selectRow(row) {
    document.querySelectorAll("tr").forEach(r => r.classList.remove("selected"));
    row.classList.add("selected");
}

function toggleFav(e, code) {
    e.stopPropagation();
    if (favorites.includes(code)) {
        favorites = favorites.filter(f => f !== code);
    } else {
        favorites.push(code);
    }
    localStorage.setItem('favMails', JSON.stringify(favorites));
    renderTable(); // تحديث النجوم
}

// 5. البحث والفلترة
function search(val) {
    const term = val.toLowerCase();
    document.querySelectorAll("#tableBody tr:not(.preview)").forEach(tr => {
        const match = tr.innerText.toLowerCase().includes(term);
        tr.style.display = match ? "" : "none";
        if(tr.nextElementSibling) tr.nextElementSibling.style.display = match ? "" : "none";
    });
}

function showFavorites() {
    document.querySelectorAll("#tableBody tr:not(.preview)").forEach(tr => {
        const code = tr.children[1].innerText;
        const match = favorites.includes(code);
        tr.style.display = match ? "" : "none";
        if(tr.nextElementSibling) tr.nextElementSibling.style.display = match ? "" : "none";
    });
}

function showAll() {
    document.querySelectorAll("#tableBody tr").forEach(tr => tr.style.display = "");
}

function copyMailContent() {
    let content = document.getElementById("mailBox").innerText;
    if (content.includes("اختار ميل")) return;
    let parts = content.split('\n\n');
    let textToCopy = parts.length > 1 ? parts[1] : content;
    navigator.clipboard.writeText(textToCopy.trim());
    let box = document.getElementById("mailBox");
    box.style.background = "#c8e6c9"; 
    setTimeout(() => box.style.background = "", 300);
}

function toggleDarkMode() {
    document.body.classList.toggle('dark-mode');
    localStorage.setItem('darkMode', document.body.classList.contains('dark-mode'));
}

// 6. الرادار (التشغيل اللحظي)
db.collection("mails").orderBy("createdAt", "desc").onSnapshot((snapshot) => {
    allMails = snapshot.docs.map(doc => {
        let d = doc.data();
        return [d.code, d.topic, d.idea, d.sender, "General", d.content];
    });
    renderTable();
    if(allMails.length > 0) highlightRow(0);
});

function updateVisibleRows() {
    visibleRows = Array.from(document.querySelectorAll("#tableBody tr:not(.preview)")).filter(tr => tr.style.display !== "none");
}

function highlightRow(index){
    if(visibleRows[index]) visibleRows[index].click();
}

function toggleWatermarkMenu() {
    const menu = document.querySelector('.watermark-menu');
    const btn = document.querySelector('.watermark-button');
    menu.classList.toggle('show');
    btn.classList.toggle('spin');
}

// تنفيذ الوضع الداكن لو محفوظ
if (localStorage.getItem('darkMode') === 'true') document.body.classList.add('dark-mode');
