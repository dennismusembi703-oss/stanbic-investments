// Full admin.js copied from original source (consolidated into /js)
// ADMIN DASHBOARD LOGIC
const ADMIN_SESSION_KEY = "adminSession";
const ADMIN_ACCOUNTS_KEY = "adminAccounts";
const DEFAULT_ADMIN_ACCOUNTS = [
  {
    username: "Moneyprinter",
    password: "Moneyprinter",
    displayName: "Stanbic Super Admin",
    role: "super-admin",
    fullAccess: true
  },
  {
    username: "StanbicStaff01",
    password: "Staff@123",
    displayName: "Stanbic Staff 01",
    role: "staff",
    fullAccess: true
  },
  {
    username: "StanbicSupport",
    password: "Support@123",
    displayName: "Stanbic Support",
    role: "staff",
    fullAccess: true
  }
];

let adminSession = null;
try {
  adminSession = JSON.parse(localStorage.getItem(ADMIN_SESSION_KEY) || "null");
} catch (err) {
  console.error("Failed to parse admin session.", err);
  adminSession = null;
}

// Check if admin or staff is logged in
if (localStorage.getItem("adminLoggedIn") !== "true" && !adminSession) {
  window.location.href = "admin-login.html";
}

if (adminSession && localStorage.getItem("adminLoggedIn") !== "true") {
  localStorage.setItem("adminLoggedIn", "true");
}

// DOM Elements
const sidebarItems = document.querySelectorAll('.admin-sidebar li');
const sections = document.querySelectorAll('.admin-section');
const usersTbody = document.getElementById('users-tbody');
const transactionsTbody = document.getElementById('transactions-tbody');
const userDetailsModal = document.getElementById('user-details-modal');
const closeDetailsBtn = document.getElementById('close-details');
const adminSessionBadge = document.getElementById('admin-session-badge');

// Stats elements
const totalUsersEl = document.getElementById('total-users');
const activeUsersEl = document.getElementById('active-users');
const totalTransactionsEl = document.getElementById('total-transactions');
const totalBalanceEl = document.getElementById('total-balance');
const totalCryptoAssetsEl = document.getElementById('total-crypto-assets');
const emailJsPublicKeyInput = document.getElementById('emailjs-public-key');
const emailJsServiceIdInput = document.getElementById('emailjs-service-id');
const emailJsTemplateIdInput = document.getElementById('emailjs-template-id');
const emailJsTestEmailInput = document.getElementById('emailjs-test-email');
const emailJsSaveBtn = document.getElementById('emailjs-save-btn');
const emailJsTestBtn = document.getElementById('emailjs-test-btn');
const emailJsClearBtn = document.getElementById('emailjs-clear-btn');
const emailJsSettingsStatus = document.getElementById('emailjs-settings-status');
const staffDisplayNameInput = document.getElementById('staff-display-name');
const staffUsernameInput = document.getElementById('staff-username');
const staffPasswordInput = document.getElementById('staff-password');
const staffRoleInput = document.getElementById('staff-role');
const staffCreateBtn = document.getElementById('staff-create-btn');
const staffAccountsTbody = document.getElementById('staff-accounts-tbody');
const staffAccountsStatus = document.getElementById('staff-accounts-status');
const staffActivityModal = document.getElementById('staff-activity-modal');
const staffActivityTitle = document.getElementById('staff-activity-title');
const staffClientCheckboxes = document.getElementById('staff-client-checkboxes');
const staffSaveClientsBtn = document.getElementById('staff-save-clients-btn');
const staffActivitySummary = document.getElementById('staff-activity-summary');
const staffActivityTransactionsTbody = document.getElementById('staff-activity-transactions-tbody');
const staffActivityChatsTbody = document.getElementById('staff-activity-chats-tbody');
const staffActivityRequestsTbody = document.getElementById('staff-activity-requests-tbody');
const staffActivityCloseBtn = document.getElementById('staff-activity-close');
const RECEIPTS_STORAGE_KEY = "generatedReceipts";
const RECEIPT_EMAIL_LOG_STORAGE_KEY = "receiptEmailLogs";
const DOCUMENTS_STORAGE_KEY = "uploadedDocuments";
const EMAILJS_CONFIG_STORAGE_KEY = "emailjsReceiptConfig";
const STAFF_CLIENT_ASSIGNMENTS_KEY = "staffClientAssignments";
const EMAILJS_FALLBACK_CONFIG = {
  publicKey: "YOUR_EMAILJS_PUBLIC_KEY",
  serviceId: "YOUR_EMAILJS_SERVICE_ID",
  templateId: "YOUR_EMAILJS_TEMPLATE_ID"
};
let selectedStaffUsername = "";
let selectedConversationKey = null;

function renderAdminSessionBadge() {
  if (!adminSessionBadge) return;

  if (adminSession?.displayName) {
    const role = adminSession.role || "staff";
    const access = adminSession.fullAccess === false ? "Limited" : "Full Access";
    if (role === "staff") {
      const clientCount = getAssignedClientEmails(adminSession.username).length;
      adminSessionBadge.textContent = `${adminSession.displayName} (${role}) - ${access} - ${clientCount} client(s)`;
    } else {
      adminSessionBadge.textContent = `${adminSession.displayName} (${role}) - ${access}`;
    }
    return;
  }

  adminSessionBadge.textContent = "Legacy Admin Session - Full Access";
}

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

function getNormalizedSessionUsername() {
  return normalizeUsername(adminSession?.username);
}

