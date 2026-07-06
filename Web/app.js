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
let editorMode = "new";
const SESSION_TIMEOUT_MS = 5 * 60 * 1000;
const AUTOSAVE_DELAY_MS = 1200;
let sessionTimeoutId = null;
let autosaveTimerId = null;
let saveStatusResetTimerId = null;
let lastSavedSnapshot = { title: "", content: "" };
let editorSelectionRange = null;

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

function resetSessionTimeout() {
  if (sessionTimeoutId) {
    clearTimeout(sessionTimeoutId);
    sessionTimeoutId = null;
  }

  if (!getAuthToken()) return;

  sessionTimeoutId = setTimeout(() => {
    alert("Your session timed out after 5 minutes of inactivity. Please log in again.");
    signOut();
  }, SESSION_TIMEOUT_MS);
}

function stopSessionTimeout() {
  if (sessionTimeoutId) {
    clearTimeout(sessionTimeoutId);
    sessionTimeoutId = null;
  }
}

function bindSessionActivityTracking() {
  ["click", "keydown", "mousemove", "scroll", "touchstart"].forEach(eventName => {
    window.addEventListener(eventName, resetSessionTimeout, { passive: true });
  });
}

function setSignedInView(isSignedIn) {
  document.querySelectorAll(".app-only").forEach(el => {
    el.classList.toggle("visible", isSignedIn);
    el.style.display = "";
  });

  document.querySelectorAll(".auth-only").forEach(el => {
    el.classList.toggle("hidden", isSignedIn);
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

  const signupSection = document.getElementById("signupSection");
  const loginSection = document.getElementById("loginSection");

  if (isSignedIn) {
    if (signupSection) signupSection.style.display = "none";
    if (loginSection) loginSection.style.display = "none";

    const displayName = localStorage.getItem("crudnotes_display_name") || "there";
    setAuthStatus(`Welcome back, ${displayName}. Your notes are private to your account.`);
    resetSessionTimeout();
    return;
  }

  setAuthStatus("Sign in to manage your notes.");
  stopSessionTimeout();
  clearAutosaveTimer();
  notesCache = [];
  selectedNoteId = null;
  editorMode = "new";
  updateSavedSnapshot();

  const list = document.getElementById("list");
  if (list) list.innerHTML = "";

  if (loginSection?.classList.contains("active")) {
    showLoginCard();
  } else {
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
      selectedNoteId = null;
      editorMode = "new";
      updateSavedSnapshot();
      updateAppVisibility();
      loadNotes();
    },
    onFailure: (err) => {
      alert(`Could not sign in: ${err.message || JSON.stringify(err)}`);
    }
  });
}

function signOut() {
  stopSessionTimeout();

  const user = userPool.getCurrentUser();
  if (user) user.signOut();

  setAuthToken(null);
  localStorage.removeItem("crudnotes_display_name");
  notesCache = [];
  selectedNoteId = null;
  editorMode = "new";
  clearAutosaveTimer();
  updateSavedSnapshot();

  const titleInput = document.getElementById("title");
  const contentInput = document.getElementById("content");
  const list = document.getElementById("list");

  if (titleInput) titleInput.value = "";
  if (contentInput) contentInput.innerHTML = "";
  if (list) list.innerHTML = "";

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
      editorMode = "new";
      list.innerHTML = `<p class="muted sidebar-empty">No notes yet. Create your first note.</p>`;
      renderSelectedNote(null);
      return;
    }

    if (selectedNoteId && !notesCache.some(note => note.noteId === selectedNoteId)) {
      selectedNoteId = null;
      editorMode = "new";
    }

    renderNoteTitles();

    if (selectedNoteId) {
      renderSelectedNote(notesCache.find(note => note.noteId === selectedNoteId));
    } else {
      renderSelectedNote(null);
    }
  } catch (err) {
    list.innerHTML = `<p class="error">Could not load notes: ${escapeHtml(err.message)}</p>`;
  }
}

