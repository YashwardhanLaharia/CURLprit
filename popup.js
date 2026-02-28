let currentTabId = null;
let currentTabUrl = null;
let requests = [];
let isRecording = false;
let currentFilter = "all";
let selectedRequests = new Set();
let searchQuery = "";
let fileExtension = "";
let filePrefix = "";
let startNumber = 1;
let fileCounter = 1;

let cookies = [];
let selectedCookies = new Set();

const elements = {
  requestsList: document.getElementById("requestsList"),
  requestCount: document.getElementById("requestCount"),
  clearBtn: document.getElementById("clearBtn"),
  startBtn: document.getElementById("startBtn"),
  stopBtn: document.getElementById("stopBtn"),
  refreshBtn: document.getElementById("refreshBtn"),
  getCurlBtn: document.getElementById("getCurlBtn"),
  selectAllCheckbox: document.getElementById("selectAllCheckbox"),
  searchInput: document.getElementById("searchInput"),
  fileExtension: document.getElementById("fileExtension"),
  filePrefix: document.getElementById("filePrefix"),
  startNumber: document.getElementById("startNumber"),
  resetNaming: document.getElementById("resetNaming"),
  filterTabs: document.querySelectorAll(".filter-tab"),
  curlModal: document.getElementById("curlModal"),
  closeModal: document.getElementById("closeModal"),
  curlOutput: document.getElementById("curlOutput"),
  copyCurl: document.getElementById("copyCurl"),
  cookieSection: document.getElementById("cookieSection"),
  cookieList: document.getElementById("cookieList"),
  cookieCount: document.getElementById("cookieCount"),
  selectAllCookies: document.getElementById("selectAllCookies"),
  deselectAllCookies: document.getElementById("deselectAllCookies"),
  refreshCookies: document.getElementById("refreshCookies"),
  requestsHeaderRow: document.querySelector(".header-row"),
  cookieHeaderRow: document.querySelector(".cookie-header"),
};

const filterCategories = {
  img: ["image", "png", "jpg", "jpeg", "gif", "webp", "svg", "ico", "bmp"],
  video: ["video", "mp4", "webm", "ogg", "avi", "mov"],
  pdf: ["pdf"],
  doc: [
    "document",
    "doc",
    "docx",
    "xls",
    "xlsx",
    "ppt",
    "pptx",
    "txt",
    "csv",
    "xml",
    "json",
  ],
  css: ["stylesheet", "css"],
  js: ["script", "javascript", "js"],
  xhr: ["xhr", "fetch", "xmlhttprequest"],
  font: ["font", "woff", "woff2", "ttf", "otf", "eot"],
};

const essentialCookiePatterns = [
  "session",
  "token",
  "auth",
  "jwt",
  "login",
  "user",
  "id",
  "cf_clearance",
  "__cf_bm",
  "__cf",
  "cloudflare",
  "php",
  "laravel",
  "django",
  "rails",
  "express",
  "asp",
  "java",
  "dotnet",
  "node",
  "student",
  "course",
  "member",
  "premium",
  "remember",
  "access",
  "refresh",
  "csrf",
  "xsrf",
  "sb",
  "fbp",
  "wl",
  "linkedin",
  "Optanon",
  "oneTrust",
  "consent",
  " EBSESSIONID",
  "JSESSIONID",
  "ASPSESSIONID",
];

const trackingCookiePatterns = [
  "_ga",
  "_gid",
  "_gat",
  "_gat_",
  "_gac",
  "__gads",
  "_gcl",
  "_fbp",
  "_fbc",
  "fr",
  "tr",
  "ads",
  "advert",
  "tracking",
  "pixel",
  "beacon",
  "doubleclick",
  "pubmatic",
  "openx",
  "rubicon",
  "analytics",
  "mixpanel",
  "segment",
  "hotjar",
  "optimizely",
  "branch",
  "appsflyer",
  "adjust",
  "mqtt",
  "pusher",
  "socket",
  "lang",
  "locale",
  "timezone",
  "gdpr",
  "ccpa",
  "notice",
  "popup",
  "scroll",
  "visited",
  "theme",
  "color",
  "size",
  "width",
  "height",
  "_delighted",
  "hrt",
  "fst",
  "sd_",
  "seg",
  "distinct",
  "fdisi",
  "frit",
  "studocu_ga",
  "kirby",
];

function isEssentialCookie(name) {
  const lowerName = name.toLowerCase();
  for (const pattern of essentialCookiePatterns) {
    if (lowerName.includes(pattern.toLowerCase())) {
      return true;
    }
  }
  return false;
}

