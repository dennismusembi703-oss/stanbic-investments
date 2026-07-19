// ADMIN / STAFF LOGIN LOGIC
const ADMIN_ACCOUNTS_KEY = "adminAccounts";
const ADMIN_SESSION_KEY = "adminSession";
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

function loadAdminAccounts() {
  let parsedAccounts = [];
  try {
    const raw = JSON.parse(localStorage.getItem(ADMIN_ACCOUNTS_KEY) || "[]");
    if (Array.isArray(raw)) {
      parsedAccounts = raw;
    }
  } catch (err) {
    console.error("Failed to parse stored admin accounts.", err);
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

  if (!parsedAccounts.length) {
    localStorage.setItem(ADMIN_ACCOUNTS_KEY, JSON.stringify(DEFAULT_ADMIN_ACCOUNTS));
  } else {
    localStorage.setItem(ADMIN_ACCOUNTS_KEY, JSON.stringify(accounts));
  }

  return accounts;
}

function saveAdminAccounts(accounts) {
  const normalized = [];
  const seen = {};

  (accounts || []).forEach((account) => {
    const clean = sanitizeAdminAccount(account);
    if (!clean) return;
    const key = normalizeUsername(clean.username);
    if (seen[key]) return;
    seen[key] = true;
    normalized.push(clean);
  });

  if (!normalized.some((account) => account.role === "super-admin")) {
    normalized.unshift({ ...DEFAULT_ADMIN_ACCOUNTS[0] });
  }

  localStorage.setItem(ADMIN_ACCOUNTS_KEY, JSON.stringify(normalized));
  return normalized;
}

function getExistingSession() {
  try {
    return JSON.parse(localStorage.getItem(ADMIN_SESSION_KEY) || "null");
  } catch (err) {
    console.error("Failed to parse admin session.", err);
    return null;
  }
}

// Check if already logged in as admin or staff
if (localStorage.getItem("adminLoggedIn") === "true" || getExistingSession()) {
  window.location.href = "admin.html";
}

// Ensure accounts exist before login attempts.
loadAdminAccounts();

// ADMIN / STAFF LOGIN FORM
document.getElementById("admin-login-form").onsubmit = (e) => {
  e.preventDefault();

  const username = document.getElementById("admin-input").value.trim();
  const password = document.getElementById("admin-passcode").value.trim();

  if (!username || !password) {
    showError("Please fill in all fields");
    return;
  }

  const accounts = loadAdminAccounts();
  const matchedAccount = accounts.find(
    (account) =>
      normalizeUsername(account.username) === normalizeUsername(username) &&
      account.password === password
  );

  if (!matchedAccount) {
    showError("Invalid admin/staff credentials");
    return;
  }

  const session = {
    username: matchedAccount.username,
    displayName: matchedAccount.displayName || matchedAccount.username,
    role: matchedAccount.role || "staff",
    fullAccess: matchedAccount.fullAccess !== false,
    loggedInAt: new Date().toISOString()
  };

  localStorage.setItem("adminLoggedIn", "true");
  localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(session));
  alert(`Welcome ${session.displayName}`);
  window.location.href = "admin.html";
};

function showError(message) {
  const errorEl = document.getElementById("error-message");
  errorEl.textContent = message;
  errorEl.style.display = "block";
  setTimeout(() => {
    errorEl.style.display = "none";
  }, 5000);
}