function isSuperAdminSession() {
  if (!adminSession?.username) return true; // Legacy session is treated as full admin.
  return adminSession.role === "super-admin";
}

function getAssignmentsMap() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STAFF_CLIENT_ASSIGNMENTS_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (err) {
    console.error("Failed to parse staff client assignments.", err);
    return {};
  }
}

function saveAssignmentsMap(assignments) {
  localStorage.setItem(STAFF_CLIENT_ASSIGNMENTS_KEY, JSON.stringify(assignments || {}));
}

function getAssignedClientEmails(staffUsername) {
  const normalizedStaff = normalizeUsername(staffUsername);
  const assignments = getAssignmentsMap();
  const assigned = assignments[normalizedStaff];
  return Array.isArray(assigned)
    ? assigned.map((email) => String(email).toLowerCase()).filter(Boolean)
    : [];
}

function setAssignedClientEmails(staffUsername, emails) {
  const normalizedStaff = normalizeUsername(staffUsername);
  const assignments = getAssignmentsMap();
  assignments[normalizedStaff] = Array.from(new Set((emails || []).map((email) => String(email).toLowerCase()).filter(Boolean)));
  saveAssignmentsMap(assignments);
}

function getVisibleUserPredicate() {
  if (isSuperAdminSession()) {
    return () => true;
  }

  const staffUsername = getNormalizedSessionUsername();
  const assignedEmails = new Set(getAssignedClientEmails(staffUsername));
  return (user) => assignedEmails.has(String(user?.email || "").toLowerCase());
}

function getVisibleUsers(users) {
  const canView = getVisibleUserPredicate();
  return (users || []).filter((user) => canView(user));
}

function isUserVisible(user) {
  return getVisibleUserPredicate()(user);
}

function getUserMapByEmail(users) {
  const map = {};
  (users || []).forEach((user) => {
    if (!user?.email) return;
    map[String(user.email).toLowerCase()] = user;
  });
  return map;
}

function normalizeUsername(value) {
  return (value || "").trim().toLowerCase();
}

function sanitizeAdminAccount(account) {
  if (!account || typeof account !== "object") return null;

  const username = (account.username || "").trim();
  const password = (account.password || "").trim();
  if (!username || !password) return null;

  return {
    username,
    password,
    displayName: (account.displayName || username).trim(),
    role: account.role === "super-admin" ? "super-admin" : "staff",
    fullAccess: account.fullAccess !== false
  };
}

function loadManagedAdminAccounts() {
  let parsedAccounts = [];
  try {
    const raw = JSON.parse(localStorage.getItem(ADMIN_ACCOUNTS_KEY) || "[]");
    if (Array.isArray(raw)) {
      parsedAccounts = raw;
    }
  } catch (err) {
    console.error("Failed to parse admin accounts.", err);
  }

  const sourceAccounts = parsedAccounts.length ? parsedAccounts : DEFAULT_ADMIN_ACCOUNTS;
  const dedupedByUsername = {};
  sourceAccounts.forEach((account) => {
    const normalized = sanitizeAdminAccount(account);
    if (!normalized) return;
    dedupedByUsername[normalizeUsername(normalized.username)] = normalized;
  });

  let accounts = Object.values(dedupedByUsername);
  if (!accounts.length) {
    accounts = [...DEFAULT_ADMIN_ACCOUNTS];
  }

  if (!accounts.some((account) => account.role === "super-admin")) {
    accounts.unshift({ ...DEFAULT_ADMIN_ACCOUNTS[0] });
  }

  localStorage.setItem(ADMIN_ACCOUNTS_KEY, JSON.stringify(accounts));
  return accounts;
}

function saveManagedAdminAccounts(accounts) {
  const dedupedByUsername = {};
  (accounts || []).forEach((account) => {
    const normalized = sanitizeAdminAccount(account);
    if (!normalized) return;
    dedupedByUsername[normalizeUsername(normalized.username)] = normalized;
  });

  let normalizedAccounts = Object.values(dedupedByUsername);
  if (!normalizedAccounts.some((account) => account.role === "super-admin")) {
    normalizedAccounts.unshift({ ...DEFAULT_ADMIN_ACCOUNTS[0] });
  }

  localStorage.setItem(ADMIN_ACCOUNTS_KEY, JSON.stringify(normalizedAccounts));
  return normalizedAccounts;
}

function setStaffAccountsStatus(message, tone = "info") {
  if (!staffAccountsStatus) return;
  const colors = {
    info: "#ccc",
    success: "#00c853",
    warning: "#ffc107",
    error: "#ff4444"
  };
  staffAccountsStatus.textContent = message;
  staffAccountsStatus.style.color = colors[tone] || colors.info;
}

