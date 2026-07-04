const API = "https://2tanvczp43.execute-api.us-east-1.amazonaws.com/Prod";
const USER_POOL_ID = "us-east-1_j2KErhcC1";
const USER_POOL_CLIENT_ID = "2qmncn1b212ungb0g21i5l4sb2";

const poolData = {
  UserPoolId: USER_POOL_ID,
  ClientId: USER_POOL_CLIENT_ID
};

const userPool = new AmazonCognitoIdentity.CognitoUserPool(poolData);
let lastSignupEmail = "";

function getAuthToken() {
  return localStorage.getItem("crudnotes_id_token");
}

function setAuthToken(token) {
  if (token) {
    localStorage.setItem("crudnotes_id_token", token);
  } else {
    localStorage.removeItem("crudnotes_id_token");
  }
}

function valueFrom(id) {
  return document.getElementById(id)?.value?.trim() || "";
}

function getSignupEmail() {
  return valueFrom("signupEmail").toLowerCase();
}

function getSignupPassword() {
  return document.getElementById("signupPassword")?.value || "";
}

function getLoginEmail() {
  return valueFrom("loginEmail").toLowerCase();
}

function getLoginPassword() {
  return document.getElementById("loginPassword")?.value || "";
}

function getConfirmEmail() {
  return valueFrom("confirmEmail").toLowerCase() || lastSignupEmail;
}

function setAuthStatus(message) {
  const status = document.getElementById("authStatus");
  if (status) status.textContent = message;
}

function setSignedInView(isSignedIn) {
  document.querySelectorAll(".app-only").forEach(el => {
    el.style.display = isSignedIn ? "grid" : "none";
  });
}

function showSignupCard() {
  const signup = document.getElementById("signupFields");
  const login = document.getElementById("loginFields");

  signup?.classList.add("active");
  login?.classList.remove("active");

  if (signup) signup.style.display = "block";
  if (login) login.style.display = "none";

  const label = document.getElementById("authModeLabel");
  const title = document.getElementById("authCardTitle");
  const copy = document.getElementById("authCardCopy");
  if (label) label.textContent = "Create your account";
  if (title) title.textContent = "Start using CrudNotes";
  if (copy) copy.textContent = "Sign up with your email. Cognito will send a verification code to confirm your account.";
}

function showLoginCard() {
  const signup = document.getElementById("signupFields");
  const login = document.getElementById("loginFields");

  login?.classList.add("active");
  signup?.classList.remove("active");

  if (login) login.style.display = "block";
  if (signup) signup.style.display = "none";

  const label = document.getElementById("authModeLabel");
  const title = document.getElementById("authCardTitle");
  const copy = document.getElementById("authCardCopy");
  if (label) label.textContent = "Welcome back";
  if (title) title.textContent = "Log in to CrudNotes";
  if (copy) copy.textContent = "Enter your email and password to continue managing your private notes.";
}

function updateAppVisibility() {
  const isSignedIn = Boolean(getAuthToken());

  setSignedInView(isSignedIn);

  const authSection = document.getElementById("signupSection");
  if (authSection) {
    authSection.style.display = isSignedIn ? "none" : "";
  }

  if (isSignedIn) {
    const displayName = localStorage.getItem("crudnotes_display_name") || "there";
    setAuthStatus(`Welcome back, ${displayName}. Your notes are private to your account.`);
  } else {
    setAuthStatus("Sign in to manage your notes.");
    const list = document.getElementById("list");
    if (list) list.innerHTML = "";
    showSignupCard();
  }
}

function scrollToSignup() {
  showSignupCard();
  document.getElementById("signupSection")?.scrollIntoView({ behavior: "smooth", block: "center" });
}

function focusLogin() {
  showLoginCard();
  document.getElementById("signupSection")?.scrollIntoView({ behavior: "smooth", block: "center" });
  setTimeout(() => document.getElementById("loginEmail")?.focus(), 250);
}