function isTrackingCookie(name) {
  const lowerName = name.toLowerCase();
  for (const pattern of trackingCookiePatterns) {
    if (lowerName.startsWith(pattern.toLowerCase())) {
      return true;
    }
  }
  return false;
}

function isRecommendedCookie(name) {
  if (isEssentialCookie(name)) return true;
  if (isTrackingCookie(name)) return false;
  if (name.toLowerCase().includes("session")) return true;
  if (name.startsWith("__cf")) return true;
  if (name.startsWith("Optanon")) return true;
  if (name.toLowerCase().includes("remember")) return true;
  if (name.toLowerCase().includes("xsrf") || name.toLowerCase().includes("csrf")) return true;
  return true;
}

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (
    !tab ||
    tab.url.startsWith("chrome://") ||
    tab.url.startsWith("chrome-extension://")
  ) {
    showError("Cannot capture on this page");
    return;
  }

  currentTabId = tab.id;
  currentTabUrl = tab.url;

  const response = await chrome.runtime.sendMessage({
    type: "getRecordingState",
    tabId: currentTabId,
  });

  if (response && response.isRecording) {
    isRecording = true;
    elements.startBtn.disabled = true;
    elements.stopBtn.disabled = false;
  }

  loadRequests();
  loadCookies();

  setInterval(loadRequests, 500);

  setupEventListeners();
}

function setupEventListeners() {
  elements.clearBtn.addEventListener("click", clearRequests);
  elements.startBtn.addEventListener("click", startRecording);
  elements.stopBtn.addEventListener("click", stopRecording);
  elements.refreshBtn.addEventListener("click", refreshTab);
  elements.getCurlBtn.addEventListener("click", generateCurlCommands);
  elements.selectAllCheckbox.addEventListener(
    "change",
    toggleSelectAllCheckbox,
  );
  elements.closeModal.addEventListener("click", closeModal);
  elements.copyCurl.addEventListener("click", copyCurlToClipboard);

  elements.selectAllCookies.addEventListener("click", selectAllCookiesFn);
  elements.deselectAllCookies.addEventListener("click", deselectAllCookiesFn);
  elements.refreshCookies.addEventListener("click", () => {
    loadCookies();
  });

  elements.searchInput.addEventListener("input", (e) => {
    searchQuery = e.target.value;
    renderRequests();
  });

  elements.fileExtension.addEventListener("input", updateNamingState);
  elements.filePrefix.addEventListener("input", updateNamingState);
  elements.startNumber.addEventListener("input", (e) => {
    const val = parseInt(e.target.value, 10);
    if (val >= 1) {
      fileCounter = val;
      startNumber = val;
    }
  });

  elements.resetNaming.addEventListener("click", () => {
    const val = parseInt(elements.startNumber.value, 10);
    fileCounter = val >= 1 ? val : 1;
    startNumber = fileCounter;
  });

  elements.filterTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      elements.filterTabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      currentFilter = tab.dataset.filter;
      
      if (currentFilter === "cookies") {
        elements.requestsList.classList.add("hidden");
        elements.cookieSection.classList.remove("hidden");
        elements.requestsHeaderRow.classList.add("hidden");
        elements.cookieHeaderRow.classList.remove("hidden");
      } else {
        elements.requestsList.classList.remove("hidden");
        elements.cookieSection.classList.add("hidden");
        elements.requestsHeaderRow.classList.remove("hidden");
        elements.cookieHeaderRow.classList.add("hidden");
        renderRequests();
      }
    });
  });
}

function updateNamingState() {
  fileExtension = elements.fileExtension.value.trim();
  filePrefix = elements.filePrefix.value.trim();

  if (fileExtension && filePrefix) {
    elements.getCurlBtn.disabled = false;
  } else {
    elements.getCurlBtn.disabled = true;
  }
}

async function loadRequests() {
  if (!currentTabId) return;

  try {
    const response = await chrome.runtime.sendMessage({
      type: "getRequests",
      tabId: currentTabId,
    });

    if (response && response.requests) {
      requests = response.requests;
      renderRequests();
    }
  } catch (err) {
    console.error("Error loading requests:", err);
  }
}

async function loadCookies() {
  if (!currentTabUrl) return;

  try {
    const urlObj = new URL(currentTabUrl);
    const hostname = urlObj.hostname;

    const domainCookies = await chrome.cookies.getAll({ domain: hostname });
    cookies = domainCookies;
    
    cookies.forEach((cookie, index) => {
      if (isRecommendedCookie(cookie.name) && !selectedCookies.has(index)) {
        selectedCookies.add(index);
      }
    });

    renderCookies();
  } catch (err) {
    console.error("Error loading cookies:", err);
  }
}

