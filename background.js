const BADGE_GREEN = "#2e7d32";
const BADGE_GRAY = "#9e9e9e";

function setBadgeCount(count) {
  chrome.action.setBadgeText({ text: count ? String(count) : "" });
  chrome.action.setBadgeBackgroundColor({ color: BADGE_GREEN });
  if (chrome.action.setBadgeTextColor) {
    chrome.action.setBadgeTextColor({ color: "#ffffff" });
  }
}

function setBadgeOff() {
  chrome.action.setBadgeText({ text: "OFF" });
  chrome.action.setBadgeBackgroundColor({ color: BADGE_GRAY });
  if (chrome.action.setBadgeTextColor) {
    chrome.action.setBadgeTextColor({ color: "#ffffff" });
  }
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === "KEYWORDS_UPDATED") {
    chrome.storage.local.get({ collectionEnabled: true }, (data) => {
      if (data.collectionEnabled) setBadgeCount(msg.count);
    });
  }
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get({ keywords: [], collectionEnabled: true }, (data) => {
    if (!data.collectionEnabled) {
      setBadgeOff();
    } else if (data.keywords.length) {
      setBadgeCount(data.keywords.length);
    }
  });
});

// --- چک کردن رتبه دامنه خودت برای یه کلمه خاص ---
// یه تب پس‌زمینه به گوگل باز می‌کنیم (بدون این‌که فوکوس رو بگیره)، وقتی
// content.js نتیجه رو گزارش داد، ذخیره می‌کنیم و تب رو خودکار می‌بندیم
const pendingRankChecks = new Map(); // tabId -> keyword

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg && msg.type === "CHECK_RANK" && msg.keyword) {
    const url = `https://www.google.com/search?q=${encodeURIComponent(
      msg.keyword
    )}`;
    chrome.tabs.create({ url, active: false }, (tab) => {
      if (tab && tab.id != null) {
        pendingRankChecks.set(tab.id, msg.keyword);
        // اگه ۲۰ ثانیه طول کشید و جواب نیومد، تب رو ول نکن باز بمونه
        setTimeout(() => {
          if (pendingRankChecks.has(tab.id)) {
            pendingRankChecks.delete(tab.id);
            chrome.tabs.remove(tab.id).catch(() => {});
          }
        }, 20000);
      }
    });
  }

  if (msg && msg.type === "RANK_RESULT" && sender.tab) {
    chrome.storage.local.get({ keywords: [], groupMeta: {} }, (data) => {
      const rankUrls = Array.isArray(msg.urls) ? msg.urls : [];
      const rankCheckedAt = new Date().toISOString();

      const updatedKeywords = data.keywords.map((k) =>
        k.text === msg.keyword ? { ...k, rankUrls, rankCheckedAt } : k
      );

      // اگه این کلمه خودش عنوان یه گروه هم بود (seed اصلی)، اونجا هم آپدیت کن
      const updatedGroupMeta = { ...data.groupMeta };
      const existingGroup = updatedGroupMeta[msg.keyword] || {
        status: "idea",
        targetUrl: "",
      };
      updatedGroupMeta[msg.keyword] = {
        ...existingGroup,
        rankUrls,
        rankCheckedAt,
      };

      chrome.storage.local.set({
        keywords: updatedKeywords,
        groupMeta: updatedGroupMeta,
      });
    });

    // اگه این تب برای یه چک خودکار باز شده بود، ببندش
    if (pendingRankChecks.has(sender.tab.id)) {
      pendingRankChecks.delete(sender.tab.id);
      chrome.tabs.remove(sender.tab.id).catch(() => {});
    }
  }
});