function bindAuthToggleButtons() {
  document.querySelectorAll("[data-auth-mode]").forEach(button => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      switchAuthMode(button.dataset.authMode);
    });
  });

  document.querySelectorAll(".login-link, #loginLink, #showLogin, #showLoginButton").forEach(button => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      switchAuthMode("login");
    });
  });

  document.querySelectorAll(".signup-link, #signupLink, #showSignup, #showSignupButton").forEach(button => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      switchAuthMode("signup");
    });
  });
}

function openAuthModal() {
  const modal = document.getElementById("authModal");
  if (!modal) return;

  if (lastSignupEmail) {
    const confirmEmail = document.getElementById("confirmEmail");
    const confirmEmailLabel = document.getElementById("confirmEmailLabel");
    if (confirmEmail) confirmEmail.value = lastSignupEmail;
    if (confirmEmailLabel) confirmEmailLabel.textContent = lastSignupEmail;
  }

  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
}

function closeAuthModal() {
  const modal = document.getElementById("authModal");
  if (!modal) return;
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
}

function switchAuthMode(mode) {
  if (mode === "login") {
    closeAuthModal();
    focusLogin();
    return;
  }

  if (mode === "signup") {
    closeAuthModal();
    scrollToSignup();
    return;
  }

  openAuthModal();
}

function currentCognitoUser(email) {
  if (!email) throw new Error("Email is required");

  return new AmazonCognitoIdentity.CognitoUser({
    Username: email,
    Pool: userPool
  });
}

function signUp() {
  const email = getSignupEmail();
  const password = getSignupPassword();
  const displayName = valueFrom("signupName");

  if (!email || !password) {
    alert("Email and password are required.");
    return;
  }

  const attributes = [
    new AmazonCognitoIdentity.CognitoUserAttribute({
      Name: "email",
      Value: email
    })
  ];

  if (displayName) {
    attributes.push(new AmazonCognitoIdentity.CognitoUserAttribute({
      Name: "name",
      Value: displayName
    }));
  }

  userPool.signUp(email, password, attributes, null, (err) => {
    if (err) {
      alert(`Could not sign up: ${err.message || JSON.stringify(err)}`);
      return;
    }

    lastSignupEmail = email;
    localStorage.setItem("crudnotes_display_name", displayName || email.split("@")[0]);
    openAuthModal();
  });
}

function confirmSignUp() {
  const email = getConfirmEmail();
  const code = valueFrom("confirmCode");

  if (!email) {
    alert("Email is required.");
    return;
  }

  if (!code) {
    alert("Verification code is required.");
    return;
  }

  let cognitoUser;
  try {
    cognitoUser = currentCognitoUser(email);
  } catch (err) {
    alert(err.message);
    return;
  }

  cognitoUser.confirmRegistration(code, true, (err) => {
    if (err) {
      alert(`Could not confirm sign up: ${err.message || JSON.stringify(err)}`);
      return;
    }

    alert("Account confirmed. You can now sign in.");
    closeAuthModal();
    const loginEmail = document.getElementById("loginEmail");
    if (loginEmail) loginEmail.value = email;
    focusLogin();
  });
}

function signIn() {
  const email = getLoginEmail();
  const password = getLoginPassword();

  if (!email || !password) {
    alert("Email and password are required.");
    return;
  }

  let cognitoUser;
  try {
    cognitoUser = currentCognitoUser(email);
  } catch (err) {
    alert(err.message);
    return;
  }

  const authDetails = new AmazonCognitoIdentity.AuthenticationDetails({
    Username: email,
    Password: password
  });

  cognitoUser.authenticateUser(authDetails, {
    onSuccess: (session) => {
      const idToken = session.getIdToken().getJwtToken();
      const payload = JSON.parse(atob(idToken.split(".")[1]));
      const displayName = payload.name || payload.email || email;

      setAuthToken(idToken);
      localStorage.setItem("crudnotes_display_name", displayName);
      updateAppVisibility();
      setSignedInView(true);
      loadNotes();
    },
    onFailure: (err) => {
      alert(`Could not sign in: ${err.message || JSON.stringify(err)}`);
    }
  });
}