function renderNoteTitles() {
  const list = document.getElementById("list");
  if (!list) return;

  list.innerHTML = notesCache.map(note => {
    const isActive = note.noteId === selectedNoteId ? "active" : "";
    const noteId = inlineJsString(note.noteId);
    const noteIdAttribute = escapeHtml(note.noteId);
    const title = escapeHtml(note.title || "Untitled note");
    const previewText = plainTextFromHtml(note.content || "").split("\n").map(line => line.trim()).find(Boolean);
    const preview = escapeHtml(previewText || "No content yet");

    return `
      <div class="note-swipe-row ${isActive}" data-note-id="${noteIdAttribute}">
        <div class="note-swipe-actions" aria-label="Note actions">
          <button class="note-swipe-action edit" type="button" onclick="editNote('${noteId}')">Edit</button>
          <button class="note-swipe-action delete" type="button" onclick="deleteNote('${noteId}')">Delete</button>
        </div>
        <button class="note-title-item ${isActive}" type="button" onclick="selectNote('${noteId}')">
          <strong>${title}</strong>
          <span>${preview}</span>
        </button>
      </div>
    `;
  }).join("");

  bindMobileSwipeActions();
}

function selectNote(noteId) {
  closeSwipeActions();
  selectedNoteId = noteId;
  editorMode = "view";
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
    editorMode = "new";
    if (heading) heading.textContent = "Create Note";
    if (titleInput) titleInput.value = "";
    if (contentInput) contentInput.innerHTML = "";
    setEditorFieldsVisible(true);
    renderEditorActions("new");
    updateSavedSnapshot();
    setSaveStatus("Start typing");
    if (preview) {
      preview.className = "selected-note-preview empty-state hidden-preview";
      preview.textContent = "";
    }
    return;
  }

  if (editorMode === "edit") {
    if (heading) heading.textContent = "Edit Note";
    if (titleInput) titleInput.value = note.title || "";
    if (contentInput) contentInput.innerHTML = contentForEditor(note.content || "");
    setEditorFieldsVisible(true);
    renderEditorActions("edit");
    updateSavedSnapshot();
    setSaveStatus("Saved just now");
    if (preview) {
      preview.className = "selected-note-preview hidden-preview";
      preview.textContent = "";
    }
    return;
  }

  editorMode = "view";
  if (heading) heading.textContent = "Selected Note";
  setEditorFieldsVisible(false);
  renderEditorActions("view", note.noteId);
  updateSavedSnapshot({ title: note.title || "", content: note.content || "" });
  setSaveStatus("Saved just now");

  if (preview) {
    preview.className = "selected-note-preview selected-note-view";
    preview.innerHTML = `
      <h3>${escapeHtml(note.title || "Untitled note")}</h3>
      <div class="note-body-formatted">${formatNoteContent(note.content || "")}</div>
    `;
  }
}

function setEditorFieldsVisible(isVisible) {
  const titleInput = document.getElementById("title");
  const contentInput = document.getElementById("content");
  const toolbar = document.getElementById("formatToolbar");

  [titleInput, contentInput].forEach(field => {
    if (!field) return;
    field.classList.toggle("hidden-preview", !isVisible);
  });

  if (titleInput) titleInput.disabled = !isVisible;
  if (contentInput) {
    contentInput.setAttribute("contenteditable", String(isVisible));
    contentInput.setAttribute("aria-disabled", String(!isVisible));
  }

  if (toolbar) toolbar.classList.toggle("hidden-preview", !isVisible);
}

function renderEditorActions(mode, noteId = selectedNoteId) {
  const actions = document.querySelector(".editor-actions");
  if (!actions) return;

  if (mode === "view" && noteId) {
    const safeNoteId = inlineJsString(noteId);
    actions.innerHTML = `
      <button class="ghost" type="button" onclick="editNote('${safeNoteId}')">Edit</button>
      <button class="ghost danger-btn" type="button" onclick="deleteNote('${safeNoteId}')">Delete</button>
    `;
    return;
  }

  actions.innerHTML = `
    <button class="ghost" type="button" onclick="startNewNote()">Clear</button>
    <span id="saveStatus" class="save-status">Saved just now</span>
  `;
}

