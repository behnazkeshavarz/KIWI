const groupsEl = document.getElementById("groups");
const countEl = document.getElementById("count");
const emptyEl = document.getElementById("empty");
const filterEl = document.getElementById("filter");
const chipsEl = document.getElementById("intentChips");
const starredOnlyBtn = document.getElementById("starredOnly");
const toggleBtn = document.getElementById("toggleBtn");
const pausedBanner = document.getElementById("pausedBanner");
const domainBtn = document.getElementById("domainBtn");
const domainPanel = document.getElementById("domainPanel");
const domainInput = document.getElementById("domainInput");
const domainSaveBtn = document.getElementById("domainSaveBtn");

let myDomain = "";

let allKeywords = [];
let activeIntent = "all";
let starredOnly = false;
// کدوم گروه‌ها الان باز هستن — مستقل از رندر نگه‌داشته می‌شه تا با هر
// تغییر (ستاره زدن، حذف و...) گروه‌ها بسته نشن
const openGroups = new Set();
let firstRenderDone = false;
// کدوم ردیف‌های کلمه، پنل «برنامه محتوا» (Status/Target URL) بازشونه
const expandedRows = new Set();

const STATUS_META = {
  idea: { label: "Idea", icon: "\ud83d\udca1" },
  in_progress: { label: "In Progress", icon: "\u270d\ufe0f" },
  published: { label: "Published", icon: "\u2705" },
};

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

const INTENT_LABEL = {
  transactional: "Transactional",
  commercial: "Commercial",
  navigational: "Navigational",
  informational: "Informational",
  other: "Other",
};

function isCorrupted(text) {
  const words = text.split(/\s+/).filter(Boolean);
  return words.length > 7;
}

function trendsUrl(text) {
  return `https://trends.google.com/trends/explore?geo=IR&q=${encodeURIComponent(
    text
  )}`;
}

function buildGroups(keywords) {
  const map = new Map();
  keywords.forEach((k) => {
    const src = k.source || "Unknown";
    if (!map.has(src)) map.set(src, []);
    map.get(src).push(k);
  });
  return [...map.entries()].sort((a, b) => {
    const lastA = a[1][a[1].length - 1]?.addedAt || "";
    const lastB = b[1][b[1].length - 1]?.addedAt || "";
    return lastB.localeCompare(lastA);
  });
}