function renderCookies() {
  elements.cookieList.innerHTML = "";

  const count = cookies.length;
  const selectedCount = selectedCookies.size;
  elements.cookieCount.textContent = `${selectedCount} of ${count} selected`;

  if (count === 0) {
    elements.cookieList.innerHTML = '<div class="empty-message">No cookies found for this page</div>';
    return;
  }

  cookies.forEach((cookie, index) => {
    const row = document.createElement("div");
    row.className = "cookie-row";

    const isSelected = selectedCookies.has(index);
    const isRecommended = isRecommendedCookie(cookie.name);
    const isTracking = isTrackingCookie(cookie.name);

    let nameClass = "cookie-name";
    if (isTracking) {
      nameClass += " cookie-name-tracking";
    } else if (isRecommended) {
      nameClass += " cookie-name-recommended";
    }

    row.innerHTML = `
      <div class="col-checkbox">
        <input type="checkbox" class="cookie-checkbox" data-index="${index}" ${isSelected ? "checked" : ""}>
      </div>
      <div class="${nameClass}" title="${escapeHtml(cookie.name)}">
        ${escapeHtml(cookie.name)}
      </div>
      <div class="cookie-value" title="${escapeHtml(cookie.value)}">
        ${escapeHtml(cookie.value.length > 50 ? cookie.value.substring(0, 50) + "..." : cookie.value)}
      </div>
    `;

    const checkbox = row.querySelector(".cookie-checkbox");
    checkbox.addEventListener("change", (e) => {
      if (e.target.checked) {
        selectedCookies.add(index);
      } else {
        selectedCookies.delete(index);
      }
      updateCookieCount();
    });

    elements.cookieList.appendChild(row);
  });

  updateCookieCount();
}

function updateCookieCount() {
  const count = cookies.length;
  const selectedCount = selectedCookies.size;
  elements.cookieCount.textContent = `${selectedCount} of ${count} selected`;
}

function selectAllCookiesFn() {
  cookies.forEach((_, index) => {
    selectedCookies.add(index);
  });
  renderCookies();
}

function deselectAllCookiesFn() {
  selectedCookies.clear();
  renderCookies();
}

function filterRequest(req) {
  if (searchQuery && !wildcardMatch(req.url, searchQuery)) {
    return false;
  }

  if (currentFilter === "all") return true;

  const type = (req.type || "other").toLowerCase();
  const url = req.url.toLowerCase();
  const mimeType = req.responseHeaders?.["content-type"] || "";

  const categories = filterCategories[currentFilter];
  if (!categories) return true;

  for (const cat of categories) {
    if (type.includes(cat) || url.includes(cat) || mimeType.includes(cat)) {
      return true;
    }
  }

  return false;
}

function wildcardMatch(text, pattern) {
  const regexPattern = pattern
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  const regex = new RegExp(regexPattern, "i");
  return regex.test(text);
}

function renderRequests() {
  elements.requestsList.innerHTML = "";

  const filteredRequests = requests.filter(filterRequest);
  const count = filteredRequests.length;
  const totalCount = requests.length;

  let countText = "";
  if (searchQuery && currentFilter !== "all") {
    countText = `${count} of ${totalCount} requests`;
  } else if (searchQuery) {
    countText = `${count} of ${totalCount} requests`;
  } else if (currentFilter !== "all") {
    countText = `${count} of ${totalCount} requests`;
  } else {
    countText = `${count} request${count !== 1 ? "s" : ""}`;
  }
  elements.requestCount.textContent = countText;

  const selectedInFiltered = filteredRequests.filter((_, idx) => {
    const reqId = `${currentTabId}-${idx}`;
    return selectedRequests.has(reqId);
  }).length;

  elements.selectAllCheckbox.checked =
    count > 0 && selectedInFiltered === count;
  elements.selectAllCheckbox.indeterminate =
    selectedInFiltered > 0 && selectedInFiltered < count;

  filteredRequests.forEach((req, index) => {
    const row = document.createElement("div");
    row.className = "request-row";

    const globalIndex = requests.indexOf(req);
    const reqId = `${currentTabId}-${globalIndex}`;
    const isSelected = selectedRequests.has(reqId);

    const name = getFileName(req.url);
    const type = req.type || "other";
    const size = formatSize(req.size);

    row.innerHTML = `
      <div class="col-checkbox">
        <input type="checkbox" class="request-checkbox" data-id="${reqId}" ${isSelected ? "checked" : ""}>
      </div>
      <div class="col-name" title="${escapeHtml(req.url)}">
        <span class="method method-${req.method.toLowerCase()}">${req.method}</span>
        <span class="name">${escapeHtml(name)}</span>
      </div>
      <div class="col-type">${type}</div>
      <div class="col-size">${size}</div>
    `;

    const checkbox = row.querySelector(".request-checkbox");
    checkbox.addEventListener("change", (e) => {
      if (e.target.checked) {
        selectedRequests.add(reqId);
      } else {
        selectedRequests.delete(reqId);
      }
      updateSelectedCount();
    });

    elements.requestsList.appendChild(row);
  });
}

