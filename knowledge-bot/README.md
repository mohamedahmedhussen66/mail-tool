# 🤖 دليل تشغيل الـ AI Knowledge Bot (قعدة قهوة بلدي)

يا هلا بالزميل العزيز! ☕ البوت ده معمول عشان يخدم الـ Agents (الموظفين) اللي شغالين على السيستم، ويخليهم يعرفوا يلاقوا أي إجابة في الملفات والـ PDF المعتمدة بسرعة البرق من غير ما يغلبوا نفسهم. 

تعال أقولك الفكرة مبنية إزاي وإزاي تتحكم في الليلة دي كلها كأنك قاعد بتطلب حجر معسل على القهوة.

---

## 📁 خريطة المكان (أنت فين دلوقتي؟)

الميزة دي معزولة بالكامل جوة فولدر `knowledge-bot/` عشان متلخبطش البروجكت الأساسي، وجواه الملفات دي:
* `bot-config.js`: لوحة التحكم والمفاتيح.. زي الفيوزات الكهربائية لو قفلتها تقفل البوت كله.
* `bot-engine.js`: موتور البوت الحقيقي.. هو اللي بيدور في الداتا بذكاء وبيروح يسأل جوجل جميناي ويرجع بالإجابة.
* `admin-tab.js` و `admin-tab.css`: اللوحة اللي بتظهر للـ Admins عشان يرفعوا منها الملفات (PDF, Excel) وتتحول لحتت داتا صغيرة.
* `chat-panel.js` و `chat-panel.css`: شاشة الشات اللذيذة العائمة اللي بتظهر للـ Agent عشان يدردش ويسأل براحته.

---

## ⚙️ مفاتيح لوحة التحكم والفيوزات (`bot-config.js`)

لو فتحت ملف `bot-config.js` هتلاقي الإعدادات البسيطة دي:
```javascript
const KNOWLEDGE_BOT_CONFIG = {
    ENABLED: true,                 // لو خليتها false.. البوت هيختفي كأنه ما جاش ومحدش هيحس بحاجة خالص!
    AI_API_KEY: "AIzaSy...",       // مفتاح الخزنة (الـ API Key) بتاع جوجل جميناي اللي بيشغل الذكاء الاصطناعي
    AI_MODEL: "gemini-1.5-flash",  // نوع الموديل.. جميناي السريع والاقتصادي (ببلاش في النسخة التجريبية)
    MAX_CHUNKS: 5,                 // أقصى عدد من حتت الورق اللي بنبعتها لجميناي عشان يجاوب منها في المرة الواحدة
    MIN_SIMILARITY: 0.35,          // مقياس الشبه.. عشان يفلتر الكلام البعيد خالص عن سؤال الموظف
    FALLBACK_MESSAGE: "مش لاقي إجابة مؤكدة في المصادر المتاحة عندي عن السؤال ده." // الرد الدبلوماسي لما نسأل البوت في حاجة مش موجودة في الورق
};
```

---

## 🔥 الجداول الجديدة في الداتابيز (Firestore)

احنا معملناش أي زحمة في جداولك القديمة.. عملنا 3 جداول جديدة مستقلين بذاتهم خالص:
1. `knowledge_bot_sources`: ده بنسجل فيه البيانات الأساسية لأي ملف الأدمن بيرفعه (اسمه، حالته، ارفع إمتى ومين اللي رفعه).
2. `knowledge_bot_chunks`: هنا بقى الورق بجد.. النص المستخرج من الـ PDF أو الـ Excel متقطع لحتت صغيرة مع رقم الصفحة أو رقم السطر عشان البوت يدور فيه طلقة.
3. `knowledge_bot_logs`: دفتر التسجيل.. أي موظف بيسأل البوت، بنسجل سؤاله وإجابته، وهل البوت لقي إجابة ولا لأ، والتوكنز التقريبية اللي استهلكها عشان الأدمن يراقب الدنيا.

---

## 🔌 إزاي تشيل الميزة دي خالص وتلغيها من البروجكت؟

لو في أي يوم حبيت تشيل البوت ده خالص وكأنه مكنش موجود.. الموضوع سهل جداً ومن غير ما يسبب أي إيرور للبروجكت:

1. **امسح فولدر** `knowledge-bot/` بالكامل.
2. **في صفحة الموظف الأساسية** (`index.html`)، امسح السطور دي من جوا الـ `<head>`:
   ```html
   <!-- AI Knowledge Bot Module -->
   <link rel="stylesheet" href="knowledge-bot/chat-panel.css">
   <script src="knowledge-bot/bot-config.js"></script>
   <script src="knowledge-bot/bot-engine.js"></script>
   <script src="knowledge-bot/chat-panel.js"></script>
   ```
3. **في صفحة الأدمن** (`admin-dashboard/index.html`)، امسح السطور دي من الـ `<head>`:
   ```html
   <!-- AI Knowledge Bot Module -->
   <link rel="stylesheet" href="../knowledge-bot/admin-tab.css">
   <script src="https://cdn.jsdelivr.net/npm/fuse.js@6.6.2"></script>
   <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.min.js"></script>
   <script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>
   <script src="../knowledge-bot/bot-config.js"></script>
   <script src="../knowledge-bot/bot-engine.js"></script>
   <script src="../knowledge-bot/admin-tab.js"></script>
   ```
   وامسح القسم (Section) ده كمان:
   ```html
   <!-- 8. KNOWLEDGE BOT section -->
   <section id="view-bot" class="view-section" style="display:none;">
   </section>
   ```

وبس كدة يا ريس! هتلاقي السيستم رجع زي ما كان بالظبط ولا الهوا.. شغل معزول ونضيف! 🤝