function render(keywords) {
  groupsEl.innerHTML = "";
  if (!keywords.length) {
    emptyEl.style.display = "block";
    groupsEl.style.display = "none";
    return;
  }
  emptyEl.style.display = "none";
  groupsEl.style.display = "block";

  const groups = buildGroups(keywords);

  // اولین بار که رندر می‌شه، فقط جدیدترین گروه رو پیش‌فرض باز کن
  if (!firstRenderDone && groups.length) {
    openGroups.add(groups[0][0]);
    firstRenderDone = true;
  }

  groups.forEach(([source, items]) => {
    const details = document.createElement("details");
    details.className = "group";
    details.open = openGroups.has(source);
    details.addEventListener("toggle", () => {
      if (details.open) openGroups.add(source);
      else openGroups.delete(source);
    });

    const summary = document.createElement("summary");
    const left = document.createElement("span");
    left.className = "group-label";
    left.innerHTML = `<span class="arrow">▸</span> <bdi>${source}</bdi>`;

    const right = document.createElement("span");
    right.className = "group-right";

    const groupKey = "group::" + source;
    const totalFreq = items.reduce(
      (sum, k) => sum + (k.seenIn || [k.source]).filter(Boolean).length,
      0
    );

    if (totalFreq > items.length) {
      const groupFreq = document.createElement("span");
      groupFreq.className = "freq-badge";
      groupFreq.textContent = `\u00d7${totalFreq}`;
      groupFreq.title = `This topic's keywords were seen ${totalFreq} times in total across searches`;
      right.appendChild(groupFreq);
    }

    const groupPlan = document.createElement("span");
    groupPlan.className =
      "plan-toggle group-plan" + (expandedRows.has(groupKey) ? " active" : "");
    groupPlan.textContent = "\ud83c\udfaf";
    groupPlan.title = "Plan: set a status and target page for this topic";
    groupPlan.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (expandedRows.has(groupKey)) expandedRows.delete(groupKey);
      else expandedRows.add(groupKey);
      applyFilter();
    });

    const allStarred = items.every((k) => k.starred);
    const groupStar = document.createElement("span");
    groupStar.className = "star group-star" + (allStarred ? " active" : "");
    groupStar.textContent = allStarred ? "\u2605" : "\u2606";
    groupStar.title = allStarred
      ? "Unstar all in this group"
      : "Star all in this group";
    groupStar.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleStarGroup(source, !allStarred);
    });

    const groupTrends = document.createElement("button");
    groupTrends.type = "button";
    groupTrends.className = "trends-link group-trends";
    groupTrends.textContent = "\ud83d\udcc8";
    groupTrends.title = "Check this topic on Google Trends (opens in background)";
    groupTrends.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (chrome.tabs && chrome.tabs.create) {
        chrome.tabs.create({ url: trendsUrl(source), active: false });
      } else {
        window.open(trendsUrl(source), "_blank");
      }
    });

    const groupDel = document.createElement("span");
    groupDel.className = "del group-del";
    groupDel.textContent = "\u2715";
    groupDel.title = "Delete all keywords in this group";
    groupDel.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (
        confirm(
          `Delete all ${items.length} keywords in "${source}"?`
        )
      ) {
        removeGroup(source);
      }
    });

    const count = document.createElement("span");
    count.className = "group-count";
    count.textContent = `${items.length}`;

    right.appendChild(groupPlan);
    right.appendChild(groupStar);
    right.appendChild(groupTrends);
    right.appendChild(groupDel);
    right.appendChild(count);

    summary.appendChild(left);
    summary.appendChild(right);
    details.appendChild(summary);

    if (expandedRows.has(groupKey)) {
      const meta = getGroupMeta(source);
      const panel = buildDetailPanel(
        meta,
        (field, value) => setGroupField(source, field, value),
        source
      );
      panel.classList.add("group-detail");
      details.appendChild(panel);
    }

    const ul = document.createElement("ul");
    ul.className = "kw-list";
    const sorted = [...items].sort((a, b) => {
      if (!!b.starred !== !!a.starred) return b.starred ? 1 : -1;
      const fa = (a.seenIn || [a.source]).length;
      const fb = (b.seenIn || [b.source]).length;
      return fb - fa;
    });

    sorted.forEach((kw) => {
      const li = document.createElement("li");
      const freq = (kw.seenIn || [kw.source]).filter(Boolean).length;
      const status = kw.status || "idea";

      const row = document.createElement("div");
      row.className = "kw-row";

      const textWrap = document.createElement("span");
      textWrap.className = "kw-text";

      const dot = document.createElement("span");
      dot.className = "dot " + (kw.intent || "other");
      dot.title = INTENT_LABEL[kw.intent || "other"];

      const span = document.createElement("span");
      span.setAttribute("dir", "auto");
      span.textContent = kw.text;

      textWrap.appendChild(dot);
      textWrap.appendChild(span);

      if (freq > 1) {
        const freqBadge = document.createElement("span");
        freqBadge.className = "freq-badge";
        freqBadge.textContent = `\u00d7${freq}`;
        freqBadge.title = `Seen under ${freq} different searches:\n${(
          kw.seenIn || []
        ).join(", ")}`;
        textWrap.appendChild(freqBadge);
      }

      // فقط وقتی وضعیت غیر از پیش‌فرض (Idea) بود نشونش بده، تا حالت
      // عادی لیست شلوغ نشه
      if (status !== "idea") {
        const statusGlance = document.createElement("span");
        statusGlance.className = "status-glance";
        statusGlance.textContent = STATUS_META[status].icon;
        statusGlance.title = STATUS_META[status].label;
        textWrap.appendChild(statusGlance);
      }

      // اگه قبلاً چک شده و دامنه‌ت پیدا شده، یه نشونه سریع بده
      const rankUrls = kw.rankUrls || (kw.rankUrl ? [kw.rankUrl] : []);
      if (rankUrls.length) {
        const rankGlance = document.createElement("span");
        rankGlance.className = "status-glance";
        rankGlance.textContent = "\ud83c\udfc6";
        rankGlance.title =
          rankUrls.length > 1
            ? `You rank with ${rankUrls.length} pages:\n${rankUrls.join("\n")}`
            : `You rank for this: ${rankUrls[0]}`;
        textWrap.appendChild(rankGlance);
      }

      const actions = document.createElement("span");
      actions.className = "actions";

      const plan = document.createElement("span");
      plan.className =
        "plan-toggle" + (expandedRows.has(kw.text) ? " active" : "");
      plan.textContent = "\ud83c\udfaf";
      plan.title = "Plan: set a status and target page for this keyword";
      plan.addEventListener("click", () => {
        if (expandedRows.has(kw.text)) expandedRows.delete(kw.text);
        else expandedRows.add(kw.text);
        applyFilter();
      });

      const star = document.createElement("span");
      star.className = "star" + (kw.starred ? " active" : "");
      star.textContent = kw.starred ? "\u2605" : "\u2606";
      star.title = kw.starred ? "Unstar" : "Star as important";
      star.addEventListener("click", () => toggleStar(kw.text));

      const trends = document.createElement("button");
      trends.type = "button";
      trends.className = "trends-link";
      trends.textContent = "\ud83d\udcc8";
      trends.title = "Check relative popularity on Google Trends (opens in background)";
      trends.addEventListener("click", () => {
        if (chrome.tabs && chrome.tabs.create) {
          chrome.tabs.create({ url: trendsUrl(kw.text), active: false });
        } else {
          window.open(trendsUrl(kw.text), "_blank");
        }
      });

      const del = document.createElement("span");
      del.textContent = "\u2715";
      del.className = "del";
      del.title = "Delete";
      del.addEventListener("click", () => removeKeyword(kw.text));

      actions.appendChild(plan);
      actions.appendChild(star);
      actions.appendChild(trends);
      actions.appendChild(del);

      row.appendChild(textWrap);
      row.appendChild(actions);
      li.appendChild(row);

      if (expandedRows.has(kw.text)) {
        li.appendChild(
          buildDetailPanel(
            kw,
            (field, value) => setKeywordField(kw.text, field, value),
            kw.text
          )
        );
      }

      ul.appendChild(li);
    });
    details.appendChild(ul);
    groupsEl.appendChild(details);
  });
}

