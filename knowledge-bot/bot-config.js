// إعدادات HDB Quality Assistant Bot
const KNOWLEDGE_BOT_CONFIG = {
    ENABLED: true,
    AI_API_KEY: "AIzaSyA8snztuPZSor-Nbvf6OxhA4f6oVd6obQA",
    AI_PROXY_URL: "",
    // gemini-2.5-flash ✅ مؤكد شغال مع هذا الـ API Key
    AI_MODEL: "gemini-2.5-flash",
    ENABLE_VECTOR_SEARCH: true,
    EMBEDDING_MODEL: "text-embedding-004",
    MAX_CHUNKS: 10,                         // زدنا للإجابات الأكثر غنىً بالمعلومات
    MIN_SIMILARITY: 0.30,                   // خففنا الحد لاسترجاع أكثر من مصادر Excel
    VECTOR_MIN_SIMILARITY: 0.62,
    VECTOR_WEIGHT: 0.62,
    LEXICAL_WEIGHT: 0.38,
    EMBEDDING_BATCH_SIZE: 12,
    SEMANTIC_SELECTOR_MAX_CHUNKS: 120,      // نرى المزيد من قاعدة المعرفة عند الاختيار الذكي
    SEMANTIC_SELECTOR_PREVIEW_CHARS: 400,   // معاينة أطول لاختيار أفضل
    FALLBACK_MESSAGE: "مش لاقي إجابة مؤكدة في المصادر المتاحة عندي عن السؤال ده.",

    // ─── إعدادات الذكاء ومعالجة اللغات المضافة 🚀 ───
    HISTORY_TURNS_LIMIT: 5,                  // عدد الحركات السابقة المحفوظة في سياق الشات
    PARENT_CHILD_ENABLED: true,             // تفعيل التقطيع الهرمي المزدوج
    RERANK_ENABLED: true,                   // تفعيل فرز وإعادة ترتيب المراجع المسترجعة
    PII_MASKING_ENABLED: true,              // تفعيل حماية البيانات الحساسة للعملاء
    LOW_CONFIDENCE_THRESHOLD: 0.45,         // حد المطابقة الضعيف لإشعار الموظف بالتأكيد

    // قاموس مصطلحات واختصارات HDB المعتمدة
    GLOSSARY_HDB: {
        "cif": "رقم تعريف العميل (Customer Information File)",
        "kyc": "نموذج اعرف عميلك (Know Your Customer)",
        "iban": "رقم الحساب المصرفي الدولي (International Bank Account Number)",
        "car loan": "قرض تمويل السيارات",
        "pl": "القرض الشخصي (Personal Loan)",
        "cc": "بطاقة الائتمان (Credit Card)",
        "atm": "ماكينة الصراف الآلي",
        "otp": "كلمة المرور لمرة واحدة (One-Time Password)",
        "swift": "كود التحويل الدولي للسويفت",
        "murabaha": "تمويل المرابحة الإسلامي"
    },

    // قاموس تحويل الكلمات الدارجة والعامية المصرية لمرادفات رسمية
    COLLOQUIAL_MAP: {
        "فيزا": "بطاقة ائتمان / بطاقة خصم مباشر",
        "مشتريات": "بطاقة ائتمان",
        "فايدة": "سعر عائد / فائدة",
        "فوايد": "عوائد / فوائد",
        "فلوس": "مبالغ مالية / رصيد",
        "حسابي": "رقم حساب العميل",
        "قرض": "تمويل شخصي / قرض",
        "سحب": "عملية سحب نقدي",
        "شحن": "عملية إيداع / شحن كارت",
        "بلوك": "إيقاف / حظر البطاقة",
        "المرتب": "تحويل الراتب الشهري"
    },

    // تعبيرات RegExp لتصفية وحجب بيانات العملاء الحساسة
    PII_MASK_PATTERNS: [
        { name: "National ID", regex: /\b[23]\d{13}\b/g, mask: "[National ID Hidden]" },
        { name: "Credit Card", regex: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, mask: "[Credit Card Number Hidden]" },
        { name: "Phone Number", regex: /\b(010|011|012|015)\d{8}\b/g, mask: "[Phone Number Hidden]" },
        { name: "Account Number", regex: /\b\d{10,14}\b/g, mask: "[Account Number Hidden]" }
    ],

    // إعدادات تحليل الإكسيل المتقدمة
    EXCEL_CONFIG: {
        ROW_BY_ROW: true,                    // تقطيع سطر بسطر
        MULTI_SHEET_SUPPORT: true,           // قراءة كافة الشيتات
        NEIGHBORING_CONTEXT: true,           // استرجاع السطر السابق والتالي
        INGEST_JSON: true,                   // تحويل لـ JSON مهيكل
        PARSE_HIERARCHICAL_HEADERS: true,    // تحليل العناوين المتعددة المستويات
        ROW_NARRATOR_ENABLED: true           // تحويل الصف لجمل سردية لغوية
    }
};