function updateSelectedCount() {
  const filteredRequests = requests.filter(filterRequest);
  let selectedInFiltered = 0;

  filteredRequests.forEach((req, idx) => {
    const globalIndex = requests.indexOf(req);
    const reqId = `${currentTabId}-${globalIndex}`;
    if (selectedRequests.has(reqId)) {
      selectedInFiltered++;
    }
  });

  const count = filteredRequests.length;
  elements.selectAllCheckbox.checked =
    count > 0 && selectedInFiltered === count;
  elements.selectAllCheckbox.indeterminate =
    selectedInFiltered > 0 && selectedInFiltered < count;
}

function toggleSelectAllCheckbox(e) {
  if (e.target.checked) {
    selectAll();
  } else {
    deselectAll();
  }
}

function selectAll() {
  const filteredRequests = requests.filter(filterRequest);
  filteredRequests.forEach((req) => {
    const globalIndex = requests.indexOf(req);
    const reqId = `${currentTabId}-${globalIndex}`;
    selectedRequests.add(reqId);
  });
  updateSelectedCount();
  renderRequests();
}

function deselectAll() {
  selectedRequests.clear();
  updateSelectedCount();
  renderRequests();
}

async function generateCurlCommands() {
  fileCounter = parseInt(elements.startNumber.value, 10) || 1;

  const selectedReqs = requests.filter((req, idx) => {
    const reqId = `${currentTabId}-${idx}`;
    return selectedRequests.has(reqId);
  });

  if (selectedReqs.length === 0) {
    alert("No requests selected. Please select at least one request.");
    return;
  }

  const cookieString = getSelectedCookiesString();
  const curlCommandsList = [];

  for (const req of selectedReqs) {
    const cmd = generateCurlForRequest(req, cookieString);
    curlCommandsList.push(cmd);
  }

  const curlCommands = curlCommandsList.join("\n\n");

  elements.curlOutput.value = curlCommands;
  elements.curlModal.classList.remove("hidden");
}

function getSelectedCookiesString() {
  if (selectedCookies.size === 0) return "";
  
  const selectedCookieList = [];
  selectedCookies.forEach((index) => {
    if (cookies[index]) {
      selectedCookieList.push(`${cookies[index].name}=${cookies[index].value}`);
    }
  });
  
  return selectedCookieList.join("; ");
}

async function getCookiesForUrl(url) {
  try {
    const response = await chrome.runtime.sendMessage({
      type: "getCookies",
      url: url,
    });
    return response?.cookies || "";
  } catch (err) {
    console.error("Error getting cookies:", err);
    return "";
  }
}