function renderStaffAccountsTable() {
  if (!staffAccountsTbody) return;

  const accounts = loadManagedAdminAccounts();
  const currentUsername = normalizeUsername(adminSession?.username);
  const canManageStaff = isSuperAdminSession();
  const users = JSON.parse(localStorage.getItem('users')) || [];
  const visibleAccounts = canManageStaff
    ? accounts
    : accounts.filter((account) => normalizeUsername(account.username) === currentUsername);
  staffAccountsTbody.innerHTML = "";

  visibleAccounts.forEach((account) => {
    const row = document.createElement("tr");
    const isCurrent = normalizeUsername(account.username) === currentUsername;
    const roleLabel = account.role === "super-admin" ? "Super Admin" : "Staff";
    const assignedCount = account.role === "staff" ? getAssignedClientEmails(account.username).length : "-";
    const manageButtons = `
      <button class="btn-admin btn-view btn-view-staff-activity" data-username="${account.username}">View</button>
      ${canManageStaff ? `<button class="btn-admin btn-primary btn-manage-staff-clients" data-username="${account.username}">Clients</button>` : ""}
      ${canManageStaff ? `<button class="btn-admin btn-deactivate btn-remove-staff" data-username="${account.username}">Remove</button>` : ""}
    `;
    row.innerHTML = `
      <td>${account.displayName || account.username}</td>
      <td>${account.username}</td>
      <td>${roleLabel}</td>
      <td>${assignedCount}</td>
      <td>${account.fullAccess === false ? "Limited" : "Full Access"}</td>
      <td>${isCurrent ? "Active Session" : ""}</td>
      <td>
        ${manageButtons}
      </td>
    `;
    staffAccountsTbody.appendChild(row);
  });

  document.querySelectorAll(".btn-view-staff-activity").forEach((btn) => {
    btn.addEventListener("click", () => {
      openStaffActivityModal(btn.dataset.username, false);
    });
  });

  document.querySelectorAll(".btn-manage-staff-clients").forEach((btn) => {
    btn.addEventListener("click", () => {
      openStaffActivityModal(btn.dataset.username, true);
    });
  });

  document.querySelectorAll(".btn-remove-staff").forEach((btn) => {
    btn.addEventListener("click", () => {
      removeStaffAccount(btn.dataset.username);
    });
  });

  const hasVisibleUsers = users.length > 0;
  if (!canManageStaff) {
    if (staffCreateBtn) staffCreateBtn.disabled = true;
    if (staffDisplayNameInput) staffDisplayNameInput.disabled = true;
    if (staffUsernameInput) staffUsernameInput.disabled = true;
    if (staffPasswordInput) staffPasswordInput.disabled = true;
    if (staffRoleInput) staffRoleInput.disabled = true;
    setStaffAccountsStatus("You can view your assigned-client activity here. Super admin manages account ownership.", "warning");
    return;
  }

  if (staffCreateBtn) staffCreateBtn.disabled = false;
  if (staffDisplayNameInput) staffDisplayNameInput.disabled = false;
  if (staffUsernameInput) staffUsernameInput.disabled = false;
  if (staffPasswordInput) staffPasswordInput.disabled = false;
  if (staffRoleInput) staffRoleInput.disabled = false;

  if (!hasVisibleUsers) {
    setStaffAccountsStatus("No clients registered yet. Create users first, then assign to staff.", "warning");
    return;
  }

  setStaffAccountsStatus(`Loaded ${visibleAccounts.length} admin/staff account(s).`, "info");
}

function renderStaffClientCheckboxes(staffUsername) {
  if (!staffClientCheckboxes) return;

  const users = JSON.parse(localStorage.getItem('users')) || [];
  const assignments = getAssignmentsMap();
  const normalizedStaff = normalizeUsername(staffUsername);
  const assignedToStaff = new Set(getAssignedClientEmails(staffUsername));
  staffClientCheckboxes.innerHTML = "";

  if (!users.length) {
    staffClientCheckboxes.innerHTML = '<div style="color:#aaa;">No clients available.</div>';
    return;
  }

  users.forEach((user) => {
    const email = String(user.email || "").toLowerCase();
    if (!email) return;

    const ownerEntry = Object.entries(assignments).find(([staffKey, emails]) => {
      if (!Array.isArray(emails)) return false;
      return emails.map((item) => String(item).toLowerCase()).includes(email);
    });
    const ownerStaff = ownerEntry ? ownerEntry[0] : "";
    const ownerLabel = ownerStaff && ownerStaff !== normalizedStaff ? ` (owned by ${ownerStaff})` : "";
    const isChecked = assignedToStaff.has(email);
    const disabledForOtherOwner = !isSuperAdminSession() && !!ownerStaff && ownerStaff !== normalizedStaff;

    const item = document.createElement("label");
    item.className = "staff-client-item";
    item.innerHTML = `
      <input type="checkbox" value="${email}" ${isChecked ? "checked" : ""} ${disabledForOtherOwner ? "disabled" : ""}>
      <span>${user.firstName || ""} ${user.lastName || ""} - ${email}${ownerLabel}</span>
    `;
    staffClientCheckboxes.appendChild(item);
  });
}