function startNewNote() {
  closeSwipeActions();
  clearAutosaveTimer();
  selectedNoteId = null;
  editorMode = "new";
  renderNoteTitles();
  renderSelectedNote(null);
  setTimeout(() => document.getElementById("title")?.focus(), 100);
}

async function saveCurrentNote(options = {}) {
  clearAutosaveTimer();
  if (selectedNoteId) {
    await updateNote(selectedNoteId, options);
  } else {
    await createNote(options);
  }
}

function formatNoteContent(content) {
  return looksLikeHtml(content) ? sanitizeRichContent(content) : renderMarkdownContent(content);
}

async function createNote({ silent = false } = {}) {
  const draft = getEditorDraft();
  const title = deriveNoteTitle(draft);
  const content = draft.content;

  if (!hasDraftContent(draft)) {
    setSaveStatus("Nothing to save");
    if (!silent) {
      alert("Add a title or note content first.");
    }
    return;
  }

  if (!getAuthToken()) {
    if (!silent) alert("Please sign in first.");
    return;
  }

  try {
    setSaveStatus("Saving...");
    const createdNote = await apiFetch("/notes", {
      method: "POST",
      body: JSON.stringify({ title, content })
    });

    selectedNoteId = createdNote?.noteId || selectedNoteId;
    editorMode = selectedNoteId ? "edit" : "new";
    upsertCachedNote({
      ...(createdNote || {}),
      noteId: selectedNoteId,
      title,
      content
    });
    renderNoteTitles();
    updateSavedSnapshot({ title, content });
    setSaveStatus("Saved just now");
  } catch (err) {
    setSaveStatus("Could not save");
    if (!silent) alert(`Could not create note: ${err.message}`);
  }
}

async function updateNote(id, { silent = false } = {}) {
  const draft = getEditorDraft();
  const title = deriveNoteTitle(draft);
  const content = draft.content;

  if (!hasDraftContent(draft)) {
    setSaveStatus("Nothing to save");
    if (!silent) {
      alert("Add a title or note content first.");
    }
    return;
  }

  if (!getAuthToken()) {
    if (!silent) alert("Please sign in first.");
    return;
  }

  try {
    setSaveStatus("Saving...");
    await apiFetch(`/notes/${id}`, {
      method: "PUT",
      body: JSON.stringify({ title, content })
    });

    selectedNoteId = id;
    editorMode = "edit";
    upsertCachedNote({ noteId: id, title, content });
    renderNoteTitles();
    updateSavedSnapshot({ title, content });
    setSaveStatus("Saved just now");
  } catch (err) {
    setSaveStatus("Could not save");
    if (!silent) alert(`Could not update note: ${err.message}`);
  }
}

function getEditorDraft() {
  return {
    title: valueFrom("title"),
    content: getEditorContent()
  };
}

function hasDraftContent(draft = getEditorDraft()) {
  return Boolean(draft.title.trim() || plainTextFromHtml(draft.content).trim());
}