function generateCurlForRequest(req, cookiesFromApi = "") {
  const filename = getFilenameFromUrl(req.url);
  let cmd = `curl -L -o "${filename}"`;

  if (req.method && req.method.toUpperCase() !== "GET") {
    cmd += ` -X ${req.method}`;
  }

  let cookies = cookiesFromApi;
  const headersAdded = new Set();

  if (req.requestHeaders) {
    for (const [key, value] of Object.entries(req.requestHeaders)) {
      const lowerKey = key.toLowerCase();
      headersAdded.add(lowerKey);

      if (lowerKey === "cookie" && value && cookiesFromApi === undefined) {
        cookies = value;
      } else if (value) {
        cmd += ` -H "${escapeHeader(key)}: ${escapeHeader(value)}"`;
      }
    }
  }

  if (cookies) {
    cmd += ` -b "${escapeHeader(cookies)}"`;
  }

  const type = req.type || "";
  if (type.includes("image")) {
    if (!headersAdded.has("accept")) {
      cmd += ` -H "accept: image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"`;
    }
  }

  if (!headersAdded.has("accept-language")) {
    cmd += ` -H "accept-language: en-AU,en-GB;q=0.9,en-US;q=0.8,en;q=0.7"`;
  }

  if (!headersAdded.has("priority")) {
    cmd += ` -H "priority: u=1, i"`;
  }

  if (!headersAdded.has("sec-fetch-dest")) {
    cmd += ` -H "sec-fetch-dest: ${type.includes("image") ? "image" : "empty"}"`;
  }

  if (!headersAdded.has("sec-fetch-mode")) {
    cmd += ` -H "sec-fetch-mode: no-cors"`;
  }

  if (!headersAdded.has("sec-fetch-site")) {
    cmd += ` -H "sec-fetch-site: same-origin"`;
  }

  if (!headersAdded.has("sec-gpc")) {
    cmd += ` -H "sec-gpc: 1"`;
  }

  if (req.postData) {
    const postData =
      typeof req.postData === "string"
        ? req.postData
        : JSON.stringify(req.postData);
    cmd += ` -d '${postData}'`;
  }

  cmd += ` "${req.url}"`;

  return cmd;
}

function escapeHeader(value) {
  if (typeof value !== "string") return value;
  return value.replace(/"/g, '\\"');
}

function getFilenameFromUrl(url) {
  const counter = fileCounter.toString().padStart(3, "0");
  fileCounter++;
  return `${filePrefix}${counter}.${fileExtension}`;
}

function getExtensionFromMime(pathname) {
  const ext = pathname.split(".").pop()?.toLowerCase();
  const imageExts = ["png", "jpg", "jpeg", "gif", "webp", "svg", "ico", "bmp"];
  const videoExts = ["mp4", "webm", "ogg", "avi", "mov"];
  const docExts = ["pdf", "doc", "docx", "xls", "xlsx", "txt", "csv"];
  const fontExts = ["woff", "woff2", "ttf", "otf", "eot"];

  if (imageExts.includes(ext)) return ext;
  if (videoExts.includes(ext)) return ext;
  if (docExts.includes(ext)) return ext;
  if (fontExts.includes(ext)) return ext;

  return "";
}

function closeModal() {
  elements.curlModal.classList.add("hidden");
}

function copyCurlToClipboard() {
  elements.curlOutput.select();
  document.execCommand("copy");

  elements.copyCurl.textContent = "Copied!";
  setTimeout(() => {
    elements.copyCurl.textContent = "Copy to Clipboard";
  }, 2000);
}

async function clearRequests() {
  if (!currentTabId) return;

  await chrome.runtime.sendMessage({
    type: "clearRequests",
    tabId: currentTabId,
  });

  requests = [];
  selectedRequests.clear();
  searchQuery = "";
  fileCounter = parseInt(elements.startNumber.value, 10) || 1;
  elements.searchInput.value = "";
  elements.selectAllCheckbox.checked = false;
  renderRequests();
}

async function startRecording() {
  isRecording = true;
  elements.startBtn.disabled = true;
  elements.stopBtn.disabled = false;

  if (currentTabId) {
    await chrome.runtime.sendMessage({
      type: "toggleRecording",
      tabId: currentTabId,
      enabled: true,
    });
  }
}

async function stopRecording() {
  isRecording = false;
  elements.startBtn.disabled = false;
  elements.stopBtn.disabled = true;

  if (currentTabId) {
    await chrome.runtime.sendMessage({
      type: "toggleRecording",
      tabId: currentTabId,
      enabled: false,
    });
  }
}

async function refreshTab() {
  if (currentTabId) {
    await chrome.tabs.reload(currentTabId);
  }
}

function getFileName(url) {
  try {
    const urlObj = new URL(url);
    let path = urlObj.pathname;
    if (path === "/") {
      path = urlObj.hostname;
    }
    return path.split("/").pop() || urlObj.hostname;
  } catch {
    return url;
  }
}

function getStatusClass(status) {
  if (!status) return "status-pending";
  if (status >= 200 && status < 300) return "status-success";
  if (status >= 300 && status < 400) return "status-redirect";
  if (status >= 400 && status < 500) return "status-client-error";
  if (status >= 500) return "status-server-error";
  return "";
}

function formatSize(bytes) {
  if (!bytes || bytes === -1) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTime(ms) {
  if (!ms) return "-";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function showError(message) {
  elements.requestsList.innerHTML = `<div class="error-message">${escapeHtml(message)}</div>`;
}

document.addEventListener("DOMContentLoaded", init);