function timeAgo(iso) {
  if (!iso) return "";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function buildDetailPanel(entity, onSetField, checkKeyword) {
  const panel = document.createElement("div");
  panel.className = "kw-detail";

  const heading = document.createElement("div");
  heading.className = "kw-detail-heading";
  const headingText = document.createElement("span");
  headingText.textContent = "Content plan";
  const info = document.createElement("span");
  info.className = "info-icon";
  info.textContent = "\u2139";
  info.title =
    "Track where this keyword/topic is in your content pipeline and which page it's meant for — helps avoid writing the same topic twice.";
  heading.appendChild(headingText);
  heading.appendChild(info);
  panel.appendChild(heading);

  const pills = document.createElement("div");
  pills.className = "status-pills";
  Object.entries(STATUS_META).forEach(([key, meta]) => {
    const pill = document.createElement("button");
    pill.type = "button";
    pill.className =
      "status-pill" + ((entity.status || "idea") === key ? " active" : "");
    pill.textContent = `${meta.icon} ${meta.label}`;
    pill.addEventListener("click", () => onSetField("status", key));
    pills.appendChild(pill);
  });
  panel.appendChild(pills);

  // --- چک خودکار رتبه: آیا دامنه خودت برای این کلمه توی نتایج هست؟ ---
  const rankRow = document.createElement("div");
  rankRow.className = "rank-row";

  const checkBtn = document.createElement("button");
  checkBtn.type = "button";
  checkBtn.className = "rank-check-btn";
  checkBtn.textContent = "\ud83d\udd0d Check ranking";
  checkBtn.addEventListener("click", () => {
    if (!myDomain) {
      rankStatus.textContent = "Set your domain first (\ud83c\udf10 button, top right)";
      rankStatus.className = "rank-status rank-warn";
      return;
    }
    checkBtn.disabled = true;
    checkBtn.textContent = "Checking\u2026";
    rankStatus.textContent = "Opening a background tab to check\u2026";
    rankStatus.className = "rank-status";
    chrome.runtime.sendMessage({ type: "CHECK_RANK", keyword: checkKeyword });
  });

  const rankStatus = document.createElement("div");
  rankStatus.className = "rank-status";
  const rankUrls =
    entity.rankUrls || (entity.rankUrl ? [entity.rankUrl] : []);
  if (!entity.rankCheckedAt) {
    rankStatus.textContent = "Not checked yet";
  } else if (rankUrls.length) {
    rankStatus.innerHTML = "";
    const ok = document.createElement("span");
    ok.textContent = `\u2705 Found ${rankUrls.length > 1 ? rankUrls.length + " pages" : ""} \u2014 ${timeAgo(
      entity.rankCheckedAt
    )}`;
    rankStatus.appendChild(ok);
    rankUrls.forEach((u) => {
      const linkWrap = document.createElement("div");
      const link = document.createElement("a");
      link.href = u;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = u;
      link.className = "rank-link";
      linkWrap.appendChild(link);
      rankStatus.appendChild(linkWrap);
    });
  } else {
    rankStatus.textContent = `\u274c Not found in top results \u2014 ${timeAgo(
      entity.rankCheckedAt
    )}`;
  }

  rankRow.appendChild(checkBtn);
  rankRow.appendChild(rankStatus);
  panel.appendChild(rankRow);

  const urlRow = document.createElement("div");
  urlRow.className = "url-row";
  const urlInput = document.createElement("input");
  urlInput.type = "text";
  urlInput.className = "url-input";
  urlInput.placeholder = "Target page URL (optional, or filled by Check)";
  urlInput.value = entity.targetUrl || "";
  urlInput.addEventListener("change", () => {
    onSetField("targetUrl", urlInput.value.trim());
  });
  urlRow.appendChild(urlInput);
  panel.appendChild(urlRow);

  return panel;
}

function setKeywordField(text, field, value) {
  const updated = allKeywords.map((k) =>
    k.text === text ? { ...k, [field]: value } : k
  );
  chrome.storage.local.set({ keywords: updated }, () => {
    allKeywords = updated;
    applyFilter();
  });
}

// --- متادیتای سطح گروه (Plan/Target URL برای خودِ کلمه اصلی seed) ---
// چون خودِ عنوان گروه هم یه seed واقعیه که ممکنه بخوای روش محتوا بسازی،
// جدا از آرایه keywords، توی یه ساختار مستقل ذخیره می‌شه
let groupMeta = {};

function getGroupMeta(source) {
  return groupMeta[source] || { status: "idea", targetUrl: "" };
}

function setGroupField(source, field, value) {
  const current = getGroupMeta(source);
  groupMeta = { ...groupMeta, [source]: { ...current, [field]: value } };
  chrome.storage.local.set({ groupMeta }, () => {
    applyFilter();
  });
}

let suppressChangeListener = false;

// فرگمنت (بعد از #) رو از URLها حذف و تکراری‌ها رو یکی می‌کنه — برای
// پاک‌سازی داده‌های قدیمی که قبل از این فیکس ذخیره شده بودن
function normalizeUrls(urls) {
  if (!urls || !urls.length) return urls || [];
  const seen = new Set();
  const out = [];
  urls.forEach((u) => {
    try {
      const url = new URL(u);
      const clean = url.origin + url.pathname + url.search;
      if (!seen.has(clean)) {
        seen.add(clean);
        out.push(clean);
      }
    } catch (e) {
      if (!seen.has(u)) {
        seen.add(u);
        out.push(u);
      }
    }
  });
  return out;
}

function refresh() {
  chrome.storage.local.get({ keywords: [], groupMeta: {} }, (data) => {
    const cleaned = data.keywords
      .filter((k) => !isCorrupted(k.text))
      .map((k) => ({
        ...k,
        intent: classifyIntent(k.text),
        seenIn: k.seenIn || (k.source ? [k.source] : []),
        starred: !!k.starred,
        rankUrls: normalizeUrls(
          k.rankUrls || (k.rankUrl ? [k.rankUrl] : [])
        ),
      }));

    const cleanedGroupMeta = {};
    Object.entries(data.groupMeta || {}).forEach(([src, meta]) => {
      cleanedGroupMeta[src] = {
        ...meta,
        rankUrls: normalizeUrls(
          meta.rankUrls || (meta.rankUrl ? [meta.rankUrl] : [])
        ),
      };
    });
    groupMeta = cleanedGroupMeta;

    suppressChangeListener = true;
    chrome.storage.local.set(
      { keywords: cleaned, groupMeta: cleanedGroupMeta },
      () => {
        chrome.action.setBadgeText({
          text: cleaned.length ? String(cleaned.length) : "",
        });
        // یه تیک بعد پرچم رو پاک کن تا مطمئن بشیم رویداد onChanged همین
        // نوشتن، قبل از پاک شدنش رد شده (و نادیده گرفته شده)
        setTimeout(() => {
          suppressChangeListener = false;
        }, 50);
      }
    );

    allKeywords = cleaned;
    countEl.textContent = allKeywords.length;
    applyFilter();
  });
}

function applyFilter() {
  const q = filterEl.value.trim().toLowerCase();
  let filtered = allKeywords;
  if (activeIntent !== "all") {
    filtered = filtered.filter((k) => (k.intent || "other") === activeIntent);
  }
  if (starredOnly) {
    filtered = filtered.filter((k) => k.starred);
  }
  if (q) {
    filtered = filtered.filter((k) => k.text.toLowerCase().includes(q));
  }
  render(filtered);
}

function toggleStar(text) {
  const updated = allKeywords.map((k) =>
    k.text === text ? { ...k, starred: !k.starred } : k
  );
  chrome.storage.local.set({ keywords: updated }, () => {
    allKeywords = updated;
    applyFilter();
  });
}

function toggleStarGroup(source, starValue) {
  const updated = allKeywords.map((k) =>
    (k.source || "Unknown") === source ? { ...k, starred: starValue } : k
  );
  chrome.storage.local.set({ keywords: updated }, () => {
    allKeywords = updated;
    applyFilter();
  });
}

function removeGroup(source) {
  const updated = allKeywords.filter(
    (k) => (k.source || "Unknown") !== source
  );
  openGroups.delete(source);
  chrome.storage.local.set({ keywords: updated }, () => {
    chrome.action.setBadgeText({
      text: updated.length ? String(updated.length) : "",
    });
    refresh();
  });
}

function removeKeyword(text) {
  const updated = allKeywords.filter((k) => k.text !== text);
  chrome.storage.local.set({ keywords: updated }, () => {
    chrome.action.setBadgeText({
      text: updated.length ? String(updated.length) : "",
    });
    refresh();
  });
}

function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  chrome.downloads
    ? chrome.downloads.download({ url, filename })
    : (() => {
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
      })();
}