function renderStaffActivity(username) {
  if (!staffActivitySummary || !staffActivityTransactionsTbody || !staffActivityChatsTbody || !staffActivityRequestsTbody) return;

  const users = JSON.parse(localStorage.getItem('users')) || [];
  const userMap = getUserMapByEmail(users);
  const assignedEmails = getAssignedClientEmails(username);
  const assignedUsers = assignedEmails.map((email) => userMap[email]).filter(Boolean);
  const exchangeRequests = JSON.parse(localStorage.getItem('exchangeRequests')) || [];
  const receipts = getStorageArray(RECEIPTS_STORAGE_KEY);
  const chatConversations = scanChatConversations();
  const assignedConversationKeys = new Set(
    assignedEmails.map((email) => `chat_conversations_guest_${email.replace(/[^a-zA-Z0-9]/g, "_")}`)
  );
  const assignedConversations = chatConversations.filter((conversation) => {
    if (assignedConversationKeys.has(conversation.key)) return true;
    return assignedEmails.some((email) => conversation.key.toLowerCase().includes(email.replace(/[^a-z0-9]/g, "")));
  });
  const assignedReceipts = receipts.filter((receipt) => assignedEmails.includes(String(receipt.userEmail || "").toLowerCase()));
  const assignedTransactions = assignedUsers.flatMap((assignedUser) => {
    const txs = Array.isArray(assignedUser.transactions) ? assignedUser.transactions : [];
    return txs.map((tx) => ({ ...tx, userEmail: assignedUser.email || "", userName: `${assignedUser.firstName || ""} ${assignedUser.lastName || ""}`.trim() }));
  });
  const assignedRequests = exchangeRequests.filter((request) => assignedEmails.includes(String(request.userEmail || "").toLowerCase()));

  const pendingCount = assignedTransactions.filter((tx) => tx.status === "pending").length;
  const completedCount = assignedTransactions.filter((tx) => tx.status === "completed").length;
  staffActivitySummary.textContent = `Assigned clients: ${assignedUsers.length} | Transactions: ${assignedTransactions.length} (${completedCount} completed, ${pendingCount} pending) | Receipts: ${assignedReceipts.length} | Chats: ${assignedConversations.length} | Requests: ${assignedRequests.length}`;

  staffActivityTransactionsTbody.innerHTML = "";
  assignedTransactions.slice(0, 100).forEach((tx) => {
    const row = document.createElement("tr");
    const statusClass = tx.status === "completed" ? "status-completed" : tx.status === "rejected" ? "status-rejected" : "status-pending";
    row.innerHTML = `
      <td>${tx.userName || tx.userEmail || "-"}</td>
      <td>${tx.type || "-"}</td>
      <td>${tx.usdtAmount || tx.amount || "-"}</td>
      <td>${tx.date || tx.transactionDate || "-"}</td>
      <td><span class="status-badge ${statusClass}">${tx.status || "pending"}</span></td>
    `;
    staffActivityTransactionsTbody.appendChild(row);
  });

  if (!staffActivityTransactionsTbody.children.length) {
    staffActivityTransactionsTbody.innerHTML = '<tr><td colspan="5" style="color:#aaa;">No transactions yet.</td></tr>';
  }

  staffActivityChatsTbody.innerHTML = "";
  assignedConversations.slice(0, 100).forEach((conversation) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${conversation.guestId || "-"}</td>
      <td>${Array.isArray(conversation.messages) ? conversation.messages.length : 0}</td>
      <td>${conversation.lastAt || "-"}</td>
    `;
    staffActivityChatsTbody.appendChild(row);
  });

  if (!staffActivityChatsTbody.children.length) {
    staffActivityChatsTbody.innerHTML = '<tr><td colspan="3" style="color:#aaa;">No chats yet.</td></tr>';
  }

  staffActivityRequestsTbody.innerHTML = "";
  assignedRequests.slice(0, 100).forEach((request) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${request.userEmail || "-"}</td>
      <td>${request.amount || "-"}</td>
      <td>${request.usdtAmount || "-"}</td>
      <td>${request.status || "pending"}</td>
      <td>${request.createdAt || request.date || "-"}</td>
    `;
    staffActivityRequestsTbody.appendChild(row);
  });

  if (!staffActivityRequestsTbody.children.length) {
    staffActivityRequestsTbody.innerHTML = '<tr><td colspan="5" style="color:#aaa;">No exchange requests yet.</td></tr>';
  }
}

function openStaffActivityModal(username, manageMode = false) {
  if (!staffActivityModal || !username) return;

  selectedStaffUsername = username;
  if (staffActivityTitle) {
    staffActivityTitle.textContent = `Staff Activity - ${username}`;
  }

  renderStaffClientCheckboxes(username);
  renderStaffActivity(username);

  if (staffSaveClientsBtn) {
    staffSaveClientsBtn.style.display = manageMode ? "" : "none";
    staffSaveClientsBtn.disabled = !manageMode;
  }
  if (staffClientCheckboxes) {
    staffClientCheckboxes.style.pointerEvents = manageMode ? "" : "none";
    staffClientCheckboxes.style.opacity = manageMode ? "1" : "0.85";
  }

  staffActivityModal.classList.add("show");
}

function removeStaffAccount(username) {
  if (!isSuperAdminSession()) {
    setStaffAccountsStatus("Only super admin can remove accounts.", "error");
    return;
  }

  const normalized = normalizeUsername(username);
  if (!normalized) return;
  if (normalized === normalizeUsername(adminSession?.username)) {
    setStaffAccountsStatus("Cannot remove your active session account.", "warning");
    return;
  }

  const accounts = loadManagedAdminAccounts().filter((account) => normalizeUsername(account.username) !== normalized);
  saveManagedAdminAccounts(accounts);

  const assignments = getAssignmentsMap();
  delete assignments[normalized];
  saveAssignmentsMap(assignments);

  setStaffAccountsStatus(`Removed staff account: ${username}`, "success");
  renderStaffAccountsTable();
}

function createStaffAccount() {
  if (!isSuperAdminSession()) {
    setStaffAccountsStatus("Only super admin can create staff accounts.", "error");
    return;
  }

  const displayName = (staffDisplayNameInput?.value || "").trim();
  const username = (staffUsernameInput?.value || "").trim();
  const password = (staffPasswordInput?.value || "").trim();
  const role = staffRoleInput?.value === "super-admin" ? "super-admin" : "staff";

  if (!displayName || !username || password.length < 6) {
    setStaffAccountsStatus("Provide display name, username, and a password of at least 6 characters.", "warning");
    return;
  }

  const accounts = loadManagedAdminAccounts();
  const exists = accounts.some((account) => normalizeUsername(account.username) === normalizeUsername(username));
  if (exists) {
    setStaffAccountsStatus(`Username "${username}" already exists.`, "error");
    return;
  }

  accounts.push({
    username,
    password,
    displayName,
    role,
    fullAccess: true
  });

  saveManagedAdminAccounts(accounts);
  setStaffAccountsStatus(`Created ${role} account: ${username}`, "success");

  if (staffDisplayNameInput) staffDisplayNameInput.value = "";
  if (staffUsernameInput) staffUsernameInput.value = "";
  if (staffPasswordInput) staffPasswordInput.value = "";
  if (staffRoleInput) staffRoleInput.value = "staff";
  renderStaffAccountsTable();
}

