let currentTabId = null;
let requests = [];
let isRecording = false;
let currentFilter = "all";
let selectedRequests = new Set();
let searchQuery = "";
let fileExtension = "";
let filePrefix = "";
let startNumber = 1;
let fileCounter = 1;

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

  elements.searchInput.addEventListener("input", (e) => {
    searchQuery = e.target.value;
    selectedRequests.clear();
    elements.selectAllCheckbox.checked = false;
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
      selectedRequests.clear();
      elements.selectAllCheckbox.checked = false;
      renderRequests();
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

  const curlCommandsList = [];

  for (const req of selectedReqs) {
    const cookies = await getCookiesForUrl(req.url);
    const cmd = generateCurlForRequest(req, cookies);
    curlCommandsList.push(cmd);
  }

  const curlCommands = curlCommandsList.join("\n\n");

  elements.curlOutput.value = curlCommands;
  elements.curlModal.classList.remove("hidden");
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

      if (lowerKey === "cookie" && value && !cookies) {
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