chipsEl.addEventListener("click", (e) => {
  const btn = e.target.closest(".chip");
  if (!btn) return;
  [...chipsEl.querySelectorAll(".chip")].forEach((c) =>
    c.classList.remove("active")
  );
  btn.classList.add("active");
  activeIntent = btn.dataset.intent;
  applyFilter();
});

starredOnlyBtn.addEventListener("click", () => {
  starredOnly = !starredOnly;
  starredOnlyBtn.classList.toggle("active", starredOnly);
  starredOnlyBtn.textContent = starredOnly ? "\u2605 Starred only" : "\u2606 Starred only";
  applyFilter();
});

document.getElementById("copyBtn").addEventListener("click", () => {
  const text = allKeywords.map((k) => k.text).join("\n");
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById("copyBtn");
    const original = btn.textContent;
    btn.textContent = "Copied \u2713";
    setTimeout(() => (btn.textContent = original), 1200);
  });
});

document.getElementById("exportTxt").addEventListener("click", () => {
  const text = allKeywords.map((k) => k.text).join("\n");
  const BOM = "\uFEFF";
  downloadFile("keywords.txt", BOM + text, "text/plain;charset=utf-8");
});

function csvEscape(value) {
  return `"${String(value == null ? "" : value).replace(/"/g, '""')}"`;
}