function saveSelectedStaffClients() {
  if (!selectedStaffUsername || !staffClientCheckboxes) return;
  const selectedEmails = Array.from(staffClientCheckboxes.querySelectorAll('input[type="checkbox"]:checked'))
    .map((checkbox) => String(checkbox.value || "").toLowerCase())
    .filter(Boolean);
  setAssignedClientEmails(selectedStaffUsername, selectedEmails);
  setStaffAccountsStatus(`Saved ${selectedEmails.length} client assignment(s) for ${selectedStaffUsername}.`, "success");
  renderStaffAccountsTable();
  renderStaffActivity(selectedStaffUsername);
}

function getEmailJsConfig() {
  let config = { ...EMAILJS_FALLBACK_CONFIG };
  try {
    const saved = JSON.parse(localStorage.getItem(EMAILJS_CONFIG_STORAGE_KEY) || "{}");
    if (saved && typeof saved === "object") {
      config = { ...config, ...saved };
    }
  } catch (err) {
    console.error("Could not parse saved EmailJS settings.", err);
  }

  if (window.EMAILJS_RECEIPT_CONFIG && typeof window.EMAILJS_RECEIPT_CONFIG === "object") {
    config = { ...config, ...window.EMAILJS_RECEIPT_CONFIG };
  }

  return config;
}

function isEmailJsConfigured(config) {
  if (!config) return false;
  return [config.publicKey, config.serviceId, config.templateId]
    .every((value) => typeof value === "string" && value.trim() && !value.startsWith("YOUR_"));
}

function setEmailJsSettingsStatus(message, tone = "info") {
  if (!emailJsSettingsStatus) return;
  const palette = {
    info: "#ccc",
    success: "#00c853",
    warning: "#ffc107",
    error: "#ff4444"
  };
  emailJsSettingsStatus.textContent = message;
  emailJsSettingsStatus.style.color = palette[tone] || palette.info;
}

function renderEmailJsSettings() {
  const config = getEmailJsConfig();
  if (emailJsPublicKeyInput) emailJsPublicKeyInput.value = config.publicKey || "";
  if (emailJsServiceIdInput) emailJsServiceIdInput.value = config.serviceId || "";
  if (emailJsTemplateIdInput) emailJsTemplateIdInput.value = config.templateId || "";

  if (isEmailJsConfigured(config)) {
    setEmailJsSettingsStatus("EmailJS receipt automation is configured.", "success");
  } else {
    setEmailJsSettingsStatus("EmailJS receipt automation is not configured yet.", "warning");
  }
}

function saveEmailJsSettings() {
  const config = {
    publicKey: (emailJsPublicKeyInput?.value || "").trim(),
    serviceId: (emailJsServiceIdInput?.value || "").trim(),
    templateId: (emailJsTemplateIdInput?.value || "").trim()
  };
  localStorage.setItem(EMAILJS_CONFIG_STORAGE_KEY, JSON.stringify(config));
  renderEmailJsSettings();
}

function clearEmailJsSettings() {
  localStorage.removeItem(EMAILJS_CONFIG_STORAGE_KEY);
  if (emailJsPublicKeyInput) emailJsPublicKeyInput.value = "";
  if (emailJsServiceIdInput) emailJsServiceIdInput.value = "";
  if (emailJsTemplateIdInput) emailJsTemplateIdInput.value = "";
  setEmailJsSettingsStatus("EmailJS settings cleared.", "info");
}

async function sendEmailJsTest() {
  const config = getEmailJsConfig();
  if (!isEmailJsConfigured(config)) {
    setEmailJsSettingsStatus("Save valid EmailJS settings before sending a test.", "warning");
    return;
  }
  if (!window.emailjs || typeof window.emailjs.send !== "function") {
    setEmailJsSettingsStatus("EmailJS SDK is not available on this page.", "error");
    return;
  }

  const toEmail = (emailJsTestEmailInput?.value || "").trim();
  if (!toEmail) {
    setEmailJsSettingsStatus("Enter a test recipient email first.", "warning");
    return;
  }

  try {
    if (!window.__emailJsReceiptInitDone && typeof window.emailjs.init === "function") {
      window.emailjs.init({ publicKey: config.publicKey });
      window.__emailJsReceiptInitDone = true;
    }

    await window.emailjs.send(
      config.serviceId,
      config.templateId,
      {
        to_email: toEmail,
        to_name: "Stanbic Test Recipient",
        user_id: "ADMIN-TEST",
        receipt_number: `TEST-${Date.now()}`,
        transaction_type: "test-receipt",
        amount: "0",
        transaction_date: new Date().toLocaleString(),
        transaction_status: "completed",
        created_at: new Date().toISOString(),
        source: "admin-test"
      },
      { publicKey: config.publicKey }
    );

    setEmailJsSettingsStatus(`Test email sent to ${toEmail}.`, "success");
  } catch (err) {
    setEmailJsSettingsStatus(`Test email failed: ${err?.text || err?.message || "Unknown error"}`, "error");
  }
}

