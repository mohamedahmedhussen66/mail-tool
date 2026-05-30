// =====================================================================
// HDB Quality Assistant - Secure Google Apps Script Proxy
// =====================================================================
// هذا السكربت يعمل كوسيط آمن (Proxy) لتلقي الأسئلة من الشات بوت،
// ودمج مفتاح الـ API Key سرياً، وإرسالها لجوجل جيميني، ثم إعادة الرد للموظف.
//
// 🔒 الميزات:
// 1. أمان مطلق: الـ API Key محفوظ في حساب جوجل درايف الخاص بك ومخفي تماماً عن المتصفحات.
// 2. تخطي الفايروال: الطلبات تذهب لدومين google.com المسموح به دائماً في الشركات والبنوك.
// 3. مجاني 100%: بدون أي حدود استهلاك أو تكاليف ماليّة، وبدون الحاجة لفيزا.
// =====================================================================

// 1. 🔑 اكتب مفتاح الـ API الخاص بـ Gemini هنا بين القوسين:
const GEMINI_API_KEY = "أدخل_مفتاح_الـ_API_الخاص_بك_هنا";

/**
 * دالة استقبال طلبات الـ POST من الشات بوت
 */
function doPost(e) {
  try {
    // قراءة وتفصيص محتوى الطلب القادم من البوت
    const requestData = JSON.parse(e.postData.contents);
    
    const model = requestData.model || "gemini-2.5-flash";
    const action = requestData.action || "generateContent";
    const payload = requestData.payload || requestData;
    
    // بناء رابط جوجل جيميني الرسمي مع دمج مفتاح الـ API سرياً بالخلفية
    let targetUrl = "";
    if (action === "batchEmbedContents") {
      targetUrl = "https://generativelanguage.googleapis.com/v1beta/" + model + ":" + action + "?key=" + GEMINI_API_KEY;
    } else {
      targetUrl = "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":" + action + "?key=" + GEMINI_API_KEY;
    }
    
    // تجهيز خيارات الطلب الموجه لجوجل
    const fetchOptions = {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };
    
    // إرسال الطلب الفعلي لجوجل جيميني واستلام الرد
    const response = UrlFetchApp.fetch(targetUrl, fetchOptions);
    const responseBody = response.getContentText();
    const responseCode = response.getResponseCode();
    
    // إرجاع الإجابة للشات بوت في المتصفح مع دعم نظام الـ CORS تلقائياً
    return ContentService.createTextOutput(responseBody)
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    // معالجة الأخطاء وإرجاع رسالة خطأ واضحة
    const errorResponse = {
      error: {
        message: "Proxy Error: " + error.toString(),
        status: "INTERNAL_ERROR"
      }
    };
    return ContentService.createTextOutput(JSON.stringify(errorResponse))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