document.getElementById("exportCsv").addEventListener("click", () => {
  const header = [
    "row_type",
    "keyword",
    "intent",
    "frequency",
    "seen_in",
    "starred",
    "status",
    "target_url",
    "my_rank_urls",
    "my_rank_checked_at",
    "topic",
    "source_query",
    "added_at",
    "last_seen_at",
  ].join(",") + "\n";

  // --- ردیف‌های خودِ کلمات ---
  // دیتای رتبه/وضعیت گروه دیگه اینجا تکرار نمی‌شه (چون گمراه‌کننده بود:
  // انگار هر کلمه جدا اون رتبه رو داشت). این‌ها فقط دیتای خودِ همون کلمه‌ان.
  const keywordRows = allKeywords.map((k) => {
    const seenIn = k.seenIn || (k.source ? [k.source] : []);
    const freq = seenIn.filter(Boolean).length;
    const statusLabel = STATUS_META[k.status || "idea"].label;
    const myRankUrls = k.rankUrls || (k.rankUrl ? [k.rankUrl] : []);

    return [
      csvEscape("keyword"),
      csvEscape(k.text),
      csvEscape(INTENT_LABEL[k.intent || "other"]),
      csvEscape(freq),
      csvEscape(seenIn.join("\n")),
      csvEscape(k.starred ? "yes" : "no"),
      csvEscape(statusLabel),
      csvEscape(k.targetUrl || ""),
      csvEscape(myRankUrls.join("\n")),
      csvEscape(k.rankCheckedAt || ""),
      csvEscape(k.source || ""),
      csvEscape(k.source || ""),
      csvEscape(k.addedAt || ""),
      csvEscape(k.lastSeenAt || ""),
    ].join(",");
  });

  // --- ردیف‌های خودِ دسته‌بندی اصلی (topic/seed) ---
  // چون خودِ عنوان دسته هم یه کلمه واقعیه که وضعیت/رتبه جدا داره، حالا
  // یه ردیف مستقل با row_type=topic براش می‌سازیم تا گم نشه
  const topics = [...new Set(allKeywords.map((k) => k.source || "Unknown"))];
  const topicRows = topics.map((topic) => {
    const meta = getGroupMeta(topic);
    const statusLabel = STATUS_META[meta.status || "idea"].label;
    const rankUrls = meta.rankUrls || (meta.rankUrl ? [meta.rankUrl] : []);
    const children = allKeywords.filter((k) => (k.source || "Unknown") === topic);
    const allStarred = children.length > 0 && children.every((k) => k.starred);

    return [
      csvEscape("topic"),
      csvEscape(topic),
      csvEscape(classifyIntent(topic)),
      csvEscape(children.length),
      csvEscape(""),
      csvEscape(allStarred ? "yes" : "no"),
      csvEscape(statusLabel),
      csvEscape(meta.targetUrl || ""),
      csvEscape(rankUrls.join("\n")),
      csvEscape(meta.rankCheckedAt || ""),
      csvEscape(""),
      csvEscape(""),
      csvEscape(""),
      csvEscape(""),
    ].join(",");
  });

  const rows = [...topicRows, ...keywordRows].join("\n");
  const BOM = "\uFEFF";
  downloadFile("keywords.csv", BOM + header + rows, "text/csv;charset=utf-8");
});