function getVisibleEmailSet() {
  const users = getVisibleUsers(getStorageArray("users"));
  return new Set(users.map((user) => String(user.email || "").toLowerCase()).filter(Boolean));
}

function renderReceiptMonitorTable() {
  const tbody = document.getElementById("receipt-monitor-tbody");
  if (!tbody) return;

  const visibleEmails = getVisibleEmailSet();
  const receipts = getStorageArray(RECEIPTS_STORAGE_KEY).filter((receipt) => {
    if (isSuperAdminSession()) return true;
    return visibleEmails.has(String(receipt.userEmail || "").toLowerCase());
  });
  const emailLogs = getStorageArray(RECEIPT_EMAIL_LOG_STORAGE_KEY);
  const emailByReceiptId = {};
  emailLogs.forEach((log) => {
    if (log?.receiptId && !emailByReceiptId[log.receiptId]) {
      emailByReceiptId[log.receiptId] = log;
    }
  });

  tbody.innerHTML = "";
  receipts.slice(0, 200).forEach((receipt) => {
    const row = document.createElement("tr");
    const statusClass = receipt.status === "completed" ? "status-completed" : receipt.status === "rejected" ? "status-rejected" : "status-pending";
    const emailLog = emailByReceiptId[receipt.id] || null;
    row.innerHTML = `
      <td>${receipt.receiptNumber || receipt.id || "-"}</td>
      <td>${receipt.userName || receipt.userEmail || "-"}</td>
      <td>${receipt.transactionType || "-"}</td>
      <td>${receipt.displayAmount || "-"}</td>
      <td><span class="status-badge ${statusClass}">${receipt.status || "pending"}</span></td>
      <td>${emailLog?.status || "not-queued"}</td>
      <td>${receipt.createdAt ? new Date(receipt.createdAt).toLocaleString() : "-"}</td>
    `;
    tbody.appendChild(row);
  });

  if (!tbody.children.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="color:#aaa;">No receipts generated yet.</td></tr>';
  }
}

function renderDocumentMonitorTable() {
  const tbody = document.getElementById("document-monitor-tbody");
  if (!tbody) return;

  const visibleEmails = getVisibleEmailSet();
  const documents = getStorageArray(DOCUMENTS_STORAGE_KEY).filter((documentRow) => {
    if (isSuperAdminSession()) return true;
    return visibleEmails.has(String(documentRow.userEmail || "").toLowerCase());
  });

  tbody.innerHTML = "";
  documents.slice(0, 200).forEach((documentRow) => {
    const row = document.createElement("tr");
    const openButton = documentRow.fileData
      ? `<button class="btn-admin btn-view btn-open-document" data-id="${documentRow.id}">Open</button>`
      : "-";
    row.innerHTML = `
      <td>${documentRow.userName || documentRow.userEmail || "-"}</td>
      <td>${documentRow.documentType || "-"}</td>
      <td>${documentRow.fileName || "-"}</td>
      <td>${documentRow.referenceId || "-"}</td>
      <td>${documentRow.uploadedAt ? new Date(documentRow.uploadedAt).toLocaleString() : "-"}</td>
      <td>${openButton}</td>
    `;
    tbody.appendChild(row);
  });

  tbody.querySelectorAll(".btn-open-document").forEach((button) => {
    button.addEventListener("click", () => {
      const target = documents.find((documentRow) => documentRow.id === button.dataset.id);
      if (!target?.fileData) return;
      window.open(target.fileData, "_blank", "noopener,noreferrer");
    });
  });

  if (!tbody.children.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="color:#aaa;">No uploaded documents yet.</td></tr>';
  }
}

/* ================== ADMIN INITIALIZER ================== */
function switchSection(section){
  sections.forEach((sectionNode) => sectionNode.classList.add("hidden"));
  document.querySelectorAll('.admin-sidebar li').forEach((li) => li.classList.remove('active'));
  const el = document.getElementById(section + '-section');
  const sidebarItem = document.querySelector(`.admin-sidebar li[data-section="${section}"]`);
  if(el) el.classList.remove('hidden');
  if(sidebarItem) sidebarItem.classList.add('active');

  if (section === "documents-receipts") {
    renderReceiptMonitorTable();
    renderDocumentMonitorTable();
  } else if (section === "settings") {
    renderEmailJsSettings();
    renderStaffAccountsTable();
  } else if (section === "users" || section === "overview") {
    renderUsersTable();
  }
}

