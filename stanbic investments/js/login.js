// Check if already logged in
const currentUser = JSON.parse(localStorage.getItem("currentUser") || "null");
if (currentUser) {
  window.location.href = "dashboard.html";
}

const loginForm = document.getElementById("login-form");
const loginInput = document.getElementById("login-input") || document.getElementById("login-email");
const passInput = document.getElementById("login-passcode");
const forgotBtn = document.getElementById("forgot-btn");
const loginMsg = document.getElementById("login-msg");

if (loginForm && loginInput && passInput) {
  loginForm.onsubmit = (e) => {
    e.preventDefault();
    if (loginMsg) loginMsg.textContent = "";

    const input = loginInput.value.trim();
    const pass = passInput.value.trim();
    const users = JSON.parse(localStorage.getItem("users") || "[]");
    const user = users.find((u) =>
      (u.email === input || u.phone === input) && u.passcode === pass
    );

    if (user) {
      localStorage.setItem("currentUser", JSON.stringify(user));
      localStorage.removeItem("adminLoggedIn");
      localStorage.removeItem("adminSession");
      window.location.href = "dashboard.html";
      return;
    }

    if (loginMsg) {
      loginMsg.textContent = "Invalid login credentials.";
    } else {
      alert("Invalid login");
    }
  };
}

// FORGOT PASSWORD (SIMULATED)
forgotBtn?.addEventListener("click", () => {
  const email = prompt("Enter your email");
  if (!email) return;

  const users = JSON.parse(localStorage.getItem("users") || "[]");
  const index = users.findIndex((u) => u.email === email);
  if (index === -1) {
    alert("Email not found");
    return;
  }

  alert("Reset link sent to email (SIMULATED)");
  const newPass = prompt("Enter new passcode");
  if (!newPass) return;

  users[index].passcode = newPass;
  localStorage.setItem("users", JSON.stringify(users));
  alert("Password updated");
});
