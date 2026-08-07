// KIWI — content script
// این اسکریپت در هر صفحه نتایج جستجوی گوگل اجرا می‌شود، عبارات پیشنهادی
// («People also search for» و «جستجوهای مرتبط» پایین صفحه) را استخراج
// می‌کند و بدون تکرار در chrome.storage.local ذخیره می‌کند. اگر یک کلمه
// زیر چند سرچ مختلف تکرار شود، به‌جای رد شدن، شمارنده فراوانی‌اش بالا می‌رود.

(function () {
  const HEADING_PATTERNS = [
    "people also search for",
    "جستجوهای مرتبط",
    "related searches",
    "مردم همچنین جستجو می",
    "کاربران این مطالب را هم جستجو کرده",
  ];

  const NOISE = new Set([
    "feedback", "about featured snippets", "images", "videos", "news",
    "shopping", "maps", "books", "flights", "finance", "web", "more",
    "tools", "settings", "all", "sign in", "google apps",
  ]);

  function isNoise(text) {
    const t = text.trim();
    if (!t) return true;
    if (t.length < 2 || t.length > 80) return true;
    if (NOISE.has(t.toLowerCase())) return true;
    return false;
  }

  function textOf(el) {
    return (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
  }

  function queryFromHref(el) {
    const href = el.getAttribute && el.getAttribute("href");
    if (!href) return null;
    try {
      const url = new URL(href, window.location.origin);
      const q = url.searchParams.get("q");
      return q ? q.trim() : null;
    } catch (e) {
      return null;
    }
  }

  function isLeafLink(el) {
    return el.tagName === "A" && el.querySelector("a") === null;
  }

  function isSane(text) {
    if (isNoise(text)) return false;
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length > 7) return false;
    return true;
  }

  function extractFromLink(el, found) {
    if (!isLeafLink(el)) return;
    let text = queryFromHref(el);
    if (!text) text = textOf(el);
    if (text && isSane(text)) found.add(text);
  }

  // برای مسیر پرریسک (بالا رفتن از heading و پیدا کردن هر container با
  // ۳+ لینک)، فقط لینک‌هایی رو قبول کن که واقعاً به یه جستجوی گوگل با
  // q= اشاره می‌کنن. ویجت‌های بی‌ربط (محصولات مرتبط، پنل کسب‌وکار،
  // مواد غذایی و...) همچین لینکی ندارن، پس این فیلتر جلوی قاطی‌شدنشون
  // رو می‌گیره — این تنها نشونه قابل‌اعتماد برای «این واقعاً یه پیشنهاد
  // جستجوئه» است، نه صرفاً یه لینک دیگه توی صفحه
  function extractFromSearchLink(el, found) {
    if (!isLeafLink(el)) return;
    const text = queryFromHref(el);
    if (text && isSane(text)) found.add(text);
  }

  function collectByHeading() {
    const found = new Set();
    const candidates = document.querySelectorAll("div, h2, h3, span");
    for (const node of candidates) {
      const t = textOf(node).toLowerCase();
      if (!t || t.length > 60) continue;
      const matches = HEADING_PATTERNS.some((p) => t.includes(p));
      if (!matches) continue;

      let container =
        node.closest("[data-hveid]")?.parentElement || node.parentElement;
      if (!container) continue;

      for (let hops = 0; hops < 3 && container; hops++) {
        const links = container.querySelectorAll("a[href]");
        const leafLinks = [...links].filter(isLeafLink);
        if (leafLinks.length >= 3) {
          leafLinks.forEach((el) => extractFromSearchLink(el, found));
          break;
        }
        container = container.parentElement;
      }
    }
    return found;
  }

  function collectByKnownSelectors() {
    const found = new Set();
    const selectors = [
      ".y6Uyqe a",
      ".AJLUJb a, .AJLUJb",
      ".s75CSd a, .s75CSd",
      "#bres a",
      ".k8XOCe a",
      "div.MkXWc a",
    ];
    selectors.forEach((sel) => {
      document.querySelectorAll(sel).forEach((el) => {
        if (el.tagName === "A") {
          extractFromLink(el, found);
        } else if (el.querySelector(sel) === null) {
          const txt = textOf(el);
          if (isSane(txt)) found.add(txt);
        }
      });
    });
    return found;
  }

  function currentQuery() {
    try {
      const url = new URL(window.location.href);
      return url.searchParams.get("q") || "";
    } catch (e) {
      return "";
    }
  }

  function collectAll() {
    const a = collectByKnownSelectors();
    const b = collectByHeading();
    const merged = new Set([...a, ...b]);
    const q = currentQuery().trim();
    merged.delete(q);
    return [...merged];
  }

  // --- طبقه‌بندی intent بر اساس ۴ دسته استاندارد سئو ---
  const TRANSACTIONAL_WORDS = [
    "خرید", "سفارش", "فروش", "ثبت‌نام", "ثبت نام", "نصب",
  ];
  const COMMERCIAL_WORDS = [
    "بهترین", "مقایسه", "بررسی", "نقد و بررسی", "قیمت", "تعرفه", "هزینه",
    "ارزان", "تخفیف", "پکیج", "پلن", "کدام", "رتبه‌بندی", "پیشنهاد",
    "نظرات", "ریویو",
  ];
  const NAVIGATIONAL_WORDS = [
    "ورود", "لاگین", "login", "پنل", "sign in", "اپلیکیشن", "دانلود",
    "شاتل", "مخابرات", "همراه اول", "ایرانسل", "زرین‌پال", "زرین پال",
    "جوانتل", "تلینا", "نواتل", "آس‌تل", "بنیتاتل", "الوویپ",
  ];
  const INFORMATIONAL_WORDS = [
    "چیست", "چگونه", "آموزش", "راهنما", "تفاوت", "مزایا", "معرفی", "چطور",
  ];
  function classifyIntent(text) {
    const t = text.toLowerCase();
    if (NAVIGATIONAL_WORDS.some((w) => t.includes(w))) return "navigational";
    if (TRANSACTIONAL_WORDS.some((w) => t.includes(w))) return "transactional";
    if (COMMERCIAL_WORDS.some((w) => t.includes(w))) return "commercial";
    if (INFORMATIONAL_WORDS.some((w) => t.includes(w))) return "informational";
    return "other";
  }

  // کلمات جدید ذخیره می‌شن. اگر کلمه‌ای از قبل موجود بود (زیر یک seed دیگر
  // هم دیده شده)، به‌جای نادیده‌گرفتن، به لیست seed هاش (seenIn) اضافه
  // می‌شود تا شمارنده فراوانی درست بالا برود.
  function saveKeywords(keywords) {
    if (!keywords.length) return;
    const src = currentQuery();
    chrome.storage.local.get({ keywords: [] }, (data) => {
      const list = data.keywords;
      const byText = new Map(list.map((k) => [k.text, k]));
      const now = new Date().toISOString();
      let addedNew = 0;

      keywords.forEach((text) => {
        if (byText.has(text)) {
          const existing = byText.get(text);
          if (!existing.seenIn) {
            existing.seenIn = existing.source ? [existing.source] : [];
          }
          if (!existing.seenIn.includes(src)) {
            existing.seenIn.push(src);
            existing.lastSeenAt = now;
          }
        } else {
          byText.set(text, {
            text,
            source: src, // اولین seed‌ای که این کلمه زیرش دیده شد (برای گروه‌بندی)
            seenIn: [src], // همه seed هایی که این کلمه زیرشون دیده شده (برای فراوانی)
            addedAt: now,
            lastSeenAt: now,
            intent: classifyIntent(text),
            starred: false,
          });
          addedNew++;
        }
      });

      if (addedNew > 0 || list.some((k) => !k.seenIn)) {
        const updated = [...byText.values()];
        chrome.storage.local.set({ keywords: updated }, () => {
          chrome.runtime.sendMessage({
            type: "KEYWORDS_UPDATED",
            count: updated.length,
            added: addedNew,
          });
        });
      }
    });
  }

  function run() {
    chrome.storage.local.get({ collectionEnabled: true }, (data) => {
      if (!data.collectionEnabled) return; // اکستنشن خاموشه، کاری نکن
      const keywords = collectAll();
      saveKeywords(keywords);
    });
  }

  // --- تشخیص رتبه دامنه خودت توی نتایج ---
  // بین همه لینک‌های ارگانیک صفحه نتایج می‌گرده و همه لینک‌هایی که به
  // دامنه خودت اشاره می‌کنن رو پیدا می‌کنه (ممکنه چند صفحه از سایتت
  // هم‌زمان برای یه کلمه رتبه داشته باشن)
  function findOwnDomainUrls(domain) {
    if (!domain) return [];
    const cleanDomain = domain
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .replace(/\/.*$/, "")
      .toLowerCase();
    if (!cleanDomain) return [];

    const container =
      document.querySelector("#search") ||
      document.querySelector("#rso") ||
      document.body;
    const links = container.querySelectorAll("a[href^='http']");

    const found = [];
    const seen = new Set();
    for (const el of links) {
      try {
        const url = new URL(el.href);
        const host = url.hostname.replace(/^www\./, "").toLowerCase();
        if (host === cleanDomain || host.endsWith("." + cleanDomain)) {
          // فرگمنت (بعد از #) رو حذف کن — مخصوصاً لینک‌های "Jump to" گوگل
          // که با #:~:text=... به یه بخش خاص از همون صفحه اشاره می‌کنن؛
          // این‌ها همون صفحه‌ان، نه صفحه جدا، پس نباید تکراری حساب بشن
          const cleanUrl = url.origin + url.pathname + url.search;
          if (!seen.has(cleanUrl)) {
            seen.add(cleanUrl);
            found.push(cleanUrl);
          }
        }
      } catch (e) {
        // نادیده بگیر
      }
    }
    return found;
  }

  function checkOwnRank() {
    chrome.storage.local.get({ myDomain: "" }, (data) => {
      if (!data.myDomain) return; // دامنه‌ای تنظیم نشده
      const foundUrls = findOwnDomainUrls(data.myDomain);
      const keyword = currentQuery().trim();
      if (!keyword) return;
      chrome.runtime.sendMessage({
        type: "RANK_RESULT",
        keyword,
        urls: foundUrls,
      });
    });
  }

  setTimeout(run, 800);
  setTimeout(run, 2000);
  setTimeout(run, 4000);
  setTimeout(checkOwnRank, 1500);

  let debounce;
  const observer = new MutationObserver(() => {
    clearTimeout(debounce);
    debounce = setTimeout(run, 1200);
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();