document.getElementById("clearBtn").addEventListener("click", () => {
  if (!confirm("Are you sure you want to clear the entire list?")) return;
  chrome.storage.local.set({ keywords: [] }, () => {
    chrome.action.setBadgeText({ text: "" });
    refresh();
  });
});

filterEl.addEventListener("input", applyFilter);

// --- روشن/خاموش کردن جمع‌آوری ---
function applyToggleUI(enabled) {
  toggleBtn.textContent = enabled ? "\u23f8" : "\u25b6";
  toggleBtn.title = enabled ? "Pause collecting" : "Resume collecting";
  toggleBtn.classList.toggle("paused", !enabled);
  pausedBanner.classList.toggle("show", !enabled);
}

function setBadge(enabled, count) {
  if (!chrome.action) return;
  if (enabled) {
    chrome.action.setBadgeText({ text: count ? String(count) : "" });
    chrome.action.setBadgeBackgroundColor({ color: "#2e7d32" });
  } else {
    chrome.action.setBadgeText({ text: "OFF" });
    chrome.action.setBadgeBackgroundColor({ color: "#9e9e9e" });
  }
  if (chrome.action.setBadgeTextColor) {
    chrome.action.setBadgeTextColor({ color: "#ffffff" });
  }
}

chrome.storage.local.get({ collectionEnabled: true }, (data) => {
  applyToggleUI(data.collectionEnabled);
});

toggleBtn.addEventListener("click", () => {
  chrome.storage.local.get({ collectionEnabled: true }, (data) => {
    const next = !data.collectionEnabled;
    chrome.storage.local.set({ collectionEnabled: next }, () => {
      applyToggleUI(next);
      setBadge(next, allKeywords.length);
    });
  });
});

// --- تنظیم دامنه خودت (برای چک خودکار رتبه) ---
chrome.storage.local.get({ myDomain: "" }, (data) => {
  myDomain = data.myDomain || "";
  domainInput.value = myDomain;
});

domainBtn.addEventListener("click", () => {
  domainPanel.classList.toggle("show");
});

domainSaveBtn.addEventListener("click", () => {
  myDomain = domainInput.value.trim();
  chrome.storage.local.set({ myDomain }, () => {
    domainPanel.classList.remove("show");
  });
});

domainInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") domainSaveBtn.click();
});

// --- به‌روزرسانی زنده: وقتی چک رتبه (که چند ثانیه طول می‌کشه) توی
// پس‌زمینه نتیجه‌ش رو ذخیره کرد، اگه پاپ‌آپ هنوز بازه، خودکار رفرش بشه ---
chrome.storage.onChanged.addListener((changes, area) => {
  if (suppressChangeListener) return;
  if (area === "local" && (changes.keywords || changes.groupMeta)) {
    refresh();
  }
});

refresh();
