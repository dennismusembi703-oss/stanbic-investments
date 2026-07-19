let user = JSON.parse(localStorage.getItem("currentUser"));
if (!user) window.location.href = "login.html";

/* ================= USER ID GENERATION ================= */
if (!user.id) {
  user.id = 'USR-' + Math.random().toString(36).substr(2, 9).toUpperCase();
  localStorage.setItem('currentUser', JSON.stringify(user));
}

// Display user ID when page loads
document.addEventListener('DOMContentLoaded', () => {
  const userIdDisplay = document.getElementById('user-id-display');
  if (userIdDisplay) {
    userIdDisplay.textContent = user.id;
  }
});

/* ================= SAFE DEFAULTS ================= */
user.assets = user.assets || {
  BTC: 0,
  ETH: 0,
  SOL: 0,
  TRX: 0,
  USDT: 0
};

user.hasPaidBlockchainFee = user.hasPaidBlockchainFee || false;
user.tradeProtection = user.tradeProtection || {
  stopLossPct: 0,
  takeProfitPct: 0
};
user.protectedPositions = user.protectedPositions || {};

let userBalance = parseFloat(user.balance) || 0;
let transactions = user.transactions || [];
let currentPrices = {}; // Store current crypto prices
window.currentPrices = window.currentPrices || {};
const RECEIPTS_STORAGE_KEY = "generatedReceipts";
const RECEIPT_EMAIL_LOG_STORAGE_KEY = "receiptEmailLogs";
const DOCUMENTS_STORAGE_KEY = "uploadedDocuments";
const EMAILJS_CONFIG_STORAGE_KEY = "emailjsReceiptConfig";
const EMAILJS_FALLBACK_CONFIG = {
  publicKey: "YOUR_EMAILJS_PUBLIC_KEY",
  serviceId: "YOUR_EMAILJS_SERVICE_ID",
  templateId: "YOUR_EMAILJS_TEMPLATE_ID"
};

function getStorageArray(key) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key));
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error(`Failed to parse localStorage key "${key}"`, err);
    return [];
  }
}