function signOut() {
  const user = userPool.getCurrentUser();
  if (user) user.signOut();
  setAuthToken(null);
  localStorage.removeItem("crudnotes_display_name");
  updateAppVisibility();
  showLoginCard();
}

async function apiFetch(path, options = {}) {
  const token = getAuthToken();
  if (!token) throw new Error("Please sign in first.");

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
    ...(options.headers || {})
  };

  const res = await fetch(`${API}${path}`, {
    ...options,
    headers
  });

  if (res.status === 401 || res.status === 403) {
    setAuthToken(null);
    updateAppVisibility();
    throw new Error("Session expired or unauthorized. Please sign in again.");
  }

  if (!res.ok) {
    const message = await res.text();
    throw new Error(message || `Request failed with status ${res.status}`);
  }

  if (res.status === 204) return null;
  return res.json();
}

async function loadNotes() {
  if (!getAuthToken()) {
    updateAppVisibility();
    return;
  }

  try {
    const notes = await apiFetch("/notes");
    const list = document.getElementById("list");
    list.innerHTML = "";

    if (!notes.length) {
      list.innerHTML = `<p class="empty">No notes yet. Create your first note above.</p>`;
      return;
    }

    notes.forEach(n => {
      const div = document.createElement("div");
      div.className = "note";
      div.innerHTML = `
        <strong>${escapeHtml(n.title || "")}</strong>
        <p>${escapeHtml(n.content || "")}</p>
        <div class="actions">
          <button onclick="editNote('${n.noteId}', '${escapeForAttribute(n.title || "")}', '${escapeForAttribute(n.content || "")}')">Edit</button>
          <button onclick="deleteNote('${n.noteId}')">Delete</button>
        </div>
      `;
      list.appendChild(div);
    });
  } catch (err) {
    alert(`Could not load notes: ${err.message}`);
  }
}

async function createNote() {
  const title = valueFrom("title");
  const content = valueFrom("content");
  if (!title) { alert("Title is required"); return; }

  try {
    await apiFetch("/notes", {
      method: "POST",
      body: JSON.stringify({ title, content })
    });
    document.getElementById("title").value = "";
    document.getElementById("content").value = "";
    loadNotes();
  } catch (err) {
    alert(`Could not create note: ${err.message}`);
  }
}

async function editNote(id, currentTitle = "", currentContent = "") {
  const title = prompt("New title:", currentTitle);
  if (title === null) return;
  const content = prompt("New content:", currentContent);
  if (content === null) return;

  try {
    await apiFetch(`/notes/${id}`, {
      method: "PUT",
      body: JSON.stringify({ title: title.trim(), content: content.trim() })
    });
    loadNotes();
  } catch (err) {
    alert(`Could not update note: ${err.message}`);
  }
}

async function deleteNote(id) {
  if (!confirm("Delete this note?")) return;

  try {
    await apiFetch(`/notes/${id}`, { method: "DELETE" });
    loadNotes();
  } catch (err) {
    alert(`Could not delete note: ${err.message}`);
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"
  }[m]));
}

function escapeForAttribute(s) {
  return escapeHtml(s).replace(/`/g, "&#96;");
}

window.showSignupCard = showSignupCard;
window.showLoginCard = showLoginCard;
window.scrollToSignup = scrollToSignup;
window.focusLogin = focusLogin;
window.bindAuthToggleButtons = bindAuthToggleButtons;
window.openAuthModal = openAuthModal;
window.closeAuthModal = closeAuthModal;
window.switchAuthMode = switchAuthMode;
window.signUp = signUp;
window.confirmSignUp = confirmSignUp;
window.signIn = signIn;
window.signOut = signOut;
window.loadNotes = loadNotes;
window.createNote = createNote;
window.editNote = editNote;
window.deleteNote = deleteNote;

document.addEventListener("DOMContentLoaded", () => {
  bindAuthToggleButtons();
  showSignupCard();
  updateAppVisibility();
  loadNotes();
});