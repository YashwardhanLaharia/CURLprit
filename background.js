let tabRequests = new Map();
let attachedTabs = new Set();
let recordingEnabled = new Map();

const STORAGE_KEY = 'recordingState';

async function getRecordingState(tabId) {
  return new Promise((resolve) => {
    chrome.storage.local.get(STORAGE_KEY, (result) => {
      const states = result[STORAGE_KEY] || {};
      resolve(states[tabId] || false);
    });
  });
}

async function setRecordingState(tabId, enabled) {
  return new Promise((resolve) => {
    chrome.storage.local.get(STORAGE_KEY, (result) => {
      const states = result[STORAGE_KEY] || {};
      states[tabId] = enabled;
      chrome.storage.local.set({ [STORAGE_KEY]: states }, resolve);
    });
  });
}

async function attachDebugger(tabId) {
  if (attachedTabs.has(tabId)) return;
  
  try {
    await chrome.debugger.attach({ tabId }, "1.3");
    await chrome.debugger.sendCommand({ tabId }, "Network.enable");
    attachedTabs.add(tabId);
    if (!tabRequests.has(tabId)) {
      tabRequests.set(tabId, []);
    }
  } catch (err) {
    console.error('Failed to attach debugger:', err);
  }
}

async function detachDebugger(tabId) {
  if (!attachedTabs.has(tabId)) return;
  
  try {
    await chrome.debugger.sendCommand({ tabId }, "Network.disable");
    await chrome.debugger.detach({ tabId });
    attachedTabs.delete(tabId);
  } catch (err) {
    console.error('Failed to detach debugger:', err);
  }
}

chrome.debugger.onEvent.addListener((source, method, params) => {
  if (!recordingEnabled.get(source.tabId)) return;
  
  if (method === 'Network.requestWillBeSent') {
    const request = {
      id: params.requestId,
      url: params.request.url,
      method: params.request.method,
      type: params.type || 'other',
      status: 0,
      statusText: '',
      startTime: params.timestamp,
      endTime: null,
      time: 0,
      size: 0,
      requestHeaders: params.request.headers,
      responseHeaders: null,
      response: null,
      postData: params.request.postData
    };
    
    if (!tabRequests.has(source.tabId)) {
      tabRequests.set(source.tabId, []);
    }
    tabRequests.get(source.tabId).push(request);
  }
  
  if (method === 'Network.responseReceived') {
    const requests = tabRequests.get(source.tabId);
    if (requests) {
      const req = requests.find(r => r.id === params.responseId);
      if (req) {
        req.status = params.response.status;
        req.statusText = params.response.statusText;
        req.responseHeaders = params.response.headers;
        req.endTime = params.timestamp;
      }
    }
  }
  
  if (method === 'Network.loadingFinished') {
    const requests = tabRequests.get(source.tabId);
    if (requests) {
      const req = requests.find(r => r.id === params.requestId);
      if (req) {
        req.size = params.encodedDataLength;
        if (req.endTime) {
          req.time = (req.endTime - req.startTime) * 1000;
        }
      }
    }
  }
  
  if (method === 'Network.dataReceived') {
    const requests = tabRequests.get(source.tabId);
    if (requests) {
      const req = requests.find(r => r.id === params.requestId);
      if (req) {
        req.size += params.dataLength;
      }
    }
  }
});

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const isRecording = await getRecordingState(activeInfo.tabId);
  recordingEnabled.set(activeInfo.tabId, isRecording);
  if (isRecording) {
    await attachDebugger(activeInfo.tabId);
  }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'loading') {
    const isRecording = await getRecordingState(tabId);
    recordingEnabled.set(tabId, isRecording);
    if (isRecording) {
      if (!attachedTabs.has(tabId)) {
        await attachDebugger(tabId);
      }
    }
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'getRequests') {
    const tabId = message.tabId;
    const requests = tabRequests.get(tabId) || [];
    sendResponse({ requests });
  }
  
  if (message.type === 'clearRequests') {
    const tabId = message.tabId;
    tabRequests.set(tabId, []);
    sendResponse({ success: true });
  }
  
  if (message.type === 'toggleRecording') {
    const tabId = message.tabId;
    const enabled = message.enabled;
    
    recordingEnabled.set(tabId, enabled);
    setRecordingState(tabId, enabled);
    
    if (enabled) {
      attachDebugger(tabId);
    } else {
      detachDebugger(tabId);
    }
    
    sendResponse({ success: true });
  }
  
  if (message.type === 'getRecordingState') {
    const tabId = message.tabId;
    getRecordingState(tabId).then((isRecording) => {
      sendResponse({ isRecording });
    });
    return true;
  }
  
  if (message.type === 'getCookies') {
    const url = message.url;
    
    const getCookiesForDomain = async () => {
      let allCookies = [];
      
      const essentialCookiePatterns = [
        'session', 'token', 'auth', 'jwt', 'login', 'user', 'id',
        'cf_clearance', '__cf_bm', '__cf', 'cloudflare',
        'php', 'laravel', 'django', 'rails', 'express',
        'asp', 'java', 'dotnet', 'node',
        'student', 'course', 'member', 'premium',
        'remember', 'access', 'refresh',
        'csrf', 'xsrf', 'token',
        'sb', 'fbp', 'wl', 'linkedin',
        'Optanon', 'oneTrust', 'consent',
        ' EBSESSIONID', 'JSESSIONID', 'ASPSESSIONID'
      ];
      
      const trackingCookiePatterns = [
        '_ga', '_gid', '_gat', '_gat_', '_gac', '__gads', '_gcl',
        '_fbp', '_fbc', 'fr', 'tr',
        'ads', 'advert', 'tracking', 'pixel', 'beacon',
        'doubleclick', 'pubmatic', 'openx', 'rubicon',
        'analytics', 'mixpanel', 'segment', 'hotjar',
        'optimizely', 'branch', 'appsflyer', 'adjust',
        'mqtt', 'pusher', 'socket',
        'lang', 'locale', 'timezone',
        'gdpr', 'ccpa', 'notice', 'popup',
        'scroll', 'visited', 'theme', 'color',
        'size', 'width', 'height',
        '_delighted', 'hrt', 'fst',
        'sd_', 'seg', 'distinct',
        'fdisi', 'frit', 'studocu_ga', 'kirby'
      ];
      
      const isEssentialCookie = (name) => {
        const lowerName = name.toLowerCase();
        for (const pattern of essentialCookiePatterns) {
          if (lowerName.includes(pattern.toLowerCase())) {
            return true;
          }
        }
        return false;
      };
      
      const isTrackingCookie = (name) => {
        const lowerName = name.toLowerCase();
        for (const pattern of trackingCookiePatterns) {
          if (lowerName.startsWith(pattern.toLowerCase())) {
            return true;
          }
        }
        return false;
      };
      
      try {
        const urlObj = new URL(url);
        const hostname = urlObj.hostname;
        
        // Get cookies for exact domain
        const domainCookies = await new Promise((resolve) => {
          chrome.cookies.getAll({ domain: hostname }, resolve);
        });
        allCookies = allCookies.concat(domainCookies);
        
        // Also get cookies for parent domains
        const parts = hostname.split('.');
        if (parts.length > 2) {
          for (let i = 1; i < parts.length; i++) {
            const parentDomain = '.' + parts.slice(i).join('.');
            const parentCookies = await new Promise((resolve) => {
              chrome.cookies.getAll({ domain: parentDomain }, resolve);
            });
            for (const pc of parentCookies) {
              if (!allCookies.some(ec => ec.name === pc.name && ec.domain === pc.domain)) {
                allCookies.push(pc);
              }
            }
          }
        }
        
        // Filter cookies: keep essential ones, exclude tracking ones
        const filteredCookies = allCookies.filter(c => {
          // Always keep if it's essential
          if (isEssentialCookie(c.name)) return true;
          // Skip if it's a tracking cookie
          if (isTrackingCookie(c.name)) return false;
          // Keep if it has a session-like name
          if (c.name.toLowerCase().includes('session')) return true;
          // Keep Cloudflare cookies
          if (c.name.startsWith('__cf')) return true;
          // Keep Optanon consent cookies
          if (c.name.startsWith('Optanon')) return true;
          // Keep remember tokens
          if (c.name.toLowerCase().includes('remember')) return true;
          // Keep XSRF tokens
          if (c.name.toLowerCase().includes('xsrf') || c.name.toLowerCase().includes('csrf')) return true;
          // Keep all other cookies but limit total
          return true;
        });
        
        // Limit to max 50 cookies to prevent curl errors
        const limitedCookies = filteredCookies.slice(0, 50);
        
        const cookieString = limitedCookies.map(c => `${c.name}=${c.value}`).join('; ');
        return cookieString;
      } catch (err) {
        console.error('Error getting cookies:', err);
        return '';
      }
    };
    
    getCookiesForDomain().then(cookieString => {
      sendResponse({ cookies: cookieString });
    });
    return true;
  }
});