function setStorageArray(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function syncCurrentUserToUsers() {
  const users = getStorageArray("users");
  const userIndex = users.findIndex((u) => u.email === user.email);
  if (userIndex === -1) return;

  users[userIndex] = {
    ...users[userIndex],
    ...user,
    balance: userBalance,
    assets: user.assets || users[userIndex].assets || {},
    transactions: transactions
  };

  setStorageArray("users", users);
}

function saveCurrentUserState() {
  user.balance = userBalance;
  user.transactions = transactions;
  localStorage.setItem("currentUser", JSON.stringify(user));
  syncCurrentUserToUsers();
}

function parseTransactionAmount(txAmount) {
  if (typeof txAmount !== "string") return 0;
  const numeric = txAmount.replace(/[^0-9.-]/g, "");
  const value = parseFloat(numeric);
  return Number.isFinite(value) ? value : 0;
}

function persistGeneratedReceipt(receipt) {
  const receipts = getStorageArray(RECEIPTS_STORAGE_KEY);
  receipts.unshift(receipt);
  setStorageArray(RECEIPTS_STORAGE_KEY, receipts);
}

function syncReceiptFromTransaction(transaction, metadataPatch = null) {
  if (!transaction || !transaction.receiptId) return null;

  const receipts = getStorageArray(RECEIPTS_STORAGE_KEY);
  const receiptIndex = receipts.findIndex((receipt) => receipt.id === transaction.receiptId);
  if (receiptIndex === -1) return null;

  const currentReceipt = receipts[receiptIndex];
  const updatedReceipt = {
    ...currentReceipt,
    transactionType: transaction.type || currentReceipt.transactionType,
    displayAmount: transaction.amount || currentReceipt.displayAmount,
    amountValue: parseTransactionAmount(transaction.amount || currentReceipt.displayAmount || "0"),
    transactionDate: transaction.date || currentReceipt.transactionDate,
    status: transaction.status || currentReceipt.status,
    metadata: {
      ...(currentReceipt.metadata || {}),
      ...(metadataPatch || {})
    }
  };

  receipts[receiptIndex] = updatedReceipt;
  setStorageArray(RECEIPTS_STORAGE_KEY, receipts);
  return updatedReceipt;
}

function getEmailJsConfig() {
  let config = { ...EMAILJS_FALLBACK_CONFIG };

  try {
    const saved = JSON.parse(localStorage.getItem(EMAILJS_CONFIG_STORAGE_KEY) || "{}");
    if (saved && typeof saved === "object") {
      config = { ...config, ...saved };
    }
  } catch (err) {
    console.error("Could not parse EmailJS config from localStorage.", err);
  }

  if (window.EMAILJS_RECEIPT_CONFIG && typeof window.EMAILJS_RECEIPT_CONFIG === "object") {
    config = { ...config, ...window.EMAILJS_RECEIPT_CONFIG };
  }

  return config;
}

function isEmailJsConfigured(config) {
  if (!config) return false;
  const keys = [config.publicKey, config.serviceId, config.templateId];
  return keys.every((value) => typeof value === "string" && value.trim() && !value.startsWith("YOUR_"));
}

function updateEmailLog(emailLogId, updates) {
  const logs = getStorageArray(RECEIPT_EMAIL_LOG_STORAGE_KEY);
  const logIndex = logs.findIndex((log) => log.id === emailLogId);
  if (logIndex === -1) return;

  logs[logIndex] = {
    ...logs[logIndex],
    ...updates
  };
  setStorageArray(RECEIPT_EMAIL_LOG_STORAGE_KEY, logs);
}

function buildReceiptEmailTemplateParams(receipt) {
  return {
    to_email: receipt.userEmail || user.email || "",
    to_name: receipt.userName || "",
    user_id: receipt.userId || "",
    receipt_number: receipt.receiptNumber || receipt.id || "",
    transaction_type: receipt.transactionType || "",
    amount: receipt.displayAmount || "",
    transaction_date: receipt.transactionDate || "",
    transaction_status: receipt.status || "",
    created_at: receipt.createdAt || "",
    source: receipt.source || "dashboard"
  };
}

async function deliverReceiptEmail(receipt, emailLogId) {
  const config = getEmailJsConfig();

  if (!isEmailJsConfigured(config)) {
    updateEmailLog(emailLogId, {
      status: "config-missing",
      channel: "emailjs",
      errorMessage: "EmailJS config missing. Set publicKey/serviceId/templateId."
    });
    return;
  }

  if (!window.emailjs || typeof window.emailjs.send !== "function") {
    updateEmailLog(emailLogId, {
      status: "sdk-not-loaded",
      channel: "emailjs",
      errorMessage: "EmailJS SDK not loaded on page."
    });
    return;
  }

  try {
    if (!window.__emailJsReceiptInitDone && typeof window.emailjs.init === "function") {
      window.emailjs.init({ publicKey: config.publicKey });
      window.__emailJsReceiptInitDone = true;
    }

    const response = await window.emailjs.send(
      config.serviceId,
      config.templateId,
      buildReceiptEmailTemplateParams(receipt),
      { publicKey: config.publicKey }
    );

    updateEmailLog(emailLogId, {
      status: "sent",
      channel: "emailjs",
      sentAt: new Date().toISOString(),
      providerResponse: response && typeof response.status !== "undefined" ? String(response.status) : "ok"
    });
  } catch (err) {
    updateEmailLog(emailLogId, {
      status: "failed",
      channel: "emailjs",
      errorMessage: err?.text || err?.message || "EmailJS send failed."
    });
  }
}

function logReceiptEmail(receipt) {
  const emailLogs = getStorageArray(RECEIPT_EMAIL_LOG_STORAGE_KEY);
  const emailLog = {
    id: `MAIL-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    receiptId: receipt.id,
    receiptNumber: receipt.receiptNumber,
    to: user.email || "unknown@client.local",
    subject: `Stanbic Receipt ${receipt.receiptNumber}`,
    body: `Transaction ${receipt.transactionType} for ${receipt.displayAmount}`,
    status: "queued",
    channel: "emailjs",
    queuedAt: new Date().toISOString()
  };

  emailLogs.unshift(emailLog);
  setStorageArray(RECEIPT_EMAIL_LOG_STORAGE_KEY, emailLogs);
  deliverReceiptEmail(receipt, emailLog.id);
  return emailLog;
}

function createReceiptForTransaction(transaction, source = "dashboard", metadata = {}) {
  if (!transaction || !transaction.type || transaction.receiptId) return null;

  const timestamp = new Date().toISOString();
  const amountValue = parseTransactionAmount(transaction.amount);
  const receipt = {
    id: `RCT-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    receiptNumber: `STB-${new Date().getFullYear()}-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
    createdAt: timestamp,
    userId: user.id || "N/A",
    userName: `${user.firstName || ""} ${user.lastName || ""}`.trim() || "Unknown User",
    userEmail: user.email || "N/A",
    transactionType: transaction.type,
    displayAmount: transaction.amount || "0",
    amountValue,
    transactionDate: transaction.date || new Date().toLocaleString(),
    status: transaction.status || "pending",
    source,
    metadata
  };

  transaction.receiptId = receipt.id;
  transaction.receiptNumber = receipt.receiptNumber;
  transaction.receiptCreatedAt = receipt.createdAt;

  persistGeneratedReceipt(receipt);
  logReceiptEmail(receipt);
  return receipt;
}

function registerUploadedDocument(payload) {
  if (!payload || !payload.fileData) return;

  const documents = getStorageArray(DOCUMENTS_STORAGE_KEY);
  const documentRecord = {
    id: `DOC-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    uploadedAt: new Date().toISOString(),
    userId: user.id || "N/A",
    userName: `${user.firstName || ""} ${user.lastName || ""}`.trim() || "Unknown User",
    userEmail: user.email || "N/A",
    fileName: payload.fileName || "document",
    documentType: payload.documentType || "uploaded-file",
    fileMime: payload.fileMime || "",
    referenceId: payload.referenceId || null,
    fileData: payload.fileData
  };
  documents.unshift(documentRecord);

  setStorageArray(DOCUMENTS_STORAGE_KEY, documents);
  return documentRecord;
}

function instrumentTransactionsArray() {
  if (transactions.__receiptInstrumented) return;

  const nativePush = transactions.push.bind(transactions);
  Object.defineProperty(transactions, "__receiptInstrumented", {
    value: true,
    enumerable: false
  });

  transactions.push = function (...items) {
    const result = nativePush(...items);
    items.forEach((tx) => createReceiptForTransaction(tx, "dashboard"));
    saveCurrentUserState();
    return result;
  };
}

instrumentTransactionsArray();
saveCurrentUserState();

/* ================= PROFILE DISPLAY ================= */
const profileIcon = document.getElementById("profile-icon");
const profileInitials = document.getElementById("profile-initials");
const profileMenu = document.getElementById("profile-menu");
const profileUploadBtn = document.getElementById("profile-upload-btn");
const profileEmailBtn = document.getElementById("profile-email-btn");
const profileUploadInput = document.getElementById("profile-upload-input");

/* ==================== UI EVENT HANDLERS ==================== */
document.addEventListener('DOMContentLoaded', () => {
  try {
    const navBalance = document.getElementById('nav-balance');
    const welcomeName = document.getElementById('welcome-name');
    if (navBalance) navBalance.textContent = String(userBalance || 0);
    if (welcomeName) welcomeName.textContent = (user.firstName || 'User');

      // Populate asset selector for mining assets from SUPPORTED_ASSETS
      // Market selector removed — mining will be available from the Mine action card
      const supported = (window.SUPPORTED_ASSETS && Array.isArray(window.SUPPORTED_ASSETS)) ? window.SUPPORTED_ASSETS : [];

      // Mining controls wiring: show panel when an asset is selected
      try{
        const tradingModalEl = document.getElementById('trading-modal');
        const investInput = document.getElementById('mining-amount-input');
        const statusEl = document.getElementById('mining-status');
        const accumEl = document.getElementById('mining-acc');
        const startBtn = document.getElementById('mining-start');
        const stopBtn = document.getElementById('mining-stop');
        const rateDisplay = document.getElementById('mining-rate');

        const BASE_YIELD_PER_DAY_PER_USD = 0.02; // 2% per day per USD (same for all assets)

        function loadMiningSessions(){ user.miningSessions = user.miningSessions || {}; }
        loadMiningSessions();

        function saveUser(){ localStorage.setItem('currentUser', JSON.stringify(user)); }

        function updateRateDisplay(invest){
          const daily = (invest || Number(investInput?.value || 0)) * BASE_YIELD_PER_DAY_PER_USD;
          const perHourDuringMining = daily / 8;
          rateDisplay.textContent = `${perHourDuringMining.toFixed(6)} ${'asset'} / hour (during 8h mining)`;
        }

        function renderMiningForAsset(assetId){
          // open trading modal and populate mining section for the selected asset
          if(!tradingModalEl) return;
          if(!assetId){ tradingModalEl.classList.remove('show'); return; }
          tradingModalEl.classList.add('show');
          const sess = (user.miningSessions && user.miningSessions[assetId]) || { active:false, invested: Number(investInput.value || 0), accumulated:0, lastTick: Date.now() };
          investInput.value = sess.invested || investInput.value || 0;
          statusEl.textContent = sess.active ? 'Running' : 'Stopped';
          accumEl.textContent = (sess.accumulated || 0).toFixed(6);
          updateRateDisplay(sess.invested || Number(investInput.value || 0));
          // also set trading modal title/coin name
          const tradingCoinName = document.getElementById('trading-coin-name'); if(tradingCoinName) tradingCoinName.textContent = assetId;
        }

        // wire Mine button: prefer new focus-panel `#mining-panel`, fallback to legacy trading modal
        const mineBtn = document.getElementById('mine-icon-btn');
        mineBtn?.addEventListener('click', ()=>{
          const miningPanel = document.getElementById('mining-panel');
          const focusWrapper = document.getElementById('focus-panels');
          const mainEl = document.querySelector('.main');
          if(miningPanel && focusWrapper && mainEl){
            // prefill mining panel fields
            const assetSelect = document.getElementById('mining-asset-select'); if(assetSelect) assetSelect.value='ETH';
            const amtInput = document.getElementById('mining-amount-input'); if(amtInput) amtInput.value='100';
            const statusEl = document.getElementById('mining-status'); if(statusEl){ statusEl.textContent='Stopped'; statusEl.style.color='#aaa'; }
            const accEl = document.getElementById('mining-acc'); if(accEl) accEl.textContent='0.0000';
            // hide main content except focus wrapper
            Array.from(mainEl.children).forEach(ch=>{ if(ch !== focusWrapper) ch.style.display='none'; });
            focusWrapper.style.display = 'block';
            miningPanel.style.display = 'block';
            window.scrollTo({top:0,behavior:'smooth'});
            return;
          }
          // fallback: legacy trading modal flow
          const miningSection = document.getElementById('mining-section');
          if(!miningSection) return;
          let assetSelect = document.getElementById('mining-asset-select');
          if(!assetSelect){
            assetSelect = document.createElement('select');
            assetSelect.id = 'mining-asset-select';
            assetSelect.style.padding = '8px'; assetSelect.style.borderRadius = '6px'; assetSelect.style.background = 'transparent'; assetSelect.style.color = '#fff'; assetSelect.style.border = '1px solid rgba(255,255,255,0.08)';
            const label = document.createElement('label'); label.textContent = 'Asset'; label.style.display='block'; label.style.marginBottom='6px';
            miningSection.insertBefore(label, miningSection.firstChild);
            miningSection.insertBefore(assetSelect, label.nextSibling);
          }
          assetSelect.innerHTML = '<option value="">Choose asset...</option>' + supported.map(a=>{ const id=(a.id||a.name||'').toUpperCase(); const label=a.name||a.label||id; return `<option value="${id}">${label} (${id})</option>`; }).join('');
          assetSelect.onchange = ()=>{ const val = (assetSelect.value||'').toUpperCase(); renderMiningForAsset(val); };
          const tradingModalEl = document.getElementById('trading-modal'); if(tradingModalEl) tradingModalEl.classList.add('show');
        });
        // mining panel close button: restore main view
        const miningCloseBtn = document.getElementById('mining-close');
        miningCloseBtn?.addEventListener('click', ()=>{
          const miningPanel = document.getElementById('mining-panel');
          const focusWrapper = document.getElementById('focus-panels');
          const mainEl = document.querySelector('.main');
          if(miningPanel) miningPanel.style.display='none';
          if(focusWrapper) focusWrapper.style.display='none';
          if(mainEl) Array.from(mainEl.children).forEach(ch=> ch.style.display='');
        });

        startBtn?.addEventListener('click', ()=>{
          const selectEl = document.getElementById('mining-asset-select');
          const tradingCoinName = document.getElementById('trading-coin-name');
          const assetId = ((selectEl && selectEl.value) || (tradingCoinName && tradingCoinName.textContent) || '').toUpperCase();
          if(!assetId) { showTempPopup('Select an asset first',1200); return; }
          const invest = Number(investInput.value) || 0; if(invest <= 0){ showTempPopup('Enter investment amount',1200); return; }
          user.miningSessions = user.miningSessions || {};
          const now = Date.now();
          user.miningSessions[assetId] = user.miningSessions[assetId] || { active:false, invested:0, accumulated:0, lastTick: now };
          user.miningSessions[assetId].active = true;
          user.miningSessions[assetId].invested = invest;
          user.miningSessions[assetId].lastTick = now;
          saveUser();
          renderMiningForAsset(assetId);
        });

        stopBtn?.addEventListener('click', ()=>{
          const selectEl = document.getElementById('mining-asset-select');
          const tradingCoinName = document.getElementById('trading-coin-name');
          const assetId = ((selectEl && selectEl.value) || (tradingCoinName && tradingCoinName.textContent) || '').toUpperCase();
          if(!assetId) { showTempPopup('Select an asset first',1200); return; }
          user.miningSessions = user.miningSessions || {};
          if(!user.miningSessions[assetId]){ showTempPopup('Mining not active',1000); return; }
          user.miningSessions[assetId].active = false;
          user.miningSessions[assetId].lastTick = Date.now();
          saveUser();
          renderMiningForAsset(assetId);
        });

        // global tick to simulate mining accrual (runs every second)
        setInterval(()=>{
          try{
            if(!user.miningSessions) return;
            const now = Date.now();
            Object.keys(user.miningSessions).forEach(assetId=>{
              const s = user.miningSessions[assetId];
              if(!s || !s.active) return;
              const last = s.lastTick || now;
              const elapsedMs = Math.max(0, now - last);
              const miningFraction = 8/24;
              const seconds = elapsedMs / 1000;
              const effectiveDaily = (s.invested || 0) * BASE_YIELD_PER_DAY_PER_USD * miningFraction;
              const perSec = effectiveDaily / (8*3600);
              const gained = perSec * seconds;
              s.accumulated = (Number(s.accumulated) || 0) + gained;
              s.lastTick = now;
            });
            // save less frequently (every 5 ticks)
            saveCounter = (saveCounter + 1) % 5;
            if(saveCounter === 0) saveUser();

            // refresh current asset display (use mining select inside modal if present)
            const cur = ((miningSelectEl && miningSelectEl.value) || (document.getElementById('trading-coin-name') && document.getElementById('trading-coin-name').textContent) || '').toUpperCase();
            if(cur){ const sess = user.miningSessions[cur]; if(sess){
                const newVal = Number(sess.accumulated) || 0;
                const newText = newVal.toFixed(6);
                if(miningAccEl && lastDisplayed.acc !== newText){ lastDisplayed.acc = newText; requestAnimationFrame(()=> miningAccEl.textContent = newText); }
                const statusText = sess.active ? 'Running' : 'Stopped';
                if(miningStatusEl && lastDisplayed.stat !== statusText){ lastDisplayed.stat = statusText; requestAnimationFrame(()=> miningStatusEl.textContent = statusText); }
            } }
          }catch(e){ /* ignore tick errors */ }
        }, 1000);

      }catch(e){ /* ignore mining wiring errors */ }

      // --- Transfer / Referral / Gas logic for mining panel ---
      try{
        user.referrals = Number(user.referrals || 0);
        user.accountActivated = Boolean(user.accountActivated || false);
        user.paidGasNetworks = user.paidGasNetworks || {};

        const refCountEl = document.getElementById('ref-count');
        const refCodeEl = document.getElementById('ref-code');
        const inviteBtn = document.getElementById('invite-btn');
        const transferBtn = document.getElementById('transfer-btn');
        const payGasBtn = document.getElementById('pay-gas-btn');
        const transferRecipient = document.getElementById('transfer-recipient');
        const transferAmount = document.getElementById('transfer-amount');
        const transferNote = document.getElementById('transfer-note');

        function updateRefUI(){ if(refCountEl) refCountEl.textContent = String(user.referrals || 0); if(refCodeEl && !refCodeEl.textContent) refCodeEl.textContent = `REF-${(user.id||'').slice(-6)}`; }
        updateRefUI();

        inviteBtn?.addEventListener('click', ()=>{
          // Demo: increment referral count and persist
          user.referrals = Number(user.referrals || 0) + 1;
          saveCurrentUserState();
          updateRefUI();
          showTempPopup('Referral recorded (demo).', 1500);
        });

        function feeForAssetNetwork(assetSymbol){
          // determine fee token and amount by asset network
          const a = (assetSymbol||'').toUpperCase();
          let token = 'TRX', amt = 526;
          if(a === 'ETH'){ token = 'ETH'; amt = 0.005; }
          else if(a === 'BNB'){ token = 'BNB'; amt = 0.002; }
          else if(a === 'SOL'){ token = 'SOL'; amt = 0.01; }
          else if(a === 'TRX'){ token = 'TRX'; amt = 526; }
          else if(a === 'USDT'){ token = 'TRX'; amt = 526; } // default to TRX for USDT example (TRC-20)
          return { token, amt };
        }

        payGasBtn?.addEventListener('click', ()=>{
          const asset = (document.getElementById('mining-asset-select')?.value || 'TRX').toUpperCase();
          const fee = feeForAssetNetwork(asset);
          const userBal = Number(user.assets && (user.assets[fee.token] || 0));
          if(userBal < fee.amt){
            showGasFeeErrorModal({ title: 'Insufficient Gas Token Balance', requiredAmount: fee.amt, token: fee.token, userHave: userBal, note: `You need ${fee.amt} ${fee.token} to pay the one‑time network gas fee.`, prefillAmount: fee.amt });
            return;
          }
          // Deduct fee and mark network as paid
          user.assets = user.assets || {}; user.assets[fee.token] = Number(user.assets[fee.token] || 0) - Number(fee.amt);
          user.paidGasNetworks = user.paidGasNetworks || {}; user.paidGasNetworks[fee.token] = true;
          saveCurrentUserState();
          showTempPopup(`Gas fee ${fee.amt} ${fee.token} paid. Transfers below USDT 1,200 will be allowed.`, 2000);
        });

        transferBtn?.addEventListener('click', ()=>{
          const recipient = (transferRecipient?.value || '').trim();
          const amount = Number(transferAmount?.value) || 0;
          const asset = (document.getElementById('mining-asset-select')?.value || 'USDT').toUpperCase();
          if(!recipient){ showTempPopup('Enter recipient account', 1200); return; }
          if(!amount || amount <= 0){ showTempPopup('Enter a valid amount', 1200); return; }

          // compute USDT equivalent
          let usdtEquivalent = amount;
          try{ if(asset !== 'USDT'){ const rate = (window.currentPrices && window.currentPrices[asset]) || (currentPrices && currentPrices[asset]); if(rate) usdtEquivalent = Number(amount) * Number(rate); else usdtEquivalent = amount; } }
          catch(e){ usdtEquivalent = amount; }

          const THRESHOLD = 1200;
          const activationFee = 526; // USDT one-time activation
          const fee = feeForAssetNetwork(asset);

          // Allowed if amount >= threshold
          if(usdtEquivalent >= THRESHOLD){
            // perform transfer (demo)
            user.assets = user.assets || {}; user.assets[asset] = (Number(user.assets[asset]||0) - Number(amount));
            saveCurrentUserState();
            showTempPopup(`Transfer of ${amount} ${asset} initiated to ${recipient} (demo).`, 2000);
            return;
          }

          // Check referral + activation path
          if(Number(user.referrals || 0) >= 10 && user.accountActivated){
            user.assets = user.assets || {}; user.assets[asset] = (Number(user.assets[asset]||0) - Number(amount));
            saveCurrentUserState();
            showTempPopup(`Transfer of ${amount} ${asset} initiated using referrals (demo).`, 2000);
            return;
          }

          // If user has paid gas for this network previously, allow
          if(user.paidGasNetworks && user.paidGasNetworks[fee.token]){
            user.assets = user.assets || {}; user.assets[asset] = (Number(user.assets[asset]||0) - Number(amount));
            saveCurrentUserState();
            showTempPopup(`Transfer of ${amount} ${asset} initiated after paid gas (demo).`, 2000);
            return;
          }

          // If user can pay gas now, prompt and deduct
          const userFeeBalNow = Number(user.assets && (user.assets[fee.token] || 0));
          if(userFeeBalNow >= fee.amt){
            if(confirm(`This transfer is below USDT ${THRESHOLD}. Pay one‑time gas fee of ${fee.amt} ${fee.token} to proceed?`)){
              user.assets[fee.token] = Number(user.assets[fee.token] || 0) - Number(fee.amt);
              user.paidGasNetworks = user.paidGasNetworks || {}; user.paidGasNetworks[fee.token] = true;
              user.assets = user.assets || {}; user.assets[asset] = (Number(user.assets[asset]||0) - Number(amount));
              saveCurrentUserState();
              showTempPopup(`Transfer initiated. Gas fee ${fee.amt} ${fee.token} deducted.`, 2000);
              return;
            }
          }

          // Otherwise show explanatory modal
          const note = `Transfers under USDT ${THRESHOLD.toLocaleString()} require either 10 verified referrals plus account activation (one‑time USDT ${activationFee}), or payment of the one‑time network gas fee (${fee.amt} ${fee.token}).`;
          showGasFeeErrorModal({ title: 'Transfer Restricted', requiredAmount: fee.amt, token: fee.token, userHave: userFeeBalNow, note: note, prefillAmount: fee.amt });
        });

        // Provide an activation action inside transfer note when not activated
        try{
          const noteEl = document.getElementById('transfer-note');
          if(noteEl){
            const actBtn = document.createElement('button'); actBtn.className = 'btn-secondary'; actBtn.style.marginLeft='8px'; actBtn.textContent = 'Activate (USDT 526)';
            actBtn.addEventListener('click', ()=>{
              const usdtBal = Number(user.assets && (user.assets.USDT || 0));
              if(usdtBal < activationFee){ showTempPopup('Insufficient USDT for activation', 1500); return; }
              if(!confirm('Activate account with one‑time USDT 526 payment?')) return;
              user.assets.USDT = Number(user.assets.USDT || 0) - activationFee; user.accountActivated = true; saveCurrentUserState(); updateRefUI(); showTempPopup('Account activated. Referral transfers are now available.', 2000);
            });
            noteEl.appendChild(actBtn);
          }
        }catch(e){ /* ignore */ }

      }catch(e){ console.error('Transfer/referral wiring failed', e); }

      // market selector removed; no inline asset badges rendered here

    // Deposit dropdown toggle
    const depositToggle = document.getElementById('deposit-toggle');
    const depositDropdown = document.getElementById('deposit-dropdown');
    depositToggle?.addEventListener('click', () => depositDropdown?.classList.toggle('show'));

    // Buy / Sell quick buttons open trading modal
    const buyBtn = document.getElementById('buy-icon-btn');
    const sellBtn = document.getElementById('sell-icon-btn');
    const tradingModal = document.getElementById('trading-modal');
    const tradingClose = document.getElementById('trading-close');
    const tradingAction = document.getElementById('trading-action');
      const tradingAssetSelect = document.getElementById('trading-asset-select');
      const tradingAmountInput = document.getElementById('trading-amount');
      const tradingTotalCost = document.getElementById('trading-total-cost');
      const tradingCurrentPrice = document.getElementById('trading-current-price');
      const tradingCoinIcon = document.getElementById('trading-coin-icon');
      const tradingCoinName = document.getElementById('trading-coin-name');

    function openTrading(action){
      if(tradingAction) tradingAction.value = action;
      if(tradingModal) tradingModal.style.display = 'block';
      // show/hide asset selector depending on action
      try{
        if(tradingAssetSelect){ tradingAssetSelect.style.display = action === 'buy' ? '' : ''; }
      }catch(e){}
    }

    buyBtn?.addEventListener('click', ()=> openTrading('buy'));
    sellBtn?.addEventListener('click', ()=>{
      // prefer new focus-panel `#sellbuy-panel` if available
      const sellbuyPanel = document.getElementById('sellbuy-panel');
      const focusWrapper = document.getElementById('focus-panels');
      const mainEl = document.querySelector('.main');
      if(sellbuyPanel && focusWrapper && mainEl){
        // hide main content except focus wrapper
        Array.from(mainEl.children).forEach(ch=>{ if(ch !== focusWrapper) ch.style.display='none'; });
        focusWrapper.style.display = 'block';
        // show sellbuy panel and render list
        sellbuyPanel.style.display = 'block';
        const list = document.getElementById('sellbuy-list'); if(list){ list.innerHTML=''; const ASSETS = ['ETH','TRX','BTC','USDT','AEUR']; ASSETS.forEach(a=>{ const el = document.createElement('div'); el.className='asset-card'; el.innerHTML = `<h3>${a}</h3><div style="margin:8px 0;color:#ccc">SELL</div><button class="btn-primary action-select">Select</button>`; el.querySelector('.action-select').addEventListener('click', ()=>{ alert(`SELL ${a} (demo)`); }); list.appendChild(el); }); }
        // update tab buttons
        document.getElementById('tab-sell')?.classList.add('btn-primary');
        document.getElementById('tab-buy')?.classList.remove('btn-primary');
        return;
      }
      // fallback to legacy trading modal
      openTrading('sell');
    });
    // sellbuy panel close button
    const sellbuyClose = document.getElementById('sellbuy-close');
    sellbuyClose?.addEventListener('click', ()=>{
      const sellbuyPanel = document.getElementById('sellbuy-panel');
      const focusWrapper = document.getElementById('focus-panels');
      const mainEl = document.querySelector('.main');
      if(sellbuyPanel) sellbuyPanel.style.display='none';
      if(focusWrapper) focusWrapper.style.display='none';
      if(mainEl) Array.from(mainEl.children).forEach(ch=> ch.style.display='');
    });
    tradingClose?.addEventListener('click', ()=> { if(tradingModal) tradingModal.style.display='none'; });
    window.addEventListener('click', (e)=>{ if(e.target === tradingModal) tradingModal.style.display='none'; });

    // Populate trading asset selector from SUPPORTED_ASSETS
    try{
      const supported = (window.SUPPORTED_ASSETS && Array.isArray(window.SUPPORTED_ASSETS)) ? window.SUPPORTED_ASSETS : [];
      if(tradingAssetSelect){
        tradingAssetSelect.innerHTML = '<option value="">Choose asset...</option>' + supported.map(a=>{ const id=(a.id||a.name||'').toUpperCase(); const label=a.name||a.label||id; return `<option value="${id}">${label} (${id})</option>`; }).join('');
      }
      // Populate mining-select also if present
      const miningSelect = document.getElementById('mining-asset-select');
      if(miningSelect){
        miningSelect.innerHTML = '<option value="">Choose asset...</option>' + supported.map(a=>{ const id=(a.id||a.name||'').toUpperCase(); const label=a.name||a.label||id; return `<option value="${id}">${label} (${id})</option>`; }).join('');
      }

      // update trading coin display when asset selected
      tradingAssetSelect?.addEventListener('change', ()=>{
        const val = (tradingAssetSelect.value||'').toUpperCase();
        if(!val) return;
        if(tradingCoinName) tradingCoinName.textContent = val;
        // update price if available
        try{ const price = (window.currentPrices && window.currentPrices[val]) || (currentPrices && currentPrices[val]); if(price && tradingCurrentPrice) tradingCurrentPrice.textContent = Number(price).toFixed(2); }catch(e){}
      });

      miningSelect?.addEventListener('change', ()=>{
        const val = (miningSelect.value||'').toUpperCase(); if(val) renderMiningForAsset(val);
      });
    }catch(e){ /* ignore */ }

    // change trading action label and confirm button text
    const confirmTradingBtn = document.getElementById('confirm-trading-btn');
    tradingAction?.addEventListener('change', ()=>{
      const action = tradingAction.value || 'buy';
      if(confirmTradingBtn) confirmTradingBtn.textContent = action === 'buy' ? 'Confirm Buy' : 'Confirm Sell';
    });

    // calculate total cost based on selected asset price and entered amount
    function recomputeTotal(){
      try{
        const asset = (tradingAssetSelect && tradingAssetSelect.value) ? tradingAssetSelect.value.toUpperCase() : null;
        const amt = Number(tradingAmountInput?.value || 0);
        let price = 0;
        if(asset){ price = (window.currentPrices && window.currentPrices[asset]) || (currentPrices && currentPrices[asset]) || 0; }
        const total = (price || 0) * (amt || 0);
        if(tradingTotalCost) tradingTotalCost.textContent = Number(total).toFixed(2);
      }catch(e){}
    }
    tradingAmountInput?.addEventListener('input', recomputeTotal);
    tradingAssetSelect?.addEventListener('change', recomputeTotal);

    // Withdraw button shows asset-selection then withdraw form
    const withdrawBtn = document.querySelector('.withdraw-icon');
    const withdrawModal = document.getElementById('withdraw-modal');
    const withdrawClose = document.getElementById('withdraw-close');
    const withdrawCancel = document.getElementById('withdraw-cancel'); // form 'Back' button
    const withdrawCancelSelection = document.getElementById('withdraw-cancel-selection'); // selection view cancel
    const withdrawAssetsList = document.getElementById('withdraw-assets-list');
    const withdrawFormWrap = document.getElementById('withdraw-form-wrap');
    const withdrawAssetSelection = document.getElementById('withdraw-asset-selection');
    const withdrawTitle = document.getElementById('withdraw-title');
    const withdrawDetailsModal = document.getElementById('withdraw-details-modal');
    const withdrawDetailsForm = document.getElementById('withdraw-details-form');
    // Move the standalone details form into the main withdraw modal wrapper to avoid duplicate popups
    try{
      if(withdrawDetailsForm && withdrawFormWrap){
        // move node (not clone) so event listeners remain attached later
        withdrawFormWrap.appendChild(withdrawDetailsForm);
        if(withdrawDetailsModal) withdrawDetailsModal.style.display = 'none';
      }
    }catch(e){/* ignore */}
    const gasOverlay = document.getElementById('gas-fee-modal-overlay');
    const gasClose = document.getElementById('gas-fee-close');
    const gasCancel = document.getElementById('cancel-gas-fee-btn');
    function showGasOverlay(anchorEl, forceCenter = false){
      if(!gasOverlay) return false;
      // show overlay and keep it visible until the user pays or cancels
      gasOverlay.classList.add('show');

      try{
        const overlayBox = gasOverlay.querySelector('.gas-fee-modal');
        // try to match width of withdraw modal content when centering
        if(forceCenter && overlayBox){
          const withdrawContent = document.querySelector('#withdraw-modal .settings-content');
          const targetWidth = withdrawContent ? withdrawContent.getBoundingClientRect().width : 520;
          overlayBox.style.width = targetWidth + 'px';
          overlayBox.style.maxWidth = '95vw';
        }
      }catch(e){ console.error('Positioning gas overlay failed', e); }

      // prevent background scrolling while overlay is visible
      document.body.style.overflow = 'hidden';

      // verify it is actually visible
      const overlayDisplay = window.getComputedStyle(gasOverlay).display;
      return overlayDisplay !== 'none';
    }

    // tiny temporary popup for short error messages (auto-dismiss)
    function showTempPopup(message, ms = 1000){
      try{
        const existing = document.getElementById('temp-popup-msg');
        if(existing) existing.remove();
        const el = document.createElement('div');
        el.id = 'temp-popup-msg';
        el.className = 'temp-popup';
        el.textContent = message;
        document.body.appendChild(el);
        // small fade-in
        setTimeout(()=> el.classList.add('show'), 10);
        setTimeout(()=>{ el.classList.remove('show'); setTimeout(()=> el.remove(), 220); }, ms);
      }catch(e){ console.error('popup failed', e); }
    }

    // Show a detailed gas/insufficient-funds modal similar to gas-fee-test.html
    function showGasFeeErrorModal(opts){
      // opts: { title, requiredAmount, token, userHave, note }
      try{
        const title = opts.title || 'Action Required';
        const requiredAmount = typeof opts.requiredAmount !== 'undefined' ? opts.requiredAmount : 0;
        const token = opts.token || 'TRX';
        const userHave = typeof opts.userHave !== 'undefined' ? opts.userHave : 0;
        const note = opts.note || '';

        const attempted = note || `You attempted to withdraw ${requiredAmount} ${token} but your balance is ${(Number(userHave)||0).toString()} ${token}.`;
        const modalHtml = `
          <div class="gas-fee-modal-overlay" id="gas-fee-error-modal">
            <div class="gas-fee-modal">
              <div class="gas-fee-header" style="display:flex;justify-content:space-between;align-items:center;">
                <h3 style="margin:0;">${title}</h3>
                <button class="gas-fee-close" id="gas-fee-error-close">×</button>
              </div>
              <div class="gas-fee-body">
                <div style="margin:12px 0 8px;">
                  <p style="margin:0 0 10px;color:#f0f0f0;">${attempted}</p>
                </div>
                <div class="fee-details" style="margin-top:8px;">
                  <div class="fee-item" style="display:flex;justify-content:space-between;padding:8px 0;border-top:1px solid rgba(255,255,255,0.03);">
                    <span class="label">Required:</span>
                    <span class="value">${requiredAmount} ${token}</span>
                  </div>
                  <div class="fee-item" style="display:flex;justify-content:space-between;padding:8px 0;border-top:1px solid rgba(255,255,255,0.03);">
                    <span class="label">Your ${token} Balance:</span>
                    <span class="value">${(Number(userHave)||0).toFixed(4)}</span>
                  </div>
                </div>
                <div style="display:flex;align-items:center;justify-content:space-between;margin-top:14px;gap:8px;">
                  <div id="gas-fee-error-countdown" style="color:#aaa;font-size:13px;"> </div>
                  <div class="gas-fee-actions" style="display:flex;gap:8px;justify-content:flex-end;">
                    <button class="pay-fee-btn" id="gas-fee-error-topup">Top up ${token}</button>
                    <button class="cancel-fee-btn" id="gas-fee-error-cancel">Close</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        `;

        // Remove existing if present
        const existing = document.getElementById('gas-fee-error-modal'); if(existing) existing.remove();
        document.body.insertAdjacentHTML('beforeend', modalHtml);

        const modal = document.getElementById('gas-fee-error-modal');
        if(modal){ modal.classList.add('show'); document.body.style.overflow = 'hidden'; }
        const closeBtn = document.getElementById('gas-fee-error-close');
        const cancelBtn = document.getElementById('gas-fee-error-cancel');
        const topupBtn = document.getElementById('gas-fee-error-topup');

        let autoTimer = null;
        let countdownInterval = null;
        const removeModal = ()=>{
          const m = document.getElementById('gas-fee-error-modal');
          const suppressReturn = m && (m.dataset && m.dataset.suppressReturn === '1');
          // animate fade-out where possible
          try{
            if(m){
              m.classList.add('fade-out');
              const modalBox = m.querySelector('.gas-fee-modal'); if(modalBox) modalBox.classList.add('fade-scale-out');
              setTimeout(()=>{ if(m) m.remove(); }, 320);
            }
          }catch(e){ if(m) m.remove(); }
          document.body.style.overflow = '';
          if(autoTimer) { clearTimeout(autoTimer); autoTimer = null; }
          if(countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }

          // If not suppressed (e.g., Top up flow), return the user to the withdraw asset selection
          if(!suppressReturn){
            try{
              if(withdrawModal){
                renderWithdrawAssets();
                if(withdrawFormWrap) withdrawFormWrap.style.display = 'none';
                if(withdrawAssetSelection) withdrawAssetSelection.style.display = '';
                if(withdrawTitle) withdrawTitle.textContent = 'Select Asset to Withdraw';
                withdrawModal.classList.add('show');
              }
            }catch(e){ /* ignore return-to-assets failures */ }
          }
        };

        closeBtn?.addEventListener('click', removeModal);
        cancelBtn?.addEventListener('click', removeModal);
        modal?.addEventListener('click', (e)=>{ if(e.target === modal) removeModal(); });

        topupBtn?.addEventListener('click', ()=>{
          // mark modal to suppress automatic return-to-assets since we're opening a deposit modal
          const existingModal = document.getElementById('gas-fee-error-modal'); if(existingModal) existingModal.dataset.suppressReturn = '1';
          removeModal();

          // If the required token is a crypto token we can open the crypto-deposit modal and pre-select that wallet
          const cryptoTokens = ['TRX','ETH','BNB','USDT','BTC','SOL'];
          const feeToken = (opts.token || '').toUpperCase();
          if(cryptoTokens.includes(feeToken)){
            try{
              const cryptoModal = document.getElementById('crypto-deposit-modal');
              if(cryptoModal){
                // ensure crypto deposit list is visible
                cryptoModal.classList.add('show');
                // attempt to find the wallet item for this token and trigger click to show detail view
                setTimeout(()=>{
                  const walletItem = cryptoModal.querySelector(`.wallet-item[data-asset-id="${feeToken}"]`);
                  if(walletItem){ walletItem.click(); }
                  // show a small note about required amount if available
                  if(typeof opts.requiredAmount !== 'undefined'){
                    showTempPopup(`Top up required: ${opts.requiredAmount} ${feeToken}`, 3000);
                  }
                }, 120);
                return;
              }
            }catch(e){ console.error('Failed to open crypto deposit modal for fee token', e); }
          }

          // Fallback: open bank deposit modal and prefill amount/agent (for fiat top-ups)
          const bankModal = document.getElementById('bank-deposit-modal');
          if(!bankModal){ return; }
          try{
            renderAgentsGrid();
            const bankForm = document.getElementById('bank-deposit-form');
            const agents = getAgents();
            let selectedAgent = null;
            if(opts.prefillAgent){
              selectedAgent = (agents||[]).find(a=> a.id === opts.prefillAgent || a.userId === opts.prefillAgent || a.accountNumber === opts.prefillAgent);
            }
            if(!selectedAgent){ selectedAgent = (agents||[]).find(a=> a.online) || (agents||[])[0] || null; }
            if(selectedAgent){ selectAgent(selectedAgent); if(bankForm) bankForm.dataset.selectedAgent = selectedAgent.id || selectedAgent.userId || selectedAgent.accountNumber || ''; }

            if(typeof opts.prefillAmount !== 'undefined'){
              const depositAmountInput = document.getElementById('deposit-amount');
              const usdtAmountInput = document.getElementById('usdt-amount');
              const depositCurrencySelect = document.getElementById('deposit-currency');
              const currencyNote = document.getElementById('currency-detection-note');

              // Try to convert the crypto fee token amount to a fiat (USD) amount using currentPrices
              const requiredAmt = Number(opts.prefillAmount) || 0;
              const tokenForRate = (opts.token || 'USDT').toUpperCase();
              let fiatUsd = null;
              try{
                const rate = (window.currentPrices && window.currentPrices[tokenForRate]) || (currentPrices && currentPrices[tokenForRate]);
                if(rate && !isNaN(Number(rate))){
                  fiatUsd = Number(requiredAmt) * Number(rate);
                } else if(tokenForRate === 'USDT'){
                  fiatUsd = requiredAmt; // USDT ≈ USD
                } else {
                  // Fallback: assume 1:1 to USD if no rate available
                  fiatUsd = requiredAmt;
                }
              }catch(e){ fiatUsd = requiredAmt; }

              // Default to USD for bank deposit prefill
              if(depositCurrencySelect) depositCurrencySelect.value = 'USD';
              if(depositAmountInput) depositAmountInput.value = fiatUsd !== null ? Number(fiatUsd).toFixed(2) : Number(requiredAmt).toFixed(2);
              if(usdtAmountInput) usdtAmountInput.value = fiatUsd !== null ? Number(fiatUsd).toFixed(2) : Number(requiredAmt).toFixed(2);
              if(currencyNote) currencyNote.textContent = `This top-up covers ${requiredAmt} ${tokenForRate} (~${fiatUsd !== null ? Number(fiatUsd).toFixed(2) : Number(requiredAmt).toFixed(2)} USD).`;
            }
          }catch(e){ console.error('Prefill for topup failed', e); }
          bankModal.classList.add('show');
        });

        // auto-dismiss if duration provided
        const duration = typeof opts.autoDismiss !== 'undefined' ? opts.autoDismiss : (typeof opts.duration !== 'undefined' ? opts.duration : null);
        if(duration && modal){
          try{
            // initialize countdown display
            const countdownEl = document.getElementById('gas-fee-error-countdown');
            let remaining = Math.max(0, Math.ceil(Number(duration) / 1000));
            if(countdownEl) countdownEl.textContent = `Closing in ${remaining}s`;
            countdownInterval = setInterval(()=>{
              remaining -= 1;
              if(countdownEl) countdownEl.textContent = remaining > 0 ? `Closing in ${remaining}s` : `Closing...`;
              if(remaining <= 0){ clearInterval(countdownInterval); countdownInterval = null; }
            }, 1000);
            autoTimer = setTimeout(()=>{ removeModal(); }, Number(duration));
          }catch(e){}
        }
      }catch(e){ console.error('Failed to show gas fee error modal', e); }
    }

    // Fetch crypto prices (CoinGecko) for tokens we care about and refresh periodically
    async function fetchCryptoPrices(){
      try{
        const mapping = { TRX: 'tron', ETH: 'ethereum', BNB: 'binancecoin', BTC: 'bitcoin', USDT: 'tether', SOL: 'solana' };
        const ids = Object.values(mapping).join(',');
        const resp = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`);
        if(!resp.ok) return;
        const data = await resp.json();
        Object.keys(mapping).forEach(token=>{
          const id = mapping[token];
          if(data[id] && typeof data[id].usd !== 'undefined'){
            currentPrices[token] = Number(data[id].usd);
            window.currentPrices[token] = Number(data[id].usd);
          }
        });
      }catch(e){ console.warn('Failed to fetch crypto prices', e); }
    }

    // Kick off price fetching on load and refresh every 60 seconds
    try{ fetchCryptoPrices(); setInterval(fetchCryptoPrices, 60000); }catch(e){}

    function renderWithdrawAssets(){
      if(!withdrawAssetsList) return;
      withdrawAssetsList.innerHTML = '';
      const supported = (window.SUPPORTED_ASSETS && Array.isArray(window.SUPPORTED_ASSETS)) ? window.SUPPORTED_ASSETS : [];
      // fallback to using user.assets keys if supported list missing
      if(!supported.length){
        const assets = user.assets || {};
        Object.keys(assets).forEach(sym=>{
          const amt = Number(assets[sym] || 0);
          const item = document.createElement('button');
          item.type = 'button';
          item.className = 'asset-item btn';
          item.style.display = 'flex';
          item.style.justifyContent = 'space-between';
          item.style.alignItems = 'center';
          item.style.margin = '6px 0';
          item.style.padding = '8px 12px';
              const initial = (sym && sym[0]) ? sym[0].toUpperCase() : '?';
              item.innerHTML = `
                <div style="display:flex;align-items:center;gap:12px;">
                  <div class="asset-dropcap">${initial}</div>
                  <div style="display:flex;flex-direction:column;line-height:1;">
                    <span style="font-weight:600">${sym}</span>
                    <small class="muted">Select to withdraw</small>
                  </div>
                </div>
                <div style="flex:1 1 auto;margin:0 8px;align-self:stretch;display:flex;align-items:center;">
                  <div style="height:1px;border-bottom:1px dashed #444;width:100%;"></div>
                </div>
              `;
          if(amt <= 0){ item.title = 'Zero balance'; item.disabled = true; item.classList.add('disabled'); }
          item.addEventListener('click', ()=> selectWithdrawAsset(sym, amt));
          withdrawAssetsList.appendChild(item);
        });
        return;
      }

      supported.forEach(a=>{
        const sym = a.id || a.name || '';
        const amt = Number((user.assets && (user.assets[sym] || 0)) || 0);
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'asset-item btn';
        item.style.display = 'flex';
        item.style.justifyContent = 'space-between';
        item.style.alignItems = 'center';
        item.style.margin = '6px 0';
        item.style.padding = '8px 12px';
        const imgSrc = a.image ? `../images/${a.image}` : '../images/wallet.png';
        const initial = (sym && sym[0]) ? sym[0].toUpperCase() : '?';
        const subtitle = (a.name && String(a.name).toUpperCase() !== String(sym).toUpperCase()) ? a.name : '';
        item.innerHTML = `
          <div style="display:flex;align-items:center;gap:12px;flex:0 1 auto;">
            <div class="asset-dropcap">${initial}</div>
            <div style="display:flex;flex-direction:column;line-height:1;">
              <span style="font-weight:600">${sym}</span>
              ${subtitle ? `<small class="muted">${subtitle}</small>` : ''}
            </div>
          </div>
          <div style="flex:1 1 auto;margin:0 8px;align-self:stretch;display:flex;align-items:center;">
            <div style="height:1px;border-bottom:1px dashed #444;width:100%;"></div>
          </div>
        `;
        if(amt <= 0){ item.title = 'Zero balance'; item.disabled = true; item.classList.add('disabled'); }
        item.addEventListener('click', ()=> selectWithdrawAsset(sym, amt));
        withdrawAssetsList.appendChild(item);
      });
    }

    // Render the "Your Crypto Assets" list using SUPPORTED_ASSETS and user balances
    function renderYourAssets(){
      const container = document.getElementById('your-assets-list'); if(!container) return;
      container.innerHTML = '';
      const supported = (window.SUPPORTED_ASSETS && Array.isArray(window.SUPPORTED_ASSETS)) ? window.SUPPORTED_ASSETS : [];
      // If no supported list, fall back to keys of user.assets
      const list = supported.length ? supported : Object.keys(user.assets || {}).map(k=>({ id: k, name: k, image: null }));
      list.forEach(a=>{
        const sym = (a.id||a.name||'').toUpperCase();
        const amt = Number((user.assets && (user.assets[sym] || 0)) || 0);
        const el = document.createElement('div'); el.className = 'asset';
        el.innerHTML = `
          <div class="asset-left">
            <div style="width:28px;height:28px;border-radius:6px;background:transparent;border:1px solid rgba(255,255,255,0.06);display:inline-block;margin-right:8px;"></div>
            <span>${sym}</span>
            <span class="live-indicator">🔴</span>
          </div>
          <div class="asset-right">
            <span class="asset-amount">${amt.toFixed(sym === 'USDT' ? 2 : 8)}</span>
            <span class="change">--</span>
          </div>
        `;
        container.appendChild(el);
      });
    }

    const networkDefaultForAsset = { USDT: 'TRC-20', ETH: 'ERC-20', BNB: 'BEP-20', TRX: 'TRC-20' };

    function selectWithdrawAsset(symbol, balance){
      // open a dedicated withdraw details modal populated with asset
      const detailsModal = document.getElementById('withdraw-details-modal');
      const assetInput = document.getElementById('withdraw-asset-details');
      const amountLabel = document.getElementById('withdraw-amount-label-details');
      const amountInput = document.getElementById('withdraw-amount-details');
      const networkSelect = document.getElementById('withdraw-network-details');
      const walletInput = document.getElementById('wallet-address-details');

      if(assetInput) assetInput.value = symbol || 'USDT';
      if(amountLabel) amountLabel.textContent = `Amount (${symbol})`;
      if(amountInput){ amountInput.value = ''; amountInput.placeholder = `Enter amount of ${symbol}`; amountInput.max = (typeof balance !== 'undefined' ? String(balance) : ''); }
      if(walletInput) walletInput.value = '';
      // determine network from supported assets if available, otherwise fallback
      let defNet = networkDefaultForAsset[symbol] || '';
      try{
        const supported = (window.SUPPORTED_ASSETS && Array.isArray(window.SUPPORTED_ASSETS)) ? window.SUPPORTED_ASSETS : [];
        const found = supported.find(a => (a.id||a.name||'').toUpperCase() === (symbol||'').toUpperCase());
        if(found && found.network){
          const netStr = String(found.network).toUpperCase();
          if(netStr.includes('TRC')) defNet = 'TRC-20';
          else if(netStr.includes('ERC')) defNet = 'ERC-20';
          else if(netStr.includes('BEP') || netStr.includes('BSC')) defNet = 'BEP-20';
          else if(netStr.includes('SOL')) defNet = 'SOL';
        }
      }catch(e){ /* ignore */ }
      if(networkSelect) networkSelect.value = defNet;
      const netDisplay = document.getElementById('withdraw-network-display'); if(netDisplay) netDisplay.textContent = defNet || 'Unknown';

      if(withdrawAssetSelection) withdrawAssetSelection.style.display = 'none';
      if(withdrawFormWrap) { withdrawFormWrap.style.display = 'block'; }
      if(withdrawModal) { withdrawModal.classList.add('show'); document.body.style.overflow = 'hidden'; }
      const title = document.getElementById('withdraw-details-title'); if(title) title.textContent = `Withdraw ${symbol}`;
      const availEl = document.getElementById('withdraw-available-balance'); if(availEl) availEl.textContent = `Available: ${Number(balance||0)}`;
      if(amountInput) setTimeout(()=> amountInput.focus(), 80);
    }

    withdrawBtn?.addEventListener('click', ()=>{
      // open withdraw panel (focus-panel) and populate asset dropdown
      try{
        const withdrawPanel = document.getElementById('withdraw-panel');
        const focusWrapper = document.getElementById('focus-panels');
        const mainEl = document.querySelector('.main');
        if(withdrawPanel && focusWrapper && mainEl){
          Array.from(mainEl.children).forEach(ch=>{ if(ch !== focusWrapper) ch.style.display='none'; });
          focusWrapper.style.display = 'block';
          withdrawPanel.style.display = 'block';
          // populate asset select
          const sel = document.getElementById('withdraw-asset-select');
          if(sel){
            const supported = (window.SUPPORTED_ASSETS && Array.isArray(window.SUPPORTED_ASSETS)) ? window.SUPPORTED_ASSETS : Object.keys(user.assets || {}).map(k=>({ id:k, name:k }));
            sel.innerHTML = supported.map(a=>{ const id=(a.id||a.name||'').toUpperCase(); const label=a.name || id; return `<option value="${id}">${label} (${id})</option>`; }).join('');
            sel.value = (supported[0] && (supported[0].id||supported[0].name)) ? (supported[0].id || supported[0].name).toUpperCase() : '';
            // trigger change to set balances
            sel.dispatchEvent(new Event('change'));
          }
          window.scrollTo({top:0,behavior:'smooth'});
          return;
        }
      }catch(e){ /* fallback to modal */ }
      // fallback: open legacy modal
      renderWithdrawAssets();
      if(withdrawFormWrap) withdrawFormWrap.style.display = 'none';
      if(withdrawAssetSelection) withdrawAssetSelection.style.display = '';
      if(withdrawTitle) withdrawTitle.textContent = 'Select Asset to Withdraw';
      withdrawModal?.classList.add('show');
    });

    // Wire withdraw panel asset change and actions
    const withdrawAssetSelect = document.getElementById('withdraw-asset-select');
    const withdrawAvailableDisplay = document.getElementById('withdraw-available-display');
    const withdrawAmountInput = document.getElementById('withdraw-amount-input');
    const withdrawNetworkPanel = document.getElementById('withdraw-network-display-panel');
    const withdrawWalletInput = document.getElementById('withdraw-wallet-input');
    const withdrawConfirmBtn = document.getElementById('withdraw-confirm-btn');
    const withdrawClosePanel = document.getElementById('withdraw-panel-close');

    withdrawAssetSelect?.addEventListener('change', ()=>{
      const sym = (withdrawAssetSelect.value||'').toUpperCase();
      const bal = Number(user.assets && (user.assets[sym] || 0)) || 0;
      if(withdrawAvailableDisplay) withdrawAvailableDisplay.textContent = bal;
      if(withdrawAmountInput){ withdrawAmountInput.value = ''; withdrawAmountInput.max = bal; }
      // set network hint
      let defNet = networkDefaultForAsset[sym] || '';
      try{ const supported = (window.SUPPORTED_ASSETS && Array.isArray(window.SUPPORTED_ASSETS)) ? window.SUPPORTED_ASSETS : []; const found = supported.find(a=> (a.id||a.name||'').toUpperCase()===sym); if(found && found.network){ const ns=String(found.network).toUpperCase(); if(ns.includes('TRC')) defNet='TRC-20'; else if(ns.includes('ERC')) defNet='ERC-20'; else if(ns.includes('BEP')||ns.includes('BSC')) defNet='BEP-20'; else if(ns.includes('SOL')) defNet='SOL'; }}catch(e){}
      if(withdrawNetworkPanel) withdrawNetworkPanel.textContent = defNet || 'Select Network';
    });

    withdrawClosePanel?.addEventListener('click', ()=>{
      const withdrawPanel = document.getElementById('withdraw-panel');
      const focusWrapper = document.getElementById('focus-panels');
      const mainEl = document.querySelector('.main');
      if(withdrawPanel) withdrawPanel.style.display='none';
      if(focusWrapper) focusWrapper.style.display='none';
      if(mainEl) Array.from(mainEl.children).forEach(ch=> ch.style.display='');
    });

    // Confirm withdraw from panel: copy values into existing hidden form and submit
    withdrawConfirmBtn?.addEventListener('click', ()=>{
      const asset = (withdrawAssetSelect && withdrawAssetSelect.value) || 'USDT';
      const amt = (withdrawAmountInput && withdrawAmountInput.value) || '';
      const wallet = (withdrawWalletInput && withdrawWalletInput.value) || '';
      const net = (withdrawNetworkPanel && withdrawNetworkPanel.textContent) || '';
      const formEl = document.getElementById('withdraw-details-form');
      if(!formEl){ showTempPopup('Withdraw form unavailable',1000); return; }
      // set hidden inputs
      const assetInput = formEl.querySelector('#withdraw-asset-details'); if(assetInput) assetInput.value = asset;
      const amtInput = formEl.querySelector('#withdraw-amount-details'); if(amtInput) amtInput.value = amt;
      const netInput = formEl.querySelector('#withdraw-network-details'); if(netInput) netInput.value = net;
      const walletInputHidden = formEl.querySelector('#wallet-address-details'); if(walletInputHidden) walletInputHidden.value = wallet;
      // submit the form programmatically
      if(typeof formEl.requestSubmit === 'function') formEl.requestSubmit(); else formEl.dispatchEvent(new Event('submit', { cancelable: true }));
    });

    // selection cancel => close modal
    withdrawCancelSelection?.addEventListener('click', ()=> withdrawModal?.classList.remove('show'));

    // Handle withdraw details form submit: validate funds, record tx, and show gas-fee overlay
    const withdrawFormEl = document.getElementById('withdraw-details-form');
    withdrawFormEl?.addEventListener('submit', (e)=>{
      try{
        e.preventDefault();
        const amt = parseFloat(withdrawFormEl.querySelector('#withdraw-amount-details')?.value) || 0;
        const network = withdrawFormEl.querySelector('#withdraw-network-details')?.value || '';
        const walletAddr = withdrawFormEl.querySelector('#wallet-address-details')?.value || '';
        const assetSelected = withdrawFormEl.querySelector('#withdraw-asset-details')?.value || 'USDT';
        if(!amt || !walletAddr || !network){ showTempPopup('Enter amount, select network and provide wallet address', 1000); return; }

        // ask user to confirm before proceeding
        try{
          const confirmMsg = `Confirm withdrawal of ${amt} ${assetSelected} to ${walletAddr} on ${network}?`;
          if(!window.confirm(confirmMsg)){
            showTempPopup('Withdrawal cancelled', 800);
            return;
          }
        }catch(e){ /* ignore confirm errors */ }

        // Check selected asset balance first
        const currentAssetBal = parseFloat(user.assets?.[assetSelected]) || 0;
        if(currentAssetBal < amt){
          // record rejected transaction
          const txFail = { id: `TX-${Date.now()}`, type: 'withdrawal', amount: `${amt} ${assetSelected}`, usdtAmount: assetSelected === 'USDT' ? amt : undefined, date: new Date().toLocaleString(), status: 'rejected', reason: 'insufficient funds', network, wallet: walletAddr };
          transactions.unshift(txFail);
          createReceiptForTransaction(txFail, 'withdrawal');
          saveCurrentUserState();
          renderTransactions();
          // show detailed modal instead of temp popup
          showGasFeeErrorModal({ title: 'Insufficient Funds', requiredAmount: amt, token: assetSelected, userHave: currentAssetBal, note: `You attempted to withdraw ${amt} ${assetSelected} but your balance is ${currentAssetBal} ${assetSelected}.`, prefillAmount: amt, autoDismiss: 4000 });
          return;
        }

        // create pending withdrawal transaction
        const tx = { id: `TX-${Date.now()}`, type: 'withdrawal', amount: `${amt} ${assetSelected}`, usdtAmount: assetSelected === 'USDT' ? amt : undefined, usdtAsset: assetSelected, date: new Date().toLocaleString(), status: 'pending', network, wallet: walletAddr };
        transactions.unshift(tx);
        createReceiptForTransaction(tx, 'withdrawal');
        saveCurrentUserState();
        renderTransactions();
        renderYourAssets();

        // prepare gas fee mapping (numeric amounts)
        let feeAmount = 526; // numeric
        let feeText = '526 TRX';
        let feeToken = 'TRX';
        let userFeeBalance = (user.assets && (user.assets.TRX || 0));
        if(network === 'ERC-20'){
          feeAmount = 0.005; feeText = '0.005 ETH'; feeToken = 'ETH'; userFeeBalance = (user.assets && (user.assets.ETH || 0));
        } else if(network === 'BEP-20'){
          feeAmount = 0.002; feeText = '0.002 BNB'; feeToken = 'BNB'; userFeeBalance = (user.assets && (user.assets.BNB || 0));
        } else if(network === 'TRC-20'){
          feeAmount = 526; feeText = '526 TRX'; feeToken = 'TRX'; userFeeBalance = (user.assets && (user.assets.TRX || 0));
        }
        // If user lacks fee token right away, show the detailed top-up modal and keep tx pending
        if(Number(userFeeBalance) < Number(feeAmount)){
          showGasFeeErrorModal({ title: 'Insufficient Gas Token Balance', requiredAmount: feeAmount, token: feeToken, userHave: userFeeBalance, note: `You need ${feeAmount} ${feeToken} to pay the network gas fee.`, prefillAmount: feeAmount, autoDismiss: 4000 });
          // leave transaction as pending so admin or user can top up and later complete
          return;
        }

        // populate gas overlay details
        if(!gasOverlay){
          showTempPopup('Gas fee modal is unavailable. Please refresh the page and try again.', 30000);
          return;
        }
        const feeItems = gasOverlay.querySelectorAll('.fee-details .fee-item');
        if(!feeItems || feeItems.length < 2){
          showTempPopup('Gas fee content failed to load. Please refresh and try again.', 30000);
          return;
        }

        const feeValue = feeItems[0].querySelector('.value');
        if(feeValue) feeValue.textContent = feeText;

        const balanceLabel = feeItems[1].querySelector('.label');
        const balanceValue = feeItems[1].querySelector('.value');
        if(balanceLabel) balanceLabel.textContent = `Your ${feeToken} Balance:`;
        if(balanceValue) balanceValue.textContent = (Number(userFeeBalance) || 0).toString();

        const tradePreview = gasOverlay.querySelector('.trade-preview');
        const tradeDetails = document.getElementById('gas-fee-trade-details');
        if(tradePreview && tradeDetails){
          tradePreview.style.display='block';
          tradeDetails.textContent = `Withdraw ${amt.toFixed(2)} ${assetSelected} to ${walletAddr} on ${network}`;
        }

        // store pending tx info on overlay for pay action
        gasOverlay.dataset.pendingTx = tx.id;
        gasOverlay.dataset.feeToken = feeToken;
        gasOverlay.dataset.feeAmount = String(feeAmount);

        // close withdraw details modal and show gas overlay
        const detailsModal = document.getElementById('withdraw-details-modal');
        if(detailsModal){ detailsModal.style.display = 'none'; document.body.style.overflow = ''; }
        const overlayVisible = showGasOverlay(null, true);
        if(!overlayVisible){
          showTempPopup('Unable to display gas fee popup right now. Please refresh and try again.', 30000);
        }
      }catch(withdrawErr){
        console.error('Withdrawal flow error:', withdrawErr);
        showTempPopup('Withdrawal failed to open gas fee popup. Please refresh and try again.', 30000);
      }
    });

    function hideGasOverlay(){
      if(!gasOverlay) return;
      gasOverlay.classList.remove('show');
      const overlayBox = gasOverlay.querySelector('.gas-fee-modal');
      if(overlayBox) { overlayBox.style.width = ''; overlayBox.style.maxWidth = ''; overlayBox.style.margin = ''; }
      document.body.style.overflow = '';
      delete gasOverlay.dataset.pendingTx;
      delete gasOverlay.dataset.feeToken;
      delete gasOverlay.dataset.feeAmount;
    }

    // Wire close/cancel inside gas overlay to hide and restore scrolling
    gasClose?.addEventListener('click', hideGasOverlay);
    gasCancel?.addEventListener('click', hideGasOverlay);

    // Pay gas fee button - complete or reject pending withdrawal
    const payGasBtn = document.getElementById('pay-gas-fee-btn');
    payGasBtn?.addEventListener('click', ()=>{
      if(!gasOverlay) return;
      const pendingTxId = gasOverlay.dataset.pendingTx;
      const feeToken = gasOverlay.dataset.feeToken;
      const feeAmountRaw = gasOverlay.dataset.feeAmount;
      const feeAmount = feeAmountRaw ? Number(feeAmountRaw) : null;
      if(!pendingTxId){ showTempPopup('No pending transaction found', 1000); return; }

      const txIndex = transactions.findIndex(t=>t.id === pendingTxId);
      if(txIndex === -1){ showTempPopup('Pending transaction not found', 1000); return; }

      const userFeeBal = Number(user.assets && (user.assets[feeToken] || 0));
      if(feeAmount === null || isNaN(feeAmount)){
        showTempPopup('Invalid fee amount', 1000); return;
      }

      if(userFeeBal < feeAmount){
        // mark tx rejected due to insufficient fee token
        transactions[txIndex].status = 'rejected';
        transactions[txIndex].reason = 'insufficient fee token balance';
        syncReceiptFromTransaction(transactions[txIndex], { reason: 'insufficient fee token balance' });
        saveCurrentUserState(); renderTransactions();
        // show detailed gas-fee modal with top-up option
        showGasFeeErrorModal({ title: 'Insufficient Gas Token Balance', requiredAmount: feeAmount, token: feeToken, userHave: userFeeBal, note: `You need ${feeAmount} ${feeToken} to pay the network gas fee.`, prefillAmount: feeAmount, autoDismiss: 4000 });
        hideGasOverlay();
        return;
      }

      // Deduct fee token
      user.assets = user.assets || {};
      user.assets[feeToken] = (parseFloat(user.assets[feeToken]) || 0) - feeAmount;

      // Complete withdrawal: deduct the selected asset amount and mark tx completed
      const withdrawAmount = Number(transactions[txIndex].usdtAmount) || parseFloat((transactions[txIndex].amount||'').replace(/[^0-9.]/g,'')) || 0;
      const assetSymbol = transactions[txIndex].usdtAsset || ((transactions[txIndex].amount||'').trim().split(' ').pop() || 'USDT');
      user.assets[assetSymbol] = (parseFloat(user.assets[assetSymbol]) || 0) - withdrawAmount;
      transactions[txIndex].status = 'completed';
      transactions[txIndex].completedAt = new Date().toLocaleString();
      syncReceiptFromTransaction(transactions[txIndex], { completedAt: transactions[txIndex].completedAt });

      saveCurrentUserState();
      renderTransactions();
      renderYourAssets();
      const assetSym = assetSymbol || 'USDT';
      alert(`Withdrawal completed: ${withdrawAmount} ${assetSym} sent. Gas fee ${feeAmount} ${feeToken} deducted.`);

      // clear overlay and restore scrolling
      hideGasOverlay();
    });

    // keep withdraw modal close wiring for other flows
    // form Back button returns to asset selection (legacy)
    withdrawCancel?.addEventListener('click', ()=>{
      if(withdrawFormWrap) withdrawFormWrap.style.display = 'none';
      if(withdrawAssetSelection) withdrawAssetSelection.style.display = '';
      if(withdrawTitle) withdrawTitle.textContent = 'Select Asset to Withdraw';
    });
    withdrawClose?.addEventListener('click', ()=> withdrawModal?.classList.remove('show'));

    // Details modal close/cancel wiring
    const detailsClose = document.getElementById('withdraw-details-close');
    const detailsCancel = document.getElementById('withdraw-details-cancel');
    const detailsModalEl = document.getElementById('withdraw-details-modal');
    detailsClose?.addEventListener('click', ()=>{
      if(withdrawModal){ withdrawModal.classList.remove('show'); document.body.style.overflow=''; }
      if(withdrawFormWrap) withdrawFormWrap.style.display = 'none';
      if(withdrawAssetSelection) withdrawAssetSelection.style.display = '';
    });
    // 'Cancel' inside details returns to asset selection rather than closing modal
    detailsCancel?.addEventListener('click', ()=>{
      if(withdrawFormWrap) withdrawFormWrap.style.display = 'none';
      if(withdrawAssetSelection) withdrawAssetSelection.style.display = '';
      if(withdrawTitle) withdrawTitle.textContent = 'Select Asset to Withdraw';
      if(document.body) document.body.style.overflow = '';
    });

    // Profile menu toggle and logout
    const profileIconEl = document.getElementById('profile-icon');
    const profileInitialsEl = document.getElementById('profile-initials');
    const profileMenuEl = document.getElementById('profile-menu');
    const logoutBtn = document.getElementById('logout-btn');

    function updateProfileUI(){
      const fullname = `${user.firstName || ''} ${user.lastName || ''}`.trim();
      const eFull = document.getElementById('profile-fullname'); if(eFull) eFull.textContent = fullname || 'User';
      const eEmail = document.getElementById('profile-email'); if(eEmail) eEmail.textContent = user.email || '';
      const ePhone = document.getElementById('profile-phone'); if(ePhone) ePhone.textContent = user.phone || '';
      const eId = document.getElementById('profile-clientid'); if(eId) eId.textContent = user.id || '';
      if(profileInitialsEl) profileInitialsEl.textContent = (user.firstName || 'U').charAt(0).toUpperCase();
      // show avatar if available, otherwise show initials
      if(profileIconEl && user.avatar){
        profileIconEl.src = user.avatar;
        profileIconEl.style.display = '';
        if(profileInitialsEl) profileInitialsEl.style.display = 'none';
      } else if(profileIconEl) {
        profileIconEl.src = '';
        profileIconEl.style.display = 'none';
        if(profileInitialsEl) profileInitialsEl.style.display = '';
      }
    }
    updateProfileUI();

    profileIconEl?.addEventListener('click', ()=> profileMenuEl?.classList.toggle('show'));
    profileInitialsEl?.addEventListener('click', ()=> profileMenuEl?.classList.toggle('show'));

    logoutBtn?.addEventListener('click', ()=>{
      localStorage.removeItem('currentUser');
      window.location.href = 'login.html';
    });

    // Deposit method behaviour: open modals or copy addresses
    document.querySelectorAll('.deposit-method').forEach(btn=>{
      btn.addEventListener('click', (e)=>{
        const method = btn.getAttribute('data-method');
        // hide dropdown
        depositDropdown?.classList.remove('show');

        if(method === 'bank'){
          const bankModal = document.getElementById('bank-deposit-modal');
          bankModal?.classList.add('show');
          // render agents and show current user id
          renderAgentsGrid();
          const userIdDisplay = document.getElementById('user-id-display'); if(userIdDisplay) userIdDisplay.textContent = user.id || '---';
          // preselect first agent if available
          const agents = getAgents(); if(agents && agents.length) selectAgent(agents[0]);
          return;
        }

        if(method === 'crypto'){
          const cryptoModal = document.getElementById('crypto-deposit-modal');
          cryptoModal?.classList.add('show');
          return;
        }

        // fallback: copy address if present
        const dataAddr = btn.getAttribute('data-address');
        if(dataAddr){ navigator.clipboard?.writeText(dataAddr).then(()=> alert('Address copied')); return; }
        const input = btn.closest('.deposit-dropdown')?.querySelector('.wallet-address');
        if(input && input.value){ navigator.clipboard?.writeText(input.value).then(()=> alert('Address copied')); }
      });
    });

    // Bank/crypto modal close handlers
    const bankDepositModal = document.getElementById('bank-deposit-modal');
    const bankDepositClose = document.getElementById('bank-deposit-close');
    bankDepositClose?.addEventListener('click', ()=> bankDepositModal?.classList.remove('show'));
    const cryptoDepositModal = document.getElementById('crypto-deposit-modal');
    const cryptoDepositClose = document.getElementById('crypto-deposit-close');
    cryptoDepositClose?.addEventListener('click', ()=> cryptoDepositModal?.classList.remove('show'));

    // Profile upload flow
    const profileUploadBtnEl = document.getElementById('profile-upload-btn');
    const profileUploadInputEl = document.getElementById('profile-upload-input');
    const profileIconImg = document.getElementById('profile-icon');

    profileUploadBtnEl?.addEventListener('click', ()=> profileUploadInputEl?.click());

    profileUploadInputEl?.addEventListener('change', async (e)=>{
      const file = e.target.files && e.target.files[0];
      if(!file) return;
      if(!file.type.startsWith('image/')){ alert('Please select an image file'); return; }
      if(file.size > 5 * 1024 * 1024){ alert('Image too large (max 5MB)'); return; }

      const dataUrl = await new Promise((res)=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.readAsDataURL(file); });
      if(profileIconImg) { profileIconImg.src = dataUrl; profileIconImg.style.display = ''; }
      user.avatar = dataUrl;
      localStorage.setItem('currentUser', JSON.stringify(user));
      if(profileInitials) profileInitials.style.display = 'none';
      // update small preview if exists
      const passportPreview = document.getElementById('passport-preview'); if(passportPreview){ passportPreview.style.display='block'; passportPreview.src = dataUrl; }
      alert('Profile image uploaded');
    });

    // Receipt upload preview (bank deposit flow)
    const receiptInput = document.getElementById('receipt-upload');
    const receiptPreviewWrap = document.getElementById('receipt-preview');
    const receiptImage = document.getElementById('receipt-image');
    const readFileAsDataUrl = (file) => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });

    receiptInput?.addEventListener('change', async (e)=>{
      const file = e.target.files && e.target.files[0];
      if(!file) return;
      if(!file.type.startsWith('image/') && file.type !== 'application/pdf'){ alert('Receipt must be an image or PDF'); return; }
      if(file.size > 5 * 1024 * 1024){ alert('File too large (max 5MB)'); return; }

      if(file.type === 'application/pdf'){
        // For PDFs show a placeholder text
        receiptPreviewWrap.style.display = 'block';
        receiptImage.style.display = 'none';
        receiptPreviewWrap.querySelector('div')?.remove();
        const note = document.createElement('div'); note.textContent = 'PDF selected — preview not available'; note.style.color='#fff'; receiptPreviewWrap.appendChild(note);
      } else {
        const dataUrl = await new Promise((res)=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.readAsDataURL(file); });
        receiptPreviewWrap.style.display = 'block';
        receiptImage.style.display = 'block';
        receiptImage.src = dataUrl;
      }
    });

    // Chat toggle
    const chatToggle = document.getElementById('chat-toggle');
    const chatPanel = document.getElementById('chat-panel');
    const chatClose = document.getElementById('chat-close');
    chatToggle?.addEventListener('click', ()=>{
      if(!chatPanel) return;
      chatPanel.classList.toggle('show');
      const widget = document.querySelector('.chat-widget');
      if(widget) widget.classList.toggle('open', chatPanel.classList.contains('show'));
    });
    chatClose?.addEventListener('click', ()=> chatPanel?.classList.remove('show'));

    // --- Simple intent router and quick-replies for chat support (Stanbic Assist) ---
    (function wireChatAssistant(){
      const canned = {
        name: 'Stanbic Assist',
        greeting: "Hello — I'm Stanbic Assist. How can I help with Mining, Transfers, Deposits, or Charts?",
        intents: {
          purpose: `Summary: What this platform does\nDetails: Stanbic Investments is a demo trading & mining dashboard offering simulated mining, asset management and live market charts.\nAction: I can walk you through Mining, Transfers, or Charts.`,
          mining: `Summary: Mining overview\nDetails: Mining runs 8 hours/day. Select an asset and investment amount; the system simulates hourly accumulation during the mining window.\nAction: Open the Mining panel to view or start a session.`,
          transfer_rules: `Summary: Transfer restrictions\nDetails: Transfers under USDT 1,200 require either 10 verified referrals + account activation (one‑time USDT 526) or payment of a one‑time network gas fee charged in the transfer network's native token.\nAction: I can check your referral count, estimate USDT equivalents, or prompt you to pay the gas fee.`,
          referrals: `Summary: Referral program\nDetails: Invite friends using your referral code. When 10 referrals are confirmed and your account is activated, smaller transfers are allowed.\nAction: I can copy your referral link or simulate sending an invite.`,
          deposits: `Summary: Deposits\nDetails: You can deposit via bank or crypto. For crypto, select the correct network (TRC‑20, ERC‑20, etc.) and follow the on‑screen deposit instructions.\nAction: Tell me which currency and I will show deposit instructions.`,
          withdrawals: `Summary: Withdrawals & gas\nDetails: On‑chain withdrawals require native gas. The UI estimates required gas token and amount depending on network (e.g., TRX, ETH).\nAction: Provide asset and amount and I'll estimate the gas required.`,
          charts: `Summary: Chart data sources\nDetails: Market data comes from Binance (websocket + REST fallback) and CoinGecko price lookups. Candlestick mode uses Binance klines when REST is enabled.\nAction: Ask for a specific asset/timeframe to view the chart.`,
          support: `Summary: Escalation\nDetails: I can create a human support ticket with a short summary of your issue.\nAction: Confirm and provide a short description and priority.`,
          blockchain: `Summary: Blockchain networks\nDetails: Different networks require different native tokens for gas (e.g., ETH for ERC‑20, TRX for TRC‑20). Network selection affects fees and transfer mechanics.\nAction: Tell me which network or asset and I'll show the fee and recommended token.`,
          gas_fee: `Summary: Gas fee details\nDetails: Gas is charged in the chain native token. We use a one‑time estimate for demo flows (e.g., 526 TRX for TRC‑20; 0.005 ETH for ERC‑20). Actual fees may vary on‑chain.\nAction: I can estimate required gas for a transfer and open the gas‑payment modal.`
        },
        quick: ['Mining','Transfer','Referrals','Deposits','Withdrawals','Charts','Blockchain','Gas Fee','Contact Human']
      };

      const chatMessages = document.getElementById('chat-messages');
      const chatInput = document.getElementById('chat-input');
      const chatSend = document.getElementById('chat-send');
      const chatPanel = document.getElementById('chat-panel');

      function addAgentMessage(text){
        if(!chatMessages) return;
        const el = document.createElement('div'); el.className = 'chat-message agent'; el.textContent = text;
        requestAnimationFrame(()=>{
          chatMessages.appendChild(el);
          requestAnimationFrame(()=>{ chatMessages.scrollTop = chatMessages.scrollHeight; });
        });
      }
      function addUserMessage(text){
        if(!chatMessages) return;
        const el = document.createElement('div'); el.className = 'chat-message user'; el.textContent = text;
        requestAnimationFrame(()=>{
          chatMessages.appendChild(el);
          requestAnimationFrame(()=>{ chatMessages.scrollTop = chatMessages.scrollHeight; });
        });
      }

      function showQuickReplies(list){
        if(!chatMessages) return;
        const existing = document.getElementById('chat-quick-row'); if(existing) existing.remove();
        const row = document.createElement('div'); row.id = 'chat-quick-row'; row.style.display='flex'; row.style.flexWrap='wrap'; row.style.gap='8px'; row.style.padding='8px';
        list.forEach(q=>{
          const b = document.createElement('button'); b.className='btn-secondary chat-quick'; b.textContent = q; b.style.padding='6px 10px'; b.addEventListener('click', ()=>{ sendChat(q); }); row.appendChild(b);
        });
        chatMessages.appendChild(row); chatMessages.scrollTop = chatMessages.scrollHeight;
      }

      function matchIntent(text){
        const t = (text||'').toLowerCase();
        if(/mine|mining/.test(t)) return 'mining';
        if(/transfer|withdraw|send/.test(t)) return 'transfer_rules';
        if(/referral|refer|invite/.test(t)) return 'referrals';
        if(/deposit|add funds|fund/.test(t)) return 'deposits';
        if(/withdraw|withdrawal/.test(t)) return 'withdrawals';
        if(/blockchain|network/.test(t)) return 'blockchain';
        if(/gas|fee|gas fee/.test(t)) return 'gas_fee';
        if(/chart|candl|price|binance|coingecko/.test(t)) return 'charts';
        if(/purpose|what is|site|about/.test(t)) return 'purpose';
        if(/support|human|agent|help/.test(t)) return 'support';
        return null;
      }

      function respondTo(text){
        const intent = matchIntent(text);
        if(intent && canned.intents[intent]){
          // ensure systematic presentation: Summary / Details / Action lines
          const raw = canned.intents[intent];
          // AddAgentMessage will display newlines correctly in the chat bubble
          addAgentMessage(raw);
          showQuickReplies(canned.quick);
          return;
        }
        // fallback systematic help
        const fallback = `Summary: Quick help\nDetails: I can assist with Mining, Transfers, Deposits, Withdrawals, Charts and Blockchain gas fees.\nAction: Try one of the quick replies below.`;
        addAgentMessage(fallback);
        showQuickReplies(canned.quick);
      }

      function doSend(text){
        if(!text) return;
        if(chatInput) chatInput.value = '';
        addUserMessage(text);
        setTimeout(()=> respondTo(text), 500 + Math.random()*400);
      }

      function sendChat(raw){
        const text = (raw || (chatInput && chatInput.value && chatInput.value.trim())) || '';
        if(!text) return;
        if(!hasGreeted()){
          showGreeting();
          setTimeout(()=> doSend(text), 350);
          return;
        }
        doSend(text);
      }

      // NOTE: listeners for send are bound after the greeting-wrapper below

      // greeting control: show once per browser session when user contacts (opens chat or sends first message)
      function hasGreeted(){ return sessionStorage.getItem('stanbicAssistGreeted') === '1'; }
      function markGreeted(){ sessionStorage.setItem('stanbicAssistGreeted','1'); }
      function showGreeting(){ if(hasGreeted()) return; addAgentMessage(canned.greeting); showQuickReplies(canned.quick); markGreeted(); }

      // show greeting when chat panel opened (user contacts)
      const chatToggleBtn = document.getElementById('chat-toggle');
      chatToggleBtn?.addEventListener('click', ()=>{
        // toggle happens elsewhere; delay slightly to allow class toggle
        setTimeout(()=>{ if(chatPanel && chatPanel.classList.contains('show')){ showGreeting(); } }, 120);
      });

      // Bind send/enter to the unified `sendChat`
      chatSend?.addEventListener('click', ()=> sendChat());
      chatInput?.addEventListener('keydown', (e)=>{ if(e.key === 'Enter'){ e.preventDefault(); sendChat(); } });

      // If already open when page loads, show greeting once
      setTimeout(()=>{ if(chatPanel && chatPanel.classList.contains('show')) showGreeting(); }, 400);
    })();

    // Generic copy buttons
    document.querySelectorAll('.copy-btn').forEach(btn=> btn.addEventListener('click', ()=>{
      const addr = btn.getAttribute('data-address') || '';
      if(!addr) return;
      navigator.clipboard?.writeText(addr).then(()=>{ btn.textContent = 'Copied'; setTimeout(()=> btn.textContent='📋 Copy',1200); });
    }));

    // Hamburger menu toggle and dropdown navigation
    const hamburgerBtn = document.getElementById('hamburger-btn');
    const dropdownMenu = document.getElementById('dropdown-menu');
    hamburgerBtn?.addEventListener('click', ()=> dropdownMenu?.classList.toggle('show'));
    window.addEventListener('click', (e)=>{ if(!hamburgerBtn?.contains(e.target) && !dropdownMenu?.contains(e.target)) dropdownMenu?.classList.remove('show'); });

    // Map dropdown items to actions (scroll or open modal)
    document.querySelectorAll('.dropdown-item').forEach(item=> item.addEventListener('click', (e)=>{
      e.preventDefault();
      const key = item.getAttribute('data-item');
      // close dropdown
      dropdownMenu?.classList.remove('show');
      if(key === 'dashboard'){
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      if(key === 'transactions'){
        const txEl = document.getElementById('tx-table')?.closest('.glass-card') || document.querySelector('table');
        if(txEl) txEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      if(key === 'deposit'){
        const bankModal = document.getElementById('bank-deposit-modal'); bankModal?.classList.add('show'); renderAgentsGrid(); return;
      }
      if(key === 'withdraw'){
        const withdrawModal = document.getElementById('withdraw-modal'); withdrawModal?.classList.add('show'); return;
      }
      if(key === 'settings'){
        const settingsModal = document.getElementById('settings-modal'); settingsModal?.classList.add('show'); return;
      }
    }));

    // ----- Live Agents & Bank-to-Crypto flow -----
    function getAgents(){
      try{
        const raw = JSON.parse(localStorage.getItem('liveAgents')||'[]');
        if(Array.isArray(raw) && raw.length) return raw;

        // seed default agents: 6 active (online) + 4 inactive
        const seeded = [];
        const makeAcct = ()=> Math.floor(1000000000 + Math.random()*9000000000).toString();
        for(let i=1;i<=10;i++){
          const online = i <= 6; // first 6 active
          const name = `Staff ${i}`;
          seeded.push({
            id: `AG-${Date.now()}-${i}`,
            name,
            role: 'Staff',
            online,
            bankName: 'Stanbic Bank Kenya',
            accountName: 'Stanbic Investments Ltd',
            accountNumber: makeAcct(),
            branch: 'Koinange Street Branch',
            swift: 'SBICKENX',
            userId: `AG${Math.random().toString(36).slice(2,8).toUpperCase()}`
          });
        }
        localStorage.setItem('liveAgents', JSON.stringify(seeded));
        return seeded;
      }catch(e){
        return [];
      }
    }

    function setAgents(list){ localStorage.setItem('liveAgents', JSON.stringify(list||[])); }

    function renderAgentsGrid(){
      const grid = document.getElementById('agents-grid'); if(!grid) return;
      const agents = getAgents(); grid.innerHTML = '';
      agents.forEach(agent=>{
        const card = document.createElement('div'); card.className='agent-card';
        if(agent.online){ card.classList.add('online'); }
        const statusText = `${agent.role || 'Staff'} • ${agent.online ? 'Online' : 'Offline'}`;
        card.innerHTML = `
          <div class="agent-name">${agent.name}</div>
          <div class="agent-status">${statusText}</div>
          <div class="amount-note">${agent.bankName || ''} • ${agent.accountNumber || ''}</div>
        `;
        card.addEventListener('click', ()=> selectAgent(agent));
        grid.appendChild(card);
      });
    }

    function selectAgent(agent){
      const sec = document.getElementById('agent-details-section'); if(sec) sec.style.display='block';
      document.getElementById('selected-agent-name').textContent = agent.name || '---';
      document.getElementById('selected-agent-user-id').textContent = agent.userId || agent.id || '---';
      document.getElementById('selected-agent-status').textContent = 'Online';
      document.getElementById('agent-bank-name').textContent = agent.bankName || 'Stanbic Bank Kenya';
      document.getElementById('agent-account-name').textContent = agent.accountName || 'Stanbic Investments Ltd';
      document.getElementById('agent-account-number').textContent = agent.accountNumber || '1234567890';
      document.getElementById('agent-branch').textContent = agent.branch || 'Koinange Street Branch';
      document.getElementById('agent-swift-code').textContent = agent.swift || 'SBICKENX';
      const form = document.getElementById('bank-deposit-form'); if(form) form.dataset.selectedAgent = agent.id || agent.userId || agent.accountNumber || '';
    }

    // Add agent button (quick admin flow)
    document.getElementById('add-agent-btn')?.addEventListener('click', ()=>{
      const name = prompt('Agent display name'); if(!name) return;
      const accountNumber = prompt('Agent account number (digits)') || '';
      const bankName = prompt('Bank name', 'Stanbic Bank Kenya') || 'Stanbic Bank Kenya';
      const accountName = prompt('Account name', 'Stanbic Investments Ltd') || 'Stanbic Investments Ltd';
      const branch = prompt('Branch', 'Koinange Street Branch') || 'Koinange Street Branch';
      const swift = prompt('SWIFT code', 'SBICKENX') || 'SBICKENX';
      const agent = { id: `AG-${Date.now()}`, name, bankName, accountName, accountNumber, branch, swift, userId: `AG${Math.random().toString(36).slice(2,8).toUpperCase()}` };
      const agents = getAgents(); agents.unshift(agent); setAgents(agents); renderAgentsGrid();

      // Propagate bank account to all users (each user will have same bank details to receive payments to)
      const allUsers = getStorageArray('users');
      if(Array.isArray(allUsers) && allUsers.length){
        allUsers.forEach(u=>{ u.bankAccount = { bankName: agent.bankName, accountName: agent.accountName, accountNumber: agent.accountNumber, branch: agent.branch, swift: agent.swift }; });
        setStorageArray('users', allUsers);
      }
      // update current user immediately
      user.bankAccount = { bankName: agent.bankName, accountName: agent.accountName, accountNumber: agent.accountNumber, branch: agent.branch, swift: agent.swift };
      localStorage.setItem('currentUser', JSON.stringify(user));
      alert('Agent added and bank account propagated to all users');
    });

    // Render existing agents on load
    renderAgentsGrid();

    // Transactions renderer (simple)
    function renderTransactions(){
      const tbody = document.getElementById('tx-table'); if(!tbody) return; tbody.innerHTML = '';
      (transactions||[]).forEach(tx=>{
        const tr = document.createElement('tr');
        const statusClass = tx.status === 'completed' ? 'status-completed' : tx.status === 'rejected' ? 'status-rejected' : 'status-pending';
        tr.id = `tx-${tx.id}`;
        tr.innerHTML = `<td>${tx.type}</td><td>${tx.usdtAmount || tx.amount}</td><td>${tx.date}</td><td><span class="status-badge ${statusClass}">${tx.status}</span></td>`;
        tbody.prepend(tr);
      });
    }
    renderTransactions();
    renderYourAssets();

    // Bank deposit form handling: create pending transaction and schedule 5-minute credit
    const bankForm = document.getElementById('bank-deposit-form');
    bankForm?.addEventListener('submit', async (ev)=>{
      ev.preventDefault();
      const amt = parseFloat(document.getElementById('deposit-amount').value) || 0;
      const usdtAmt = parseFloat(document.getElementById('usdt-amount').value) || amt;
      const walletAddr = document.getElementById('bank-wallet-address')?.value || '';
      const selectedAgentKey = bankForm.dataset.selectedAgent;
      if(!selectedAgentKey){ showTempPopup('Please select an active agent first', 1000); return; }
      const receiptFile = receiptInput?.files && receiptInput.files[0];
      if(!receiptFile){ showTempPopup('Upload payment receipt first', 1000); return; }
      if(!receiptFile.type.startsWith('image/') && receiptFile.type !== 'application/pdf'){ showTempPopup('Receipt must be an image or PDF', 1000); return; }
      if(receiptFile.size > 5 * 1024 * 1024){ showTempPopup('File too large (max 5MB)', 1000); return; }

      let receiptFileData = '';
      try{
        receiptFileData = await readFileAsDataUrl(receiptFile);
      }catch(readErr){
        console.error('Could not read receipt file', readErr);
        showTempPopup('Failed to read receipt file', 1000);
        return;
      }

      const tx = { id: `TX-${Date.now()}`, type: 'bank-deposit', amount: `${amt} ${document.getElementById('deposit-currency').value}`, usdtAmount: usdtAmt, wallet: walletAddr, date: new Date().toLocaleString(), status: 'pending', agent: selectedAgentKey };
      transactions.unshift(tx);
      const receipt = createReceiptForTransaction(tx, 'bank-deposit', {
        wallet: walletAddr,
        agent: selectedAgentKey
      });
      const documentRecord = registerUploadedDocument({
        fileData: receiptFileData,
        fileName: receiptFile.name || 'payment-receipt',
        fileMime: receiptFile.type || '',
        documentType: 'bank-deposit-receipt',
        referenceId: receipt ? receipt.id : tx.id
      });
      if(receipt && documentRecord?.id){
        syncReceiptFromTransaction(tx, {
          documentId: documentRecord.id,
          documentType: 'bank-deposit-receipt'
        });
      }
      saveCurrentUserState();
      renderTransactions();
      renderYourAssets();

      // Show immediate feedback
      alert('Payment recorded as pending. Once bank confirms, USDT will be credited automatically within 5 minutes.');

      // Schedule credit after 5 minutes (300000 ms)
      setTimeout(()=>{
        try{
          // find transaction and mark completed
          const txIndex = transactions.findIndex(t=>t.id === tx.id);
          if(txIndex !== -1){
            transactions[txIndex].status = 'completed';
            transactions[txIndex].completedAt = new Date().toLocaleString();
            syncReceiptFromTransaction(transactions[txIndex], { completedAt: transactions[txIndex].completedAt });
          }
          // credit user's USDT balance
          user.assets = user.assets || {};
          user.assets.USDT = (parseFloat(user.assets.USDT) || 0) + Number(usdtAmt);
          // update storage
          saveCurrentUserState();
          renderTransactions();
          alert(`USDT credited: ${usdtAmt} USDT for transaction ${tx.id}`);
        }catch(e){ console.error('Error auto-crediting USDT', e); }
      }, 5 * 60 * 1000);

    });

    // Update USDT display when deposit amount changes (1:1 rate assumed)
    const depositAmountInput = document.getElementById('deposit-amount');
    const usdtAmountInput = document.getElementById('usdt-amount');
    depositAmountInput?.addEventListener('input', ()=>{ const v = parseFloat(depositAmountInput.value) || 0; if(usdtAmountInput) usdtAmountInput.value = v.toFixed(2); });

  } catch (err) {
    console.error('Error wiring dashboard UI', err);
  }
});