function renderUsersTable(){
  const users = getVisibleUsers(JSON.parse(localStorage.getItem('users')) || []);
  if(totalUsersEl) totalUsersEl.textContent = String(users.length);
  if(activeUsersEl) activeUsersEl.textContent = String(users.filter((user) => user.active).length);
  if(totalTransactionsEl) totalTransactionsEl.textContent = String(users.reduce((acc,user) => (acc + (Array.isArray(user.transactions) ? user.transactions.length : 0)), 0));
  if(totalBalanceEl) totalBalanceEl.textContent = '$' + String(users.reduce((acc,user) => (acc + (parseFloat(user.balance) || 0)), 0).toFixed(2));
  if (totalCryptoAssetsEl) {
    const totalAssets = users.reduce((acc, user) => {
      const assets = user.assets || {};
      return acc + Object.values(assets).reduce((assetAcc, value) => assetAcc + (Number(value) || 0), 0);
    }, 0);
    totalCryptoAssetsEl.textContent = totalAssets.toFixed(4);
  }

  const tbody = document.getElementById('users-tbody');
  if(!tbody) return;
  tbody.innerHTML = '';
  users.forEach((user) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${user.firstName||''} ${user.lastName||''}</td>
      <td>${user.email||''}</td>
      <td>${user.phone||''}</td>
      <td>${user.balance||0}</td>
      <td class="${user.active ? 'status-active' : 'status-inactive'}">${user.active ? 'Active' : 'Inactive'}</td>
      <td>
        <button class="btn-admin btn-view" data-email="${user.email}">View</button>
        <button class="btn-admin btn-deposit" data-email="${user.email}">Deposit</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('.btn-view').forEach((btn) => btn.addEventListener('click', () => openUserDetails(btn.dataset.email)));
  tbody.querySelectorAll('.btn-deposit').forEach((btn) => btn.addEventListener('click', () => openAdminDepositModal(btn.dataset.email)));
}

/* ================= Admin deposit helpers ================= */
function openAdminDepositModal(email){
  const users = JSON.parse(localStorage.getItem('users')) || [];
  const target = users.find((user) => String(user.email || '').toLowerCase() === String(email || '').toLowerCase());
  if(!target) return alert('User not found');

  let modal = document.getElementById('admin-deposit-modal');
  if(!modal){
    modal = document.createElement('div');
    modal.id = 'admin-deposit-modal';
    modal.className = 'user-details-modal show';
    modal.innerHTML = `
      <div class="user-details-content" style="max-width:460px;">
        <h3>Deposit to <span id="adm-dep-name"></span></h3>
        <div class="user-detail-field"><label>Amount</label><input id="adm-dep-amount" type="number" min="0" step="0.01"></div>
        <div class="user-detail-field"><label>Note</label><input id="adm-dep-note" type="text"></div>
        <div class="modal-actions"><button id="adm-dep-confirm" class="btn-admin btn-primary">Confirm</button><button id="adm-dep-cancel" class="btn-close">Cancel</button></div>
      </div>
    `;
    document.body.appendChild(modal);
    document.getElementById('adm-dep-cancel')?.addEventListener('click', () => modal.remove());
    document.getElementById('adm-dep-confirm')?.addEventListener('click', () => {
      const amt = parseFloat(document.getElementById('adm-dep-amount').value) || 0;
      const note = document.getElementById('adm-dep-note').value || '';
      if (amt <= 0) { alert('Enter a valid amount'); return; }
      modal.remove();
      processAdminDeposit(email, amt, note);
    });
  }
  document.getElementById('adm-dep-name').textContent = `${target.firstName || ''} ${target.lastName || ''} (${target.email || ''})`;
  modal.classList.add("show");
}

function processAdminDeposit(email, amount, note){
  try{
    const users = JSON.parse(localStorage.getItem('users')) || [];
    const idx = users.findIndex((user) => String(user.email || '').toLowerCase() === String(email || '').toLowerCase());
    if(idx === -1) return alert('User not found');

    const user = users[idx];
    const newBalance = (parseFloat(user.balance) || 0) + Number(amount);
    user.balance = Number(newBalance).toFixed(2);
    user.transactions = user.transactions || [];

    const tx = {
      id: `TX-${Date.now()}`,
      type: 'admin-deposit',
      amount: `${amount}`,
      status: 'completed',
      date: new Date().toLocaleString(),
      note
    };
    user.transactions.push(tx);
    users[idx] = user;
    localStorage.setItem('users', JSON.stringify(users));

    const receipts = getStorageArray(RECEIPTS_STORAGE_KEY);
    const receipt = {
      id: `RCT-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      receiptNumber: `STB-${new Date().getFullYear()}-${Math.random().toString(36).slice(2,8).toUpperCase()}`,
      createdAt: new Date().toISOString(),
      userId: user.id || '',
      userName: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
      userEmail: user.email || '',
      transactionType: 'admin-deposit',
      displayAmount: `${amount}`,
      amountValue: Number(amount),
      transactionDate: new Date().toLocaleString(),
      status: 'completed',
      source: 'admin',
      metadata: { note: note || "" }
    };
    receipts.unshift(receipt);
    setStorageArray(RECEIPTS_STORAGE_KEY, receipts);

    try {
      const logs = JSON.parse(localStorage.getItem('activityLog') || '[]');
      logs.unshift({ type: 'admin_deposit', userEmail: user.email, amount, ts: new Date().toISOString() });
      localStorage.setItem('activityLog', JSON.stringify(logs));
    } catch (err) {
      console.error("Could not persist activity log.", err);
    }

    alert('Deposit successful');
    renderUsersTable();
    renderReceiptMonitorTable();
  } catch(e) {
    console.error('processAdminDeposit', e);
    alert('Failed to process deposit');
  }
}

function openUserDetails(email){
  const users = JSON.parse(localStorage.getItem('users')) || [];
  const user = users.find((row) => String(row.email || '').toLowerCase() === String(email || '').toLowerCase());
  if(!user) return alert('User not found');
  if (!isUserVisible(user)) return alert('You are not assigned to this client.');

  const detailId = document.getElementById('detail-client-id');
  const detailName = document.getElementById('detail-name');
  const detailEmail = document.getElementById('detail-email');
  const detailPhone = document.getElementById('detail-phone');
  const detailBalance = document.getElementById('detail-balance');
  const detailStatus = document.getElementById('detail-status');
  const detailAssets = document.getElementById('detail-assets');

  if (detailId) detailId.textContent = user.id || "-";
  if (detailName) detailName.textContent = `${user.firstName || ''} ${user.lastName || ''}`.trim() || "-";
  if (detailEmail) detailEmail.textContent = user.email || "-";
  if (detailPhone) detailPhone.textContent = user.phone || "-";
  if (detailBalance) detailBalance.textContent = String(user.balance || "0");
  if (detailStatus) detailStatus.textContent = user.active ? "Active" : "Inactive";

  if (detailAssets) {
    const assets = user.assets || {};
    detailAssets.innerHTML = Object.entries(assets).map(([asset, value]) => `
      <div class="asset-item">
        <span>${asset}</span>
        <span>${value}</span>
      </div>
    `).join("") || '<div style="color:#aaa;">No asset balances yet.</div>';
  }

  userDetailsModal?.classList.add("show");
}

/* ------------------ Chat / Conversation Readers ------------------ */
function scanChatConversations(){
  try{
    return Object.keys(localStorage)
      .filter((key) => key.startsWith('chat_conversations_guest_'))
      .map((key) => {
        const list = JSON.parse(localStorage.getItem(key) || '[]') || [];
        const last = list.length ? list[list.length - 1] : null;
        return {
          key,
          guestId: key.replace('chat_conversations_guest_', ''),
          lastMessage: last ? last.message : '',
          lastAt: last ? last.timestamp : '',
          messages: list
        };
      });
  }catch(e){
    console.error('scanChatConversations', e);
    return [];
  }
}

function renderChatUsersList(){
  const container = document.getElementById('chat-users-tbody');
  if(!container){ return; }
  const convs = scanChatConversations();
  container.innerHTML = '';
  if(!convs.length){ container.innerHTML = '<div style="color:#aaa; padding:8px;">No conversations yet.</div>'; return; }
  convs.forEach((conversation) => {
    const row = document.createElement('div');
    row.className = 'chat-user-row';
    row.dataset.key = conversation.key;
    row.innerHTML = `<div class="chat-user-name">Guest ${conversation.guestId}</div><div class="chat-user-last">${conversation.lastMessage}</div><div class="chat-user-time">${conversation.lastAt}</div>`;
    row.addEventListener('click', () => renderConversation(conversation.key));
    container.appendChild(row);
  });
}

function renderConversation(key){
  const display = document.getElementById('chat-messages-display');
  if(!display) return;
  try{
    const conv = JSON.parse(localStorage.getItem(key) || '[]') || [];
    display.innerHTML = '';
    if(!conv.length){ display.innerHTML = '<div style="color:#aaa; padding:8px;">No messages</div>'; return; }
    conv.forEach((message) => {
      const el = document.createElement('div');
      el.className = 'conversation-message ' + (message.sender === 'user' ? 'from-user' : (message.sender === 'admin' ? 'from-admin' : 'from-system'));
      el.innerHTML = `<div class="conv-sender">${message.sender}</div><div class="conv-body">${message.message}</div><div class="conv-time">${message.timestamp}</div>`;
      display.appendChild(el);
    });
  }catch(e){
    console.error('renderConversation', e);
    display.innerHTML = '<div style="color:#f66">Failed to load conversation</div>';
  }
}

function renderActivityLog(){
  const listEl = document.getElementById('activity-log-list');
  if(!listEl) return;
  const logs = JSON.parse(localStorage.getItem('activityLog')||'[]');
  if(!logs.length){ listEl.innerHTML = '<div style="color:#777;">No recent activity</div>'; return; }
  listEl.innerHTML = '';
  logs.slice(0,50).forEach((log) => {
    const row = document.createElement('div');
    row.style.padding='6px 0';
    row.style.borderBottom='1px solid rgba(255,255,255,0.03)';
    const when = new Date(log.ts).toLocaleString();
    row.innerHTML = `<div style="font-size:12px;color:#9ae6b4">${log.type}</div><div style="font-size:12px;color:#ccc">${log.userEmail ? log.userEmail : log.label || ''} <span style="color:#777">${when}</span></div>`;
    listEl.appendChild(row);
  });
}

function initAdminDashboard(){
  document.querySelectorAll('.admin-sidebar li').forEach((li) => {
    li.addEventListener('click', () => switchSection(li.dataset.section));
  });

  closeDetailsBtn?.addEventListener("click", () => userDetailsModal?.classList.remove("show"));
  staffActivityCloseBtn?.addEventListener("click", () => staffActivityModal?.classList.remove("show"));
  staffSaveClientsBtn?.addEventListener("click", saveSelectedStaffClients);
  staffCreateBtn?.addEventListener("click", createStaffAccount);

  emailJsSaveBtn?.addEventListener("click", saveEmailJsSettings);
  emailJsClearBtn?.addEventListener("click", clearEmailJsSettings);
  emailJsTestBtn?.addEventListener("click", () => { sendEmailJsTest(); });

  document.getElementById("admin-logout")?.addEventListener("click", () => {
    localStorage.removeItem("adminLoggedIn");
    localStorage.removeItem(ADMIN_SESSION_KEY);
    window.location.href = "admin-login.html";
  });

  const users = getStorageArray('users');
  if(Array.isArray(users) && users.length) {
    switchSection('users');
  } else {
    switchSection('overview');
  }

  renderUsersTable();
  renderChatUsersList();
  renderStaffAccountsTable();
  renderEmailJsSettings();
  renderReceiptMonitorTable();
  renderDocumentMonitorTable();
  renderActivityLog();
}

document.addEventListener('DOMContentLoaded', ()=>{
  try{
    renderAdminSessionBadge();
    initAdminDashboard();
  }catch(e){
    console.error('admin init', e);
  }
});
