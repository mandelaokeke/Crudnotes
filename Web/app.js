const API = "https://2tanvczp43.execute-api.us-east-1.amazonaws.com/Prod";
const USER_POOL_ID = "us-east-1_j2KErhcC1";
const USER_POOL_CLIENT_ID = "2qmncn1b212ungb0g21i5l4sb2";

const poolData = {
  UserPoolId: USER_POOL_ID,
  ClientId: USER_POOL_CLIENT_ID
};

const userPool = new AmazonCognitoIdentity.CognitoUserPool(poolData);
let lastSignupEmail = "";
let notesCache = [];
let selectedNoteId = null;

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
    el.classList.toggle("visible", isSignedIn);
    el.style.display = "";
  });
}

function showSignupCard() {
  const signupSection = document.getElementById("signupSection");
  const loginSection = document.getElementById("loginSection");

  if (loginSection) {
    loginSection.classList.remove("active");
    loginSection.style.display = "none";
  }

  if (signupSection) {
    signupSection.classList.add("active");
    signupSection.style.display = "";
  }

  setTimeout(() => document.getElementById("signupEmail")?.focus(), 250);
}

function showLoginCard() {
  const signupSection = document.getElementById("signupSection");
  const loginSection = document.getElementById("loginSection");

  if (signupSection) {
    signupSection.classList.remove("active");
    signupSection.style.display = "none";
  }

  if (loginSection) {
    loginSection.classList.add("active");
    loginSection.style.display = "";
    loginSection.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  setTimeout(() => document.getElementById("loginEmail")?.focus(), 250);
}

function updateAppVisibility() {
  const isSignedIn = Boolean(getAuthToken());

  setSignedInView(isSignedIn);

  const heroSection = document.getElementById("heroSection");
  const signupSection = document.getElementById("signupSection");
  const loginSection = document.getElementById("loginSection");

  if (heroSection) heroSection.style.display = isSignedIn ? "none" : "";
  if (signupSection) signupSection.style.display = isSignedIn ? "none" : "";
  if (loginSection) loginSection.style.display = "none";

  if (isSignedIn) {
    const displayName = localStorage.getItem("crudnotes_display_name") || "there";
    setAuthStatus(`Welcome back, ${displayName}. Your notes are private to your account.`);
  } else {
    setAuthStatus("Sign in to manage your notes.");
    notesCache = [];
    selectedNoteId = null;
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

  const list = document.getElementById("list");
  if (!list) return;

  list.innerHTML = `<p class="muted sidebar-empty">Loading notes...</p>`;

  try {
    const notes = await apiFetch("/notes");
    notesCache = Array.isArray(notes) ? notes : [];

    if (!notesCache.length) {
      selectedNoteId = null;
      list.innerHTML = `<p class="muted sidebar-empty">No notes yet. Create your first note.</p>`;
      renderSelectedNote(null);
      return;
    }

    if (!selectedNoteId || !notesCache.some(note => note.noteId === selectedNoteId)) {
      selectedNoteId = notesCache[0].noteId;
    }

    renderNoteTitles();
    renderSelectedNote(notesCache.find(note => note.noteId === selectedNoteId));
  } catch (err) {
    list.innerHTML = `<p class="error">Could not load notes: ${escapeHtml(err.message)}</p>`;
  }
}

function renderNoteTitles() {
  const list = document.getElementById("list");
  if (!list) return;

  list.innerHTML = notesCache.map(note => {
    const isActive = note.noteId === selectedNoteId ? "active" : "";
    const title = escapeHtml(note.title || "Untitled note");
    const preview = escapeHtml((note.content || "").split("\n").find(Boolean) || "No content yet");

    return `
      <button class="note-title-item ${isActive}" type="button" onclick="selectNote('${note.noteId}')">
        <strong>${title}</strong>
        <span>${preview}</span>
      </button>
    `;
  }).join("");
}

function selectNote(noteId) {
  selectedNoteId = noteId;
  const note = notesCache.find(item => item.noteId === noteId);
  renderNoteTitles();
  renderSelectedNote(note);
}

function renderSelectedNote(note) {
  const heading = document.getElementById("editorHeading");
  const titleInput = document.getElementById("title");
  const contentInput = document.getElementById("content");
  const preview = document.getElementById("selectedNotePreview");

  if (!note) {
    if (heading) heading.textContent = "Create Note";
    if (titleInput) titleInput.value = "";
    if (contentInput) contentInput.value = "";
    if (preview) {
      preview.className = "selected-note-preview empty-state";
      preview.textContent = "Select a note title from the left to preview it here.";
    }
    return;
  }

  if (heading) heading.textContent = "Edit Note";
  if (titleInput) titleInput.value = note.title || "";
  if (contentInput) contentInput.value = note.content || "";

  if (preview) {
    preview.className = "selected-note-preview";
    preview.innerHTML = `
      <h3>${escapeHtml(note.title || "Untitled note")}</h3>
      <div class="note-body-formatted">${formatNoteContent(note.content || "")}</div>
      <div class="note-preview-actions">
        <button class="ghost" type="button" onclick="deleteNote('${note.noteId}')">Delete</button>
      </div>
    `;
  }
}

function startNewNote() {
  selectedNoteId = null;
  renderNoteTitles();
  renderSelectedNote(null);
  setTimeout(() => document.getElementById("title")?.focus(), 100);
}

async function saveCurrentNote() {
  if (selectedNoteId) {
    await updateNote(selectedNoteId);
  } else {
    await createNote();
  }
}

function formatNoteContent(content) {
  const safeContent = escapeHtml(content || "");
  if (!safeContent.trim()) return "<p>No content yet.</p>";

  return safeContent
    .replace(/\n{2,}/g, "</p><p>")
    .replace(/\n/g, "<br>")
    .replace(/^/, "<p>")
    .replace(/$/, "</p>");
}

async function createNote() {
  const title = valueFrom("title");
  const content = document.getElementById("content")?.value || "";

  if (!title) {
    alert("Title is required");
    return;
  }

  try {
    const createdNote = await apiFetch("/notes", {
      method: "POST",
      body: JSON.stringify({ title, content })
    });

    selectedNoteId = createdNote?.noteId || null;
    await loadNotes();
  } catch (err) {
    alert(`Could not create note: ${err.message}`);
  }
}

async function updateNote(id) {
  const title = valueFrom("title");
  const content = document.getElementById("content")?.value || "";

  if (!title) {
    alert("Title is required");
    return;
  }

  try {
    await apiFetch(`/notes/${id}`, {
      method: "PUT",
      body: JSON.stringify({ title, content })
    });

    selectedNoteId = id;
    await loadNotes();
  } catch (err) {
    alert(`Could not update note: ${err.message}`);
  }
}

function editNote(id) {
  selectNote(id);
}

async function deleteNote(id) {
  if (!confirm("Delete this note?")) return;

  try {
    await apiFetch(`/notes/${id}`, { method: "DELETE" });

    if (selectedNoteId === id) selectedNoteId = null;
    await loadNotes();
  } catch (err) {
    alert(`Could not delete note: ${err.message}`);
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"
  }[m]));
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
window.selectNote = selectNote;
window.startNewNote = startNewNote;
window.saveCurrentNote = saveCurrentNote;
window.updateNote = updateNote;

document.addEventListener("DOMContentLoaded", () => {
  bindAuthToggleButtons();
  showSignupCard();
  updateAppVisibility();
  loadNotes();
});