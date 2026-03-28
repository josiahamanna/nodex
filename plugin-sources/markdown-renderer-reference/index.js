/**
 * Markdown Renderer - Frontend Logic
 *
 * This runs in a sandboxed iframe and handles:
 * - UI rendering
 * - User interaction
 * - State management (per-note)
 * - Communication with backend via Nodex API
 */

(function () {
  "use strict";

  // DOM elements
  const editor = document.getElementById("editor");
  const preview = document.getElementById("preview");
  const toolbar = document.getElementById("toolbar");
  const editMode = document.getElementById("edit-mode");
  const previewMode = document.getElementById("preview-mode");
  const wordCountEl = document.getElementById("word-count");
  const charCountEl = document.getElementById("char-count");
  const statusMessage = document.getElementById("status-message");
  const saveStatus = document.getElementById("save-status");

  // Plugin state (per-note)
  let state = {
    noteId: null,
    content: "",
    cursorPosition: 0,
    scrollPosition: 0,
    isPreviewMode: false,
    isDirty: false,
  };

  // Debounce timers
  let saveTimer = null;
  let statsTimer = null;

  /**
   * Initialize plugin
   */
  function init() {
    setupEventListeners();
    updateStats();

    // Notify parent that plugin is ready
    Nodex.postMessage({ type: "ready" });
    setStatus("Plugin loaded");
  }

  /**
   * Setup event listeners
   */
  function setupEventListeners() {
    // Editor events
    editor.addEventListener("input", handleInput);
    editor.addEventListener("scroll", handleScroll);
    editor.addEventListener("keydown", handleKeyDown);

    // Toolbar events
    toolbar.addEventListener("click", handleToolbarClick);

    // Listen for messages from parent
    Nodex.onMessage = handleMessage;

    // Auto-save on blur
    editor.addEventListener("blur", () => {
      if (state.isDirty) {
        saveContent();
      }
    });
  }

  /**
   * Handle editor input
   */
  function handleInput() {
    state.content = editor.value;
    state.cursorPosition = editor.selectionStart;
    state.isDirty = true;

    // Update stats (debounced)
    clearTimeout(statsTimer);
    statsTimer = setTimeout(updateStats, 300);

    // Auto-save (debounced)
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveContent();
    }, 2000);

    setSaveStatus("Unsaved");
  }

  /**
   * Handle scroll
   */
  function handleScroll() {
    state.scrollPosition = editor.scrollTop;
  }

  /**
   * Handle keyboard shortcuts
   */
  function handleKeyDown(e) {
    // Ctrl/Cmd + B = Bold
    if ((e.ctrlKey || e.metaKey) && e.key === "b") {
      e.preventDefault();
      insertMarkdown("**", "**");
    }

    // Ctrl/Cmd + I = Italic
    if ((e.ctrlKey || e.metaKey) && e.key === "i") {
      e.preventDefault();
      insertMarkdown("*", "*");
    }

    // Ctrl/Cmd + ` = Code
    if ((e.ctrlKey || e.metaKey) && e.key === "`") {
      e.preventDefault();
      insertMarkdown("`", "`");
    }

    // Ctrl/Cmd + K = Link
    if ((e.ctrlKey || e.metaKey) && e.key === "k") {
      e.preventDefault();
      insertLink();
    }

    // Ctrl/Cmd + P = Preview
    if ((e.ctrlKey || e.metaKey) && e.key === "p") {
      e.preventDefault();
      togglePreview();
    }

    // Tab = Insert 2 spaces
    if (e.key === "Tab") {
      e.preventDefault();
      insertText("  ");
    }
  }

  /**
   * Handle toolbar clicks
   */
  function handleToolbarClick(e) {
    const button = e.target.closest("button");
    if (!button) return;

    const action = button.dataset.action;

    switch (action) {
      case "bold":
        insertMarkdown("**", "**");
        break;
      case "italic":
        insertMarkdown("*", "*");
        break;
      case "code":
        insertMarkdown("`", "`");
        break;
      case "h1":
        insertHeading(1);
        break;
      case "h2":
        insertHeading(2);
        break;
      case "h3":
        insertHeading(3);
        break;
      case "link":
        insertLink();
        break;
      case "list":
        insertList();
        break;
      case "preview":
        togglePreview();
        break;
    }
  }

  /**
   * Insert markdown syntax around selection
   */
  function insertMarkdown(before, after) {
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const text = editor.value;
    const selectedText = text.substring(start, end);

    const newText =
      text.substring(0, start) +
      before +
      selectedText +
      after +
      text.substring(end);

    editor.value = newText;
    editor.focus();

    // Set cursor position
    if (selectedText) {
      editor.setSelectionRange(start + before.length, end + before.length);
    } else {
      editor.setSelectionRange(start + before.length, start + before.length);
    }

    handleInput();
  }

  /**
   * Insert text at cursor
   */
  function insertText(text) {
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const currentText = editor.value;

    editor.value =
      currentText.substring(0, start) + text + currentText.substring(end);
    editor.focus();
    editor.setSelectionRange(start + text.length, start + text.length);

    handleInput();
  }

  /**
   * Insert heading
   */
  function insertHeading(level) {
    const start = editor.selectionStart;
    const text = editor.value;

    // Find start of line
    let lineStart = start;
    while (lineStart > 0 && text[lineStart - 1] !== "\n") {
      lineStart--;
    }

    // Check if line already has heading
    const lineEnd = text.indexOf("\n", start);
    const line = text.substring(
      lineStart,
      lineEnd === -1 ? text.length : lineEnd,
    );
    const headingMatch = line.match(/^(#+)\s/);

    if (headingMatch) {
      // Replace existing heading
      const newHeading = "#".repeat(level) + " ";
      const newText =
        text.substring(0, lineStart) +
        line.replace(/^#+\s/, newHeading) +
        text.substring(lineEnd === -1 ? text.length : lineEnd);
      editor.value = newText;
    } else {
      // Insert new heading
      const heading = "#".repeat(level) + " ";
      editor.value =
        text.substring(0, lineStart) + heading + text.substring(lineStart);
      editor.setSelectionRange(
        lineStart + heading.length,
        lineStart + heading.length,
      );
    }

    editor.focus();
    handleInput();
  }

  /**
   * Insert link
   */
  function insertLink() {
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const text = editor.value;
    const selectedText = text.substring(start, end);

    const linkText = selectedText || "link text";
    const link = `[${linkText}](url)`;

    const newText = text.substring(0, start) + link + text.substring(end);
    editor.value = newText;
    editor.focus();

    // Select 'url' part
    const urlStart = start + linkText.length + 3;
    editor.setSelectionRange(urlStart, urlStart + 3);

    handleInput();
  }

  /**
   * Insert list
   */
  function insertList() {
    const start = editor.selectionStart;
    const text = editor.value;

    // Find start of line
    let lineStart = start;
    while (lineStart > 0 && text[lineStart - 1] !== "\n") {
      lineStart--;
    }

    const listItem = "- ";
    editor.value =
      text.substring(0, lineStart) + listItem + text.substring(lineStart);
    editor.focus();
    editor.setSelectionRange(
      lineStart + listItem.length,
      lineStart + listItem.length,
    );

    handleInput();
  }

  /**
   * Toggle preview mode
   */
  function togglePreview() {
    state.isPreviewMode = !state.isPreviewMode;

    if (state.isPreviewMode) {
      editMode.style.display = "none";
      previewMode.style.display = "block";
      updatePreview();
      setStatus("Preview mode");
    } else {
      editMode.style.display = "block";
      previewMode.style.display = "none";
      editor.focus();
      setStatus("Edit mode");
    }
  }

  /**
   * Update preview
   */
  function updatePreview() {
    setStatus("Rendering preview...");

    // Request backend to render markdown
    Nodex.postMessage({
      type: "requestBackend",
      action: "renderMarkdown",
      payload: { content: state.content },
    });
  }

  /**
   * Update statistics
   */
  function updateStats() {
    const content = editor.value;
    const words = content.split(/\s+/).filter((w) => w.length > 0).length;
    const chars = content.length;

    wordCountEl.textContent = `${words} word${words !== 1 ? "s" : ""}`;
    charCountEl.textContent = `${chars} char${chars !== 1 ? "s" : ""}`;
  }

  /**
   * Save content
   */
  function saveContent() {
    if (!state.isDirty) return;

    setSaveStatus("Saving...");

    Nodex.postMessage({
      type: "contentChanged",
      content: state.content,
    });

    // Also request backend to save
    Nodex.postMessage({
      type: "requestBackend",
      action: "saveContent",
      payload: { content: state.content },
    });

    state.isDirty = false;
  }

  /**
   * Handle messages from parent
   */
  function handleMessage(message) {
    switch (message.type) {
      case "render":
        renderNote(message.payload);
        break;

      case "restoreState":
        restoreState(message.payload);
        break;

      case "saveState":
        saveState();
        break;

      case "update":
        updateNote(message.payload);
        break;

      case "backendResponse":
        handleBackendResponse(message.payload);
        break;
    }
  }

  /**
   * Render note
   */
  function renderNote(note) {
    state.noteId = note.id;
    state.content = note.content;
    state.isDirty = false;

    editor.value = note.content;

    // Reset UI state
    state.cursorPosition = 0;
    state.scrollPosition = 0;
    state.isPreviewMode = false;
    editMode.style.display = "block";
    previewMode.style.display = "none";

    updateStats();
    setSaveStatus("Saved");
    setStatus(`Loaded note: ${note.id}`);
  }

  /**
   * Update note content
   */
  function updateNote(note) {
    if (note.id === state.noteId && !state.isDirty) {
      state.content = note.content;
      editor.value = note.content;
      updateStats();
    }
  }

  /**
   * Restore state
   */
  function restoreState(savedState) {
    if (!savedState) return;

    state = { ...state, ...savedState };
    editor.value = state.content;
    editor.scrollTop = state.scrollPosition;

    // Restore cursor position
    editor.focus();
    editor.setSelectionRange(state.cursorPosition, state.cursorPosition);

    // Restore preview mode
    if (state.isPreviewMode) {
      editMode.style.display = "none";
      previewMode.style.display = "block";
      updatePreview();
    }

    updateStats();
    setStatus("State restored");
  }

  /**
   * Save state
   */
  function saveState() {
    Nodex.postMessage({
      type: "stateSnapshot",
      state: {
        noteId: state.noteId,
        content: state.content,
        cursorPosition: editor.selectionStart,
        scrollPosition: editor.scrollTop,
        isPreviewMode: state.isPreviewMode,
        isDirty: state.isDirty,
      },
    });
  }

  /**
   * Handle backend response
   */
  function handleBackendResponse(response) {
    if (response.action === "renderMarkdown") {
      if (response.result && response.result.html) {
        preview.innerHTML = response.result.html;
        setStatus("Preview rendered");
      }
    } else if (response.action === "saveContent") {
      if (response.result && response.result.success) {
        setSaveStatus("Saved");
        setStatus("Content saved");
      } else {
        setSaveStatus("Save failed");
        setStatus("Failed to save content");
      }
    }
  }

  /**
   * Set status message
   */
  function setStatus(message) {
    statusMessage.textContent = message;
  }

  /**
   * Set save status
   */
  function setSaveStatus(status) {
    saveStatus.textContent = status;
  }

  // Initialize when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