function deriveNoteTitle(draft = getEditorDraft()) {
  if (draft.title.trim()) return draft.title.trim();

  const firstContentLine = draft.content
    ? plainTextFromHtml(draft.content)
    .split("\n")
    .map(line => line.trim())
    .find(Boolean)
    : "";

  if (!firstContentLine) return "Untitled note";

  return firstContentLine
    .replace(/^#{1,6}\s+/, "")
    .replace(/^[-*]\s+\[[ xX]\]\s+/, "")
    .replace(/^[-*]\s+/, "")
    .replace(/[*_`~>#]/g, "")
    .slice(0, 70)
    .trim() || "Untitled note";
}

function getEditorContent() {
  const contentInput = document.getElementById("content");
  if (!contentInput) return "";
  return sanitizeRichContent(contentInput.innerHTML);
}

function contentForEditor(content) {
  if (!content.trim()) return "";
  return looksLikeHtml(content) ? sanitizeRichContent(content) : renderMarkdownContent(content);
}

function looksLikeHtml(content) {
  return /<\/?[a-z][\s\S]*>/i.test(content || "");
}

function plainTextFromHtml(content) {
  const temp = document.createElement("div");
  const html = looksLikeHtml(content) ? sanitizeRichContent(content) : renderMarkdownContent(content || "");
  temp.innerHTML = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(div|p|li|h[1-6])>/gi, "$&\n");
  return temp.textContent || "";
}

function sanitizeRichContent(content) {
  const template = document.createElement("template");
  template.innerHTML = content || "";

  const allowedTags = new Set(["B", "BR", "DIV", "EM", "H2", "H3", "H4", "I", "LI", "P", "SPAN", "STRONG", "U", "UL"]);
  const allowedClasses = new Set(["checklist-editor-line", "checklist-render", "checkmark-box"]);

  const sanitizeNode = node => {
    if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.textContent || "");

    if (node.nodeType !== Node.ELEMENT_NODE) return document.createTextNode("");

    const tagName = node.tagName.toUpperCase();
    const replacementTag = allowedTags.has(tagName) ? tagName.toLowerCase() : "span";
    const cleanNode = document.createElement(replacementTag);

    const classNames = Array.from(node.classList || []).filter(className => allowedClasses.has(className));
    if (classNames.length) cleanNode.className = classNames.join(" ");

    Array.from(node.childNodes).forEach(child => {
      cleanNode.appendChild(sanitizeNode(child));
    });

    return cleanNode;
  };

  const cleanContainer = document.createElement("div");
  Array.from(template.content.childNodes).forEach(node => {
    cleanContainer.appendChild(sanitizeNode(node));
  });

  let sanitized = cleanContainer.innerHTML
    .replace(/<div><br><\/div>/g, "")
    .replace(/<p><br><\/p>/g, "")
    .replace(/^<br\s*\/?>$/i, "")
    .trim();

  if (plainTextOnly(sanitized).trim()) return sanitized;
  return "";
}

function plainTextOnly(content) {
  const temp = document.createElement("div");
  temp.innerHTML = content || "";
  return temp.textContent || "";
}

function updateSavedSnapshot(snapshot = getEditorDraft()) {
  lastSavedSnapshot = {
    title: snapshot.title || "",
    content: snapshot.content || ""
  };
}

function hasUnsavedChanges() {
  const draft = getEditorDraft();
  return draft.title !== lastSavedSnapshot.title || draft.content !== lastSavedSnapshot.content;
}

function clearAutosaveTimer() {
  if (autosaveTimerId) {
    clearTimeout(autosaveTimerId);
    autosaveTimerId = null;
  }
}

function setSaveStatus(message) {
  const status = document.getElementById("saveStatus");
  if (!status) return;

  status.textContent = message;
  status.dataset.state = message.toLowerCase().includes("could not") ? "error" : "";

  if (saveStatusResetTimerId) {
    clearTimeout(saveStatusResetTimerId);
    saveStatusResetTimerId = null;
  }

  if (message === "Saved just now") {
    saveStatusResetTimerId = setTimeout(() => {
      const currentStatus = document.getElementById("saveStatus");
      if (currentStatus?.textContent === "Saved just now") currentStatus.textContent = "Saved";
    }, 4000);
  }
}

function scheduleAutosave() {
  if (editorMode === "view") return;
  clearAutosaveTimer();

  if (!hasUnsavedChanges()) {
    setSaveStatus(hasDraftContent() ? "Saved" : "Start typing");
    return;
  }

  if (!hasDraftContent()) {
    setSaveStatus("Start typing");
    return;
  }

  setSaveStatus("Unsaved changes");
  autosaveTimerId = setTimeout(() => {
    saveCurrentNote({ silent: true });
  }, AUTOSAVE_DELAY_MS);
}

function upsertCachedNote(note) {
  if (!note?.noteId) return;

  const existingIndex = notesCache.findIndex(item => item.noteId === note.noteId);
  const nextNote = {
    ...(existingIndex >= 0 ? notesCache[existingIndex] : {}),
    ...note
  };

  if (existingIndex >= 0) {
    notesCache[existingIndex] = nextNote;
  } else {
    notesCache = [nextNote, ...notesCache];
  }
}

function applyFormatting(type) {
  const contentInput = document.getElementById("content");
  if (!contentInput || contentInput.getAttribute("contenteditable") !== "true") return;

  contentInput.focus();
  restoreEditorSelection();
  document.execCommand("styleWithCSS", false, false);

  if (type === "bold") {
    document.execCommand("bold");
  } else if (type === "italic") {
    document.execCommand("italic");
  } else if (type === "underline") {
    document.execCommand("underline");
  } else if (type === "heading") {
    document.execCommand("formatBlock", false, "h2");
  } else if (type === "bullet") {
    document.execCommand("insertUnorderedList");
  } else if (type === "checklist") {
    document.execCommand("insertHTML", false, '<div class="checklist-editor-line"><span class="checkmark-box">☐</span> Checklist item</div>');
  }

  saveEditorSelection();
  contentInput.dispatchEvent(new Event("input", { bubbles: true }));
}

function renderMarkdownContent(content) {
  if (!content.trim()) return "<p>No content yet.</p>";

  const lines = escapeHtml(content).split("\n");
  const html = [];
  let listType = null;

  const closeList = () => {
    if (!listType) return;
    html.push("</ul>");
    listType = null;
  };

  lines.forEach(line => {
    const trimmed = line.trim();

    if (!trimmed) {
      closeList();
      return;
    }

    const checklistMatch = trimmed.match(/^[-*]\s+\[([ xX])\]\s+(.*)$/);
    if (checklistMatch) {
      if (listType !== "checklist") {
        closeList();
        html.push('<ul class="checklist-render">');
        listType = "checklist";
      }
      const checked = checklistMatch[1].toLowerCase() === "x" ? " checked" : "";
      html.push(`<li><input type="checkbox" disabled${checked}> <span>${formatInlineMarkdown(checklistMatch[2])}</span></li>`);
      return;
    }

    const bulletMatch = trimmed.match(/^[-*]\s+(.*)$/);
    if (bulletMatch) {
      if (listType !== "ul") {
        closeList();
        html.push("<ul>");
        listType = "ul";
      }
      html.push(`<li>${formatInlineMarkdown(bulletMatch[1])}</li>`);
      return;
    }

    closeList();

    const headingMatch = trimmed.match(/^(#{1,3})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length + 1;
      html.push(`<h${level}>${formatInlineMarkdown(headingMatch[2])}</h${level}>`);
      return;
    }

    html.push(`<p>${formatInlineMarkdown(trimmed)}</p>`);
  });

  closeList();
  return html.join("");
}

function formatInlineMarkdown(value) {
  return value
    .replace(/&lt;u&gt;(.+?)&lt;\/u&gt;/g, "<u>$1</u>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/_(.+?)_/g, "<em>$1</em>");
}

function bindEditorEnhancements() {
  document.getElementById("title")?.addEventListener("input", scheduleAutosave);

  const editor = document.getElementById("content");
  if (editor) {
    editor.addEventListener("input", () => {
      saveEditorSelection();
      scheduleAutosave();
    });
    ["keyup", "mouseup", "focus"].forEach(eventName => {
      editor.addEventListener(eventName, saveEditorSelection);
    });
  }

  document.getElementById("formatToolbar")?.addEventListener("mousedown", event => {
    event.preventDefault();
  });

  window.addEventListener("keydown", event => {
    if (!document.getElementById("notesWorkspace")?.classList.contains("visible")) return;

    const modifierPressed = event.metaKey || event.ctrlKey;
    if (!modifierPressed) return;

    const key = event.key.toLowerCase();
    if (key === "s") {
      event.preventDefault();
      saveCurrentNote({ silent: false });
    } else if (key === "n") {
      event.preventDefault();
      startNewNote();
    } else if (key === "b") {
      event.preventDefault();
      applyFormatting("bold");
    } else if (key === "i") {
      event.preventDefault();
      applyFormatting("italic");
    } else if (key === "u") {
      event.preventDefault();
      applyFormatting("underline");
    }
  });
}

function saveEditorSelection() {
  const editor = document.getElementById("content");
  const selection = window.getSelection();
  if (!editor || !selection || !selection.rangeCount) return;

  const range = selection.getRangeAt(0);
  if (!editor.contains(range.commonAncestorContainer)) return;

  editorSelectionRange = range.cloneRange();
}

function restoreEditorSelection() {
  const editor = document.getElementById("content");
  const selection = window.getSelection();
  if (!editor || !selection) return;

  selection.removeAllRanges();

  if (editorSelectionRange && editor.contains(editorSelectionRange.commonAncestorContainer)) {
    selection.addRange(editorSelectionRange);
    return;
  }

  const range = document.createRange();
  range.selectNodeContents(editor);
  range.collapse(false);
  selection.addRange(range);
}

function editNote(id) {
  closeSwipeActions();
  selectedNoteId = id;
  editorMode = "edit";
  const note = notesCache.find(item => item.noteId === id);
  if (!note) {
    startNewNote();
    return;
  }
  renderNoteTitles();
  renderSelectedNote(note);
}

async function deleteNote(id) {
  closeSwipeActions();
  const note = notesCache.find(item => item.noteId === id);
  const noteTitle = note?.title ? `"${note.title}"` : "this note";
  if (!confirm(`Delete ${noteTitle}? This cannot be undone.`)) return;

  try {
    await apiFetch(`/notes/${id}`, { method: "DELETE" });

    if (selectedNoteId === id) {
      selectedNoteId = null;
      editorMode = "new";
    }
    await loadNotes();
  } catch (err) {
    alert(`Could not delete note: ${err.message}`);
  }
}

function isSmallScreen() {
  return window.matchMedia("(max-width: 900px)").matches;
}

function closeSwipeActions(exceptRow = null) {
  document.querySelectorAll(".note-swipe-row.swipe-open").forEach(row => {
    if (row !== exceptRow) row.classList.remove("swipe-open");
  });
}

function bindMobileSwipeActions() {
  document.querySelectorAll(".note-swipe-row").forEach(row => {
    let startX = 0;
    let startY = 0;
    let currentX = 0;
    let currentY = 0;

    const noteButton = row.querySelector(".note-title-item");
    if (noteButton) {
      noteButton.addEventListener("click", event => {
        if (!isSmallScreen() || !row.classList.contains("swipe-open")) return;
        event.preventDefault();
        event.stopPropagation();
        closeSwipeActions();
      }, true);
    }

    row.addEventListener("touchstart", event => {
      if (!isSmallScreen() || !event.touches.length) return;
      startX = event.touches[0].clientX;
      startY = event.touches[0].clientY;
      currentX = startX;
      currentY = startY;
    }, { passive: true });

    row.addEventListener("touchmove", event => {
      if (!isSmallScreen() || !event.touches.length) return;
      currentX = event.touches[0].clientX;
      currentY = event.touches[0].clientY;

      const deltaX = currentX - startX;
      const deltaY = currentY - startY;
      if (Math.abs(deltaX) > 16 && Math.abs(deltaX) > Math.abs(deltaY)) {
        event.preventDefault();
      }
    }, { passive: false });

    row.addEventListener("touchend", () => {
      if (!isSmallScreen()) return;

      const deltaX = currentX - startX;
      const deltaY = currentY - startY;
      if (Math.abs(deltaX) <= Math.abs(deltaY) || Math.abs(deltaX) < 44) return;

      if (deltaX < 0) {
        closeSwipeActions(row);
        row.classList.add("swipe-open");
      } else {
        row.classList.remove("swipe-open");
      }
    });
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"
  }[m]));
}

function inlineJsString(value) {
  return escapeHtml(String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\r/g, "\\r").replace(/\n/g, "\\n"));
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
window.applyFormatting = applyFormatting;

document.addEventListener("DOMContentLoaded", () => {
  bindAuthToggleButtons();
  bindSessionActivityTracking();
  bindEditorEnhancements();
  updateAppVisibility();

  if (getAuthToken()) {
    loadNotes();
  }
});
