(() => {
  const socket = io();
  const $ = id => document.getElementById(id);
  const landingView = $("landingView");
  const chatView = $("chatView");
  const homeError = $("homeError");
  const messagesEl = $("messages");
  const messageInput = $("messageInput");
  const imageInput = $("imageInput");
  const imagePreview = $("imagePreview");
  const emojiPicker = $("emojiPicker");

  let activeCode = null;
  let myName = null;
  let pendingImage = null;
  let endingFromServer = false;
  let toastTimer = null;

  const emojis = ["😀","😁","😂","🤣","😊","😍","🥳","😎","🤔","🙌","👏","👍","👎","❤️","🔥","🎉","🙏","✨","💯","🚀","☕","✅","👀","💡","😅","😭","🤝","💪","🎯","🌟"];
  emojis.forEach(emoji => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = emoji;
    button.addEventListener("click", () => {
      insertAtCursor(messageInput, emoji);
      emojiPicker.classList.add("hidden");
      messageInput.focus();
    });
    emojiPicker.appendChild(button);
  });

  function showToast(message) {
    const toast = $("toast");
    toast.textContent = message;
    toast.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.add("hidden"), 3200);
  }

  function showHomeError(message) {
    homeError.textContent = message;
    homeError.classList.remove("hidden");
  }

  function currentName() {
    return $("displayName").value.trim();
  }

  function enterRoom(result) {
    activeCode = result.code;
    myName = result.name;
    endingFromServer = false;
    $("activeRoomCode").textContent = activeCode;
    $("participantCount").textContent = "1";
    $("messageCount").textContent = "0 messages";
    messagesEl.replaceChildren();
    const empty = document.createElement("div");
    empty.id = "emptyState";
    empty.className = "empty-state";
    empty.innerHTML = '<div class="empty-icon">✳</div><strong>Your room is ready.</strong><p>Share the code and say hello to your team.</p>';
    messagesEl.appendChild(empty);
    landingView.classList.add("hidden");
    chatView.classList.remove("hidden");
    messageInput.focus();
  }

  function returnHome(message) {
    activeCode = null;
    pendingImage = null;
    imagePreview.classList.add("hidden");
    imageInput.value = "";
    messageInput.value = "";
    chatView.classList.add("hidden");
    landingView.classList.remove("hidden");
    $("joinPanel").classList.add("hidden");
    $("roomCodeInput").value = "";
    if (message) showToast(message);
  }

  $("createBtn").addEventListener("click", () => {
    homeError.classList.add("hidden");
    socket.emit("room:create", { name: currentName() }, result => {
      if (!result?.ok) return showHomeError(result?.error || "Could not create a room. Try again.");
      enterRoom(result);
    });
  });

  $("showJoinBtn").addEventListener("click", () => {
    homeError.classList.add("hidden");
    $("joinPanel").classList.toggle("hidden");
    if (!$("joinPanel").classList.contains("hidden")) $("roomCodeInput").focus();
  });

  function joinRoom() {
    homeError.classList.add("hidden");
    const code = $("roomCodeInput").value.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(code)) return showHomeError("Enter a valid 6-character room code.");
    socket.emit("room:join", { code, name: currentName() }, result => {
      if (!result?.ok) return showHomeError(result?.error || "Room not found or has ended.");
      enterRoom(result);
    });
  }
  $("joinBtn").addEventListener("click", joinRoom);
  $("roomCodeInput").addEventListener("input", e => e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6));
  $("roomCodeInput").addEventListener("keydown", e => { if (e.key === "Enter") joinRoom(); });

  $("copyBtn").addEventListener("click", async () => {
    if (!activeCode) return;
    const link = `${location.origin}/?room=${activeCode}`;
    const value = `${activeCode}\n${link}`;
    try {
      await navigator.clipboard.writeText(value);
      showToast("Room code and link copied");
    } catch {
      try {
        const field = document.createElement("textarea");
        field.value = value;
        document.body.appendChild(field);
        field.select();
        document.execCommand("copy");
        field.remove();
        showToast("Room code and link copied");
      } catch { showToast(`Room code: ${activeCode}`); }
    }
  });

  $("leaveBtn").addEventListener("click", () => {
    if (!activeCode) return;
    socket.emit("room:leave");
    returnHome("You ended the room. All session content was destroyed.");
  });

  $("emojiBtn").addEventListener("click", () => emojiPicker.classList.toggle("hidden"));
  document.addEventListener("click", event => {
    if (!event.target.closest(".emoji-wrap")) emojiPicker.classList.add("hidden");
  });

  function insertAtCursor(field, text) {
    const start = field.selectionStart ?? field.value.length;
    const end = field.selectionEnd ?? field.value.length;
    field.value = field.value.slice(0, start) + text + field.value.slice(end);
    field.selectionStart = field.selectionEnd = start + text.length;
    updateComposer();
  }

  function setImage(file) {
    if (!file || !file.type.startsWith("image/")) return showToast("Choose a valid image file.");
    if (file.size > 5 * 1024 * 1024) return showToast("Images must be 5 MB or smaller.");
    const reader = new FileReader();
    reader.onload = () => {
      pendingImage = { data: reader.result, name: file.name || "Pasted screenshot" };
      $("previewImage").src = reader.result;
      $("previewName").textContent = pendingImage.name;
      imagePreview.classList.remove("hidden");
    };
    reader.onerror = () => showToast("Could not read this image.");
    reader.readAsDataURL(file);
  }

  imageInput.addEventListener("change", event => {
    setImage(event.target.files?.[0]);
    imageInput.value = "";
  });
  $("removeImageBtn").addEventListener("click", () => {
    pendingImage = null;
    imagePreview.classList.add("hidden");
    $("previewImage").removeAttribute("src");
  });

  document.addEventListener("paste", event => {
    if (!activeCode) return;
    const items = Array.from(event.clipboardData?.items || []);
    const imageItem = items.find(item => item.type.startsWith("image/"));
    if (imageItem) {
      event.preventDefault();
      setImage(imageItem.getAsFile());
    }
  });

  function updateComposer() {
    $("charCount").textContent = `${messageInput.value.length} / 2000`;
    messageInput.style.height = "auto";
    messageInput.style.height = `${Math.min(messageInput.scrollHeight, 110)}px`;
  }
  messageInput.addEventListener("input", updateComposer);
  messageInput.addEventListener("keydown", event => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  });
  $("sendBtn").addEventListener("click", sendMessage);

  function sendMessage() {
    if (!activeCode) return;
    const text = messageInput.value.trim();
    if (!text && !pendingImage) return;
    $("sendBtn").disabled = true;
    socket.emit("message:send", { text, image: pendingImage?.data || null }, result => {
      $("sendBtn").disabled = false;
      if (!result?.ok) return showToast(result?.error || "Message could not be sent.");
      messageInput.value = "";
      pendingImage = null;
      imagePreview.classList.add("hidden");
      $("previewImage").removeAttribute("src");
      updateComposer();
      messageInput.focus();
    });
  }

  function appendMessage(message) {
    $("emptyState")?.remove();
    const wrap = document.createElement("div");
    wrap.className = `message${message.senderId === socket.id ? " mine" : ""}`;
    const meta = document.createElement("div");
    meta.className = "message-meta";
    const sender = document.createElement("strong");
    sender.textContent = message.senderId === socket.id ? "You" : message.sender;
    const time = document.createElement("span");
    time.textContent = new Date(message.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    meta.append(sender, time);
    const bubble = document.createElement("div");
    bubble.className = "bubble";
    if (message.text) {
      const text = document.createElement("div");
      text.textContent = message.text;
      bubble.appendChild(text);
    }
    if (message.image) {
      const img = document.createElement("img");
      img.src = message.image;
      img.alt = "Shared image";
      img.loading = "lazy";
      if (!message.text) img.className = "image-only";
      bubble.appendChild(img);
    }
    wrap.append(meta, bubble);
    messagesEl.appendChild(wrap);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    const count = messagesEl.querySelectorAll(".message").length;
    $("messageCount").textContent = `${count} message${count === 1 ? "" : "s"}`;
  }

  socket.on("room:state", state => {
    if (!activeCode || state.code !== activeCode) return;
    $("participantCount").textContent = state.participants;
    // Initial history is empty for new rooms; avoid duplicating live messages.
  });

  socket.on("message:new", message => {
    if (activeCode) appendMessage(message);
  });

  socket.on("system:notice", notice => {
    if (!activeCode) return;
    const node = document.createElement("div");
    node.className = "system-notice";
    node.textContent = notice.text;
    messagesEl.appendChild(node);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  });

  socket.on("room:ended", () => {
    if (endingFromServer) return;
    endingFromServer = true;
    returnHome("The chat session has ended because a participant left.");
  });

  socket.on("connect_error", () => {
    if (!activeCode) showHomeError("Could not connect to the chat server. Refresh and try again.");
  });

  const queryCode = new URLSearchParams(location.search).get("room");
  if (queryCode) {
    $("joinPanel").classList.remove("hidden");
    $("roomCodeInput").value = queryCode.toUpperCase().slice(0, 6);
    history.replaceState({}, "", "/");
    setTimeout(joinRoom, 250);
  }
})();
