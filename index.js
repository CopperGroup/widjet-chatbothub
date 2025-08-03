(async function () {
  let config = null; // Configuration object, starts null
  let t; // Alias for translated phrases

  // --- Step 1: Handle Configuration Loading ---
  // This promise will resolve when the config is received from the parent
  const configLoadedPromise = new Promise((resolve) => {
    window.addEventListener("message", function handler(event) {
      // In a production environment, validate event.origin for security!
      // For example: if (event.origin !== 'https://your-parent-domain.com') return;

      if (event.data.type === "chatbotConfig") {
        config = event.data.config;
        t = config.translatedPhrases; // Set translated phrases alias

        if (config.theme === "dark") {
          document.body.setAttribute("data-theme", "dark");
          console.log("Dark theme applied.");
        }

        console.log(config.gradient1);
        // window.removeEventListener('message', handler); // Clean up listener
        resolve(); // Signal that config is loaded
      }
    });
  });

  // Request the configuration immediately.
  // We don't await this postMessage directly, but await the promise that listens for its response.
  window.parent.postMessage({ type: "requestChatbotConfig" }, "*");
  console.log("Requested chatbot config.");

  // --- State Management ---
  const state = {
    userEmail: localStorage.getItem("chatbotEmail"),
    currentChatId: localStorage.getItem("currentChatId"),
    isExpanded: false,
    isTyping: false,
    currentView: "email", // 'email', 'conversations', 'chat', 'articles', 'articleContent'
    isInputVisible: true,
  };

  // --- DOM Elements (declare, but don't populate until initializeChatbot) ---
  const elements = {}; // Object to hold references to DOM elements

  // --- Utility Functions ---
  /**
   * Sets CSS custom properties based on configuration.
   */
  function setCssCustomProperties() {
    if (config) {
      document.documentElement.style.setProperty(
        "--gradient-color-1",
        config.gradient1
      );
      document.documentElement.style.setProperty(
        "--gradient-color-2",
        config.gradient2
      );
    }
  }

  /**
   * Updates initial header and input area texts based on translations.
   */
  function updateInitialTexts() {
    if (t && config && elements.headerTitle) {
      // Ensure elements are also available
      elements.headerTitle.textContent = config.headerText;
      elements.headerSubtitle.textContent = t["We're here to help!"];
      elements.emailInputArea.querySelector("h3").textContent = t["Welcome!"];
      elements.emailInputArea.querySelector("p").textContent =
        t[
          "Please enter your email address to start a conversation with our support team."
        ];
      elements.emailInput.placeholder = t["Enter your email address"];
      elements.emailSubmitBtn.textContent = t["Start Conversation"];
      elements.typingIndicatorBubble.querySelector(
        ".typing-label"
      ).textContent = t["Support Team"];
      elements.msgInput.placeholder = t["Type your message..."];
      elements.inputStatusMessage.textContent =
        t["Please choose an option to continue."];
      elements.newChatBtn.textContent = t["✨ Start New Conversation"];
    }
  }

  function deepLink(tab, view, elementId) {
    // Ensure the widget is opened first
    if (!state.isExpanded) {
      handleToggleWidget(); // This will open the widget and set initial view based on userEmail
    }

    // Give a small delay to allow the widget to open if it wasn't already
    setTimeout(() => {
      // Switch to the specified tab
      switchTab(tab);

      // After switching tab, handle the view and element ID
      setTimeout(async () => {
        if (tab === "help" && view === "articleContent" && elementId) {
          const articleToDisplay = articles.find(
            (article) => article._id === elementId
          );
          if (articleToDisplay) {
            showView("articleContent", "right", {
              title: articleToDisplay.title,
              description: articleToDisplay.description,
            });
            // Assuming 'marked' is globally available, if not, load it or use a simpler parser
            const response = await fetch(
              `${config.backendUrl}/api/websites/faqs/${config.chatbotCode}/${articleToDisplay._id}`
            );

            const data = await response.json();

            const answer = data.answer;

            const markdownToHtml =
              typeof marked !== "undefined" ? marked.parse(answer) : answer;

            elements.articleContentContainer.innerHTML = markdownToHtml;
          } else {
            console.warn(`Article with title "${elementId}" not found.`);
            // Optionally, revert to the articles list if the specific article isn't found
            showView("articles", "left");
          }
        } else if (tab === "messages" && view === "chat") {
          if (elementId === "null" || elementId === null) {
            // Check if elementId is explicitly null or the string 'null'
            handleNewChat(); // Call handleNewChat if view is 'chat' and elementId is null
          } else {
            handleShowChatMessages(elementId); // Otherwise, open the specific chat
          }
        } else {
          // If the combination is not explicitly handled, just show the tab's default view
          if (tab === "messages") {
            if (state.userEmail) {
              showView("conversations", "right");
            } else {
              showView("email", "left");
            }
          } else if (tab === "help") {
            showView("articles", "right");
          }
        }
      }, 500); // Small delay for tab switch animation to complete
    }, 0); // Delay for widget opening animation to complete
  }

  function initializeDeepLinkButtons() {
    const deepLinkButtons = document.querySelectorAll("#cbh-deep-link");
    const separator = "->*cbhdeeplink^&^cbhdeeplink*->";

    deepLinkButtons.forEach((button) => {
      const ariaLabel = button.getAttribute("aria-label");

      if (!ariaLabel) {
        console.warn(
          "Button with id 'cbh-deep-link' is missing an 'aria-label'. Skipping deep-link processing for this button.",
          button
        );
        return;
      }

      button.addEventListener("click", (event) => {
        event.preventDefault(); // Prevent default button behavior if it's inside a form or has other default actions

        if (ariaLabel.startsWith("http")) {
          const parts = ariaLabel.split(separator);
          if (parts.length < 2) {
            console.error(
              "Invalid aria-label format for URL deep link:",
              ariaLabel
            );
            return;
          }
          const url = parts[0];
          const target = parts[1]; // Expected to be 'new' or 'current'

          if (target === "new") {
            window.open(url, "_blank");
          } else if (target === "current") {
            window.location.href = url;
          } else {
            console.warn(
              "Unknown target specified in aria-label for URL deep link:",
              target
            );
            window.location.href = url; // Default to current tab if target is unknown
          }
        } else {
          // Assume it's for your deepLink function
          const parts = ariaLabel.split(separator);
          if (parts.length !== 3) {
            console.error(
              "Invalid aria-label format for deepLink function. Expected 'tab->*cbhdeeplink^&^cbhdeeplink*->view->*cbhdeeplink^&^cbhdeeplink*->elementId'",
              ariaLabel
            );
            return;
          }
          const tab = parts[0];
          const view = parts[1];
          const elementId = parts[2];

          if (typeof deepLink === "function") {
            deepLink(tab, view, elementId);
          } else {
            console.error(
              "The 'deepLink' function is not defined. Cannot perform internal deep link.",
              ariaLabel
            );
          }
        }
      });
    });
  }

  /**
   * Adds visual effects to input fields and buttons.
   */
  function addInputFocusEffects() {
    if (
      !config ||
      !elements.emailInput ||
      !elements.msgInput ||
      !elements.emailSubmitBtn
    )
      return;

    [elements.emailInput, elements.msgInput].forEach((input) => {
      input.addEventListener("focus", () => {
        input.style.borderColor = config.gradient1;
        input.style.boxShadow = `0 0 0 3px ${config.gradient1}20`;
        input.style.transform = "translateY(-1px)";
      });
      input.addEventListener("blur", () => {
        input.style.borderColor = "var(--border-color)";
        input.style.boxShadow = "none";
        input.style.transform = "translateY(0)";
      });
    });

    [elements.emailSubmitBtn].forEach((btn) => {
      btn.addEventListener("mouseenter", () => {
        btn.style.transform = "translateY(-2px)";
        btn.style.boxShadow = `0 8px 24px ${config.gradient1}40`;
      });
      btn.addEventListener("mouseleave", () => {
        btn.style.transform = "translateY(0)";
        btn.style.boxShadow = `0 4px 16px ${config.gradient1}30`;
      });
    });
  }

    /**
     * Creates a message bubble DOM element.
     * @param {string} sender - The sender of the message ('user', 'bot', 'ai', 'staff-*', 'owner').
     * @param {string} text - The message text.
     * @param {string} timestamp - ISO string of the message timestamp.
     * @param {Array<string>} options - Array of quick reply options.
     * @param {boolean} isReplySent - True if a reply has already been sent for this message's options.
     * @returns {HTMLElement} The message bubble element.
     */
    const createMessageBubble = (sender, text, timestamp, options = [], isReplySent = false, fileUrl) => {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message-bubble ${sender}`;

    const messageContent = document.createElement("div");
    messageContent.className = "message-content";

    let senderLabel = "";
    let borderRadius = "20px";
    let avatarHtml = "";

    // Determine sender label, border radius, and avatar HTML based on sender
    switch (true) {
      case sender === "user":
        senderLabel = t["You"];
        borderRadius = "20px 20px 6px 20px";
        break;
      case sender === "bot":
        senderLabel = t["Bot"];
        borderRadius = "20px 20px 20px 6px";
        avatarHtml = `<div class="avatar-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="4" r="1" fill="currentColor"/><rect x="11.5" y="5" width="1" height="1.5" fill="currentColor"/><path d="M12 6.5c-4.5 0-6 2-6 5.5v3c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2v-3c0-3.5-1.5-5.5-6-5.5z" fill="currentColor"/><circle cx="12" cy="12" r="4.5" fill="white"/><ellipse cx="10" cy="11.5" rx="1" ry="1.2" fill="currentColor"/><ellipse cx="14" cy="11.5" rx="1" ry="1.2" fill="currentColor"/></svg></div>`;
        break;
      case sender === "ai":
        senderLabel = t["AI Assistant"];
        borderRadius = "20px 20px 20px 6px";
        avatarHtml = `<div class="avatar-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="padding-left: 4px;"><path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" stroke="currentColor" stroke-width="1.5" fill="none"/></svg></div>`;
        break;
      case sender.startsWith("staff-"):
        senderLabel = sender.split("-")[1];
        borderRadius = "20px 20px 20px 6px";
        avatarHtml = `<div class="avatar-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 4 0 00-7 7h14a7 4 0 00-7-7z" fill="currentColor"/></svg></div>`;
        break;
      case sender === "owner":
        senderLabel = t["Owner"];
        borderRadius = "20px 20px 20px 6px";
        avatarHtml = `<div class="avatar-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" stroke="currentColor" stroke-width="1.5" fill="none"/></svg></div>`;
        break;
    }

    messageContent.style.borderRadius = borderRadius;
    if (sender !== "user") {
      messageContent.innerHTML += avatarHtml;
    }

    let markdownToHtml =
      typeof marked !== "undefined" ? marked.parse(text) : text;

    // Modify all <a> tags to include target="_blank"
    markdownToHtml = markdownToHtml.replace(
      /<a\s+(?!.*target=["']_blank["'])([^>]*?)>/gi,
      '<a $1 target="_blank">'
    );

    messageContent.innerHTML += `
            <div class="sender-label">${senderLabel}</div>
            ${fileUrl ? `<img src="${fileUrl}" style="max-width: 280px;"/>` : ""}
            <div class="message-text">${markdownToHtml}</div>
            <div class="timestamp">
                ${new Date(timestamp).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
            </div>
        `;
        
        messageDiv.appendChild(messageContent);

    // Add options as clickable buttons if they exist
    if (options && options.length > 0) {
      const optionsContainer = document.createElement("div");
      optionsContainer.className = "options-container";

      options.forEach((optionText) => {
        const optionButton = document.createElement("button");
        optionButton.className = "option-button";
        optionButton.textContent = optionText;

        if (isReplySent) {
          optionButton.disabled = true;
        } else {
          optionButton.addEventListener("click", () => {
            if (state.currentChatId) {
              // Disable all option buttons in this message bubble after one is clicked
              const allButtonsInThisBubble =
                optionsContainer.querySelectorAll(".option-button");
              allButtonsInThisBubble.forEach((btn) => {
                btn.disabled = true;
                btn.style.opacity = "0.6";
                btn.style.cursor = "default";
                btn.onmouseenter = null;
                btn.onmouseleave = null;
              });

              renderMessage("user", optionText, new Date().toISOString());
              if (socket) {
                // Ensure socket is defined
                socket.emit("message", {
                  chatbotCode: config.chatbotCode,
                  chatId: state.currentChatId,
                  email: state.userEmail,
                  message: optionText,
                  currentWebsiteURL: window.location.href,
                });
              }
              updateInputAreaVisibility(false); // Hide input after selecting an option
            }
          });
        }
        optionsContainer.appendChild(optionButton);
      });
      messageContent.appendChild(optionsContainer);
    }

    return messageDiv;
  };

    /**
     * Renders a message bubble and scrolls to the bottom of the messages container.
     * Manages input area visibility based on message options.
     * @param {string} sender - The sender of the message.
     * @param {string} text - The message text.
     * @param {string} timestamp - ISO string of the message timestamp.
     * @param {Array<string>} options - Array of quick reply options.
     * @param {boolean} isReplySent - True if a reply has already been sent for this message's options.
     */
    const renderMessage = (sender, text, timestamp, options = [], isReplySent = false, fileUrl) => {
        if (!elements.messagesContainer) return; // Defensive check
        const messageBubble = createMessageBubble(sender, text, timestamp, options, isReplySent, fileUrl);
        elements.messagesContainer.appendChild(messageBubble);
        setTimeout(() => {
            elements.messagesContainer.scrollTop = elements.messagesContainer.scrollHeight;
        }, 50);

    // Manage input area visibility based on bot messages with options
    if (sender !== "user") {
      if (options && options.length > 0 && !isReplySent) {
        updateInputAreaVisibility(false); // Hide input if bot provides options and no reply sent yet
      } else {
        updateInputAreaVisibility(true); // Show input otherwise
      }
    }
  };

  /**
   * Shows the typing indicator.
   */
  const showTypingIndicator = () => {
    if (
      state.isTyping ||
      !elements.typingIndicatorBubble ||
      !elements.messagesContainer
    )
      return;
    if (
      elements.messagesContainer.lastChild !== elements.typingIndicatorBubble
    ) {
      elements.messagesContainer.appendChild(elements.typingIndicatorBubble);
    }
    elements.typingIndicatorBubble.style.display = "flex";
    state.isTyping = true;
    setTimeout(() => {
      elements.messagesContainer.scrollTop =
        elements.messagesContainer.scrollHeight;
    }, 50);
  };

  /**
   * Hides the typing indicator.
   */
  const hideTypingIndicator = () => {
    if (!elements.typingIndicatorBubble) return;
    elements.typingIndicatorBubble.style.display = "none";
    state.isTyping = false;
  };

  const displayFooter = (display) => {
    if (config.tabsMode === false) {
      elements.footer.style.display = "none";
      return;
    } else {
      elements.footer.style.display = display;
    }
  };
  /**
   * Updates the header content based on the current view.
   * @param {string} view - The current view ('email', 'conversations', 'chat').
   */
  const updateHeaderForView = (view, title, description) => {
    if (
      !elements.headerTitle ||
      !elements.headerSubtitle ||
      !elements.backBtnArtilces ||
      !elements.backBtnChats ||
      !elements.footer
    )
      return;

    switch (view) {
      case "email":
        elements.headerTitle.textContent = config.headerText;
        elements.headerSubtitle.textContent = t["We're here to help!"];
        elements.backBtnArtilces.style.display = "none";
        elements.backBtnChats.style.display = "none";
        displayFooter("flex");
        break;
      case "conversations":
        elements.headerTitle.textContent = t["Your Conversations"];
        elements.headerSubtitle.textContent =
          t["Select a chat or start new one"];
        elements.backBtnArtilces.style.display = "none";
        elements.backBtnChats.style.display = "none";
        displayFooter("flex");
        elements.footer.classList.remove("hidden");
        break;
      case "chat":
        elements.headerTitle.textContent = t["Live Chat"];
        elements.headerSubtitle.textContent = t["Connected with support"];
        elements.backBtnArtilces.style.display = "none";
        elements.backBtnChats.style.display = "flex";
        displayFooter("none");
        elements.footer.classList.add("hidden");
        break;
      case "articles":
        elements.headerTitle.textContent = t["Help & Support"];
        elements.headerSubtitle.textContent =
          t[
            "Find answers to common questions and get help with using our platform."
          ];
        elements.backBtnArtilces.style.display = "none";
        elements.backBtnChats.style.display = "none";
        displayFooter("flex");
        elements.footer.classList.remove("hidden");
        break;
      case "articleContent":
        elements.headerTitle.textContent = title; // Article title
        elements.headerSubtitle.textContent = description; // Hide description
        elements.backBtnArtilces.style.display = "flex";
        elements.backBtnChats.style.display = "none";
        displayFooter("none");
        elements.footer.classList.add("hidden");
        break;
    }
  };

  /**
   * Shows a specific view with animation.
   * @param {string} viewName - The name of the view to show.
   * @param {string} direction - Animation direction ('right' or 'left').
   */
  const showView = (viewName, direction = "right", headerProps) => {
    const views = {
      email: elements.emailInputArea,
      conversations: elements.chatListDiv,
      chat: elements.messagesContainer,
      articles: elements.articlesContainer,
      articleContent: elements.articleContentContainer,
    };

    const footers = {
      conversations: elements.newChatBtnContainer,
      chat: elements.inputArea,
    };

    // Hide all current views and footers with animation
    Object.values(views).forEach((view) => {
      if (view && view.style.display !== "none") {
        view.style.opacity = "0";
        view.style.transform =
          direction === "right" ? "translateX(-20px)" : "translateX(20px)";
        setTimeout(() => {
          view.style.display = "none";
        }, 200);
      }
    });

    Object.values(footers).forEach((footer) => {
      if (footer && footer.style.opacity !== "0") {
        footer.style.opacity = "0";
        setTimeout(() => {
          footer.style.display = "none";
        }, 200);
      }
    });

    // Show the target view and footer with animation
    setTimeout(() => {
      const targetView = views[viewName];
      const targetFooter = footers[viewName];

      if (targetView) {
        targetView.style.display =
          viewName === "email" || viewName === "articles" ? "flex" : "block";
        targetView.style.transform =
          direction === "right" ? "translateX(20px)" : "translateX(-20px)";
        targetView.style.opacity = "0";

        setTimeout(() => {
          targetView.style.opacity = "1";
          targetView.style.transform = "translateX(0)";
        }, 50);
      }

      if (targetFooter) {
        targetFooter.style.display = "block";
        setTimeout(() => {
          targetFooter.style.opacity = "1";
          if (viewName === "chat") {
            updateInputAreaVisibility(state.isInputVisible); // Restore input visibility for chat view
          }
        }, 100);
      }

      const headerTitle = headerProps ? headerProps.title : "";
      const headerDescription = headerProps ? headerProps.description : "";
      updateHeaderForView(viewName, headerTitle, headerDescription);
      state.currentView = viewName;
    }, 200);
  };

  /**
   * Toggles the visibility of the message input area and status message.
   * @param {boolean} showInput - True to show the input field, false to show the status message.
   */
  const updateInputAreaVisibility = (showInput) => {
    if (
      !elements.fileInputContainer ||
      !elements.inputStatusMessage ||
      !elements.inputArea ||
      !elements.sendBtn
    )
      return;

        if (showInput) {
            elements.fileInputContainer.style.display = 'flex';
            elements.sendBtn.style.display = 'block';
            elements.inputStatusMessage.style.display = 'none';
            elements.msgInput.style.display = 'block';
            elements.msgInput.style.opacity = '1';
            state.isInputVisible = true;
        } else {
            elements.fileInputContainer.style.display = 'none';
            elements.sendBtn.style.display = 'none';
            elements.inputStatusMessage.style.display = 'block';
            elements.msgInput.style.display = 'none';
            elements.msgInput.style.opacity = '0';
            state.isInputVisible = false;
        }
        elements.inputArea.style.display = 'block';
        elements.inputArea.style.opacity = '1';
    };

  /**
   * Renders a list of articles in the help section.
   * @param {Array<Object>} filteredArticles - The array of articles to render.
   */
  function renderArticles(filteredArticles) {
    if (!elements.articleScrollableContainer) return;
    elements.articleScrollableContainer.innerHTML = "";
    if (filteredArticles.length === 0) {
      elements.articleScrollableContainer.innerHTML =
        '<p style="text-align: center; color: var(--text-color-secondary); padding: 20px;">No articles found.</p>';
      return;
    }
    filteredArticles.forEach((article) => {
      const articleCard = document.createElement("div");
      articleCard.className = "article-card";
      articleCard.innerHTML = `
                <div class="article-card-content">
                    <strong>${article.title}</strong>
                    <p>${article.description}</p>
                </div>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" height="16" width="16">
                    <path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                </svg>
            `;

      articleCard.addEventListener("click", async () => {
        showView("articleContent", "right", {
          title: article.title,
          description: article.description,
        });

        const response = await fetch(
          `${config.backendUrl}/api/websites/faqs/${config.chatbotCode}/${article._id}`
        );

        const data = await response.json();

        const answer = data.answer;

        const markdownToHtml =
          typeof marked !== "undefined" ? marked.parse(answer) : answer;

        elements.articleContentContainer.innerHTML = markdownToHtml;
      });
      elements.articleScrollableContainer.appendChild(articleCard);
    });
  }

  // --- API & Data Loading Functions ---

  /**
   * Loads messages for a specific chat ID.
   * @param {string} chatId - The ID of the chat to load.
   */
  const loadMessages = async (chatId) => {
    if (!elements.messagesContainer || !config) return;

    try {
      if (!chatId) {
        elements.messagesContainer.innerHTML = "";
        state.currentChatId = null;
        localStorage.removeItem("currentChatId");
        return;
      }

      const response = await fetch(`${config.backendUrl}/api/chats/${chatId}`);
      if (!response.ok)
        throw new Error(`HTTP error! status: ${response.status}`);
      const chat = await response.json();

      // Prevent rendering stale data if chat ID changed during fetch
      if (state.currentChatId !== chatId) {
        return;
      }

      elements.messagesContainer.innerHTML = ""; // Clear existing messages

      const loadedMessages = chat.messages ? JSON.parse(chat.messages) : [];

      let lastBotMessageWithOptionsPresent = false;
      let userRepliedAfterLastOptions = false;

            loadedMessages.forEach((msg, index) => {
                let isReplySentForThisOptionsBlock = false;
                if (msg.options && msg.options.length > 0) {
                    lastBotMessageWithOptionsPresent = true;
                    userRepliedAfterLastOptions = false;
                    for (let i = index + 1; i < loadedMessages.length; i++) {
                        if (loadedMessages[i].sender === 'user') {
                            userRepliedAfterLastOptions = true;
                            break;
                        }
                    }
                    isReplySentForThisOptionsBlock = userRepliedAfterLastOptions;
                } else {
                    lastBotMessageWithOptionsPresent = false;
                }
                renderMessage(msg.sender, msg.text, msg.timestamp, msg.options, isReplySentForThisOptionsBlock, msg.fileUrl);
            });

      hideTypingIndicator();
      state.currentChatId = chatId;
      localStorage.setItem("currentChatId", state.currentChatId);

      // Determine input area visibility based on chat status and last bot message
      if (chat.status === "closed") {
        updateInputAreaVisibility(false);
      } else if (
        lastBotMessageWithOptionsPresent &&
        !userRepliedAfterLastOptions
      ) {
        updateInputAreaVisibility(false);
      } else {
        updateInputAreaVisibility(true);
      }

      elements.messagesContainer.scrollTop =
        elements.messagesContainer.scrollHeight;
    } catch (error) {
      console.error("Error loading chat messages:", error);
      if (state.currentChatId === chatId && t) {
        // Only show error if still on the same chat
        renderMessage(
          "bot",
          t["Error loading chat history."],
          new Date().toISOString()
        );
      }
    }
  };

  /**
   * Loads and displays a list of user chats.
   * @param {string} email - The user's email address.
   */
  const loadUserChats = async (email) => {
    if (!elements.chatListDiv || !config || !t) return;

    try {
      const response = await fetch(
        `${config.backendUrl}/api/chats/${config.chatbotCode}/${email}`
      );
      if (!response.ok)
        throw new Error(`HTTP error! status: ${response.status}`);
      const chats = await response.json();

      elements.chatListDiv.innerHTML = `
                <h3 style="margin: 0 0 24px 0; color: var(--text-color-primary); font-size: 20px; font-weight: 700; letter-spacing: -0.02em;">${t["Your Conversations"]}</h3>
            `;

      if (chats.length === 0) {
        elements.chatListDiv.innerHTML += `
                    <div class="no-conversations">
                        <div class="icon-container">
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" stroke="#9ca3af" stroke-width="2"/>
                            </svg>
                        </div>
                        <p>${t["No conversations yet"]}</p>
                        <small>${t['Click "Start New Conversation" to begin!']}</small>
                    </div>
                `;
      } else {
        const sortedChats = chats.sort(
          (a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)
        );
        let foundOpenChatForAutoLoad = false;

        sortedChats.forEach((chat) => {
          const chatItem = document.createElement("div");
          chatItem.className = "chat-item";

          const createdAtDate = new Date(chat.createdAt).toLocaleString(
            "en-US",
            {
              hour: "2-digit",
              minute: "2-digit",
              month: "short",
              day: "numeric",
              year: "numeric",
            }
          );
          const updatedAtDate = new Date(chat.updatedAt).toLocaleString(
            "en-US",
            {
              hour: "2-digit",
              minute: "2-digit",
              month: "short",
              day: "numeric",
              year: "numeric",
            }
          );

          chatItem.innerHTML = `
                        <div class="chat-header-info">
                            <strong>${chat.name}</strong>
                            <span class="status-tag ${chat.status}">${
            t[chat.status]
          }</span>
                        </div>
                        <div class="chat-meta">📅 ${
                          t["Created:"]
                        } ${createdAtDate}</div>
                        <div class="chat-meta">🕒 ${
                          t["Last Update:"]
                        } ${updatedAtDate}</div>
                        <div class="chat-view-prompt">💬 ${
                          t["Click to view conversation"]
                        }</div>
                    `;

          chatItem.addEventListener("click", () =>
            handleShowChatMessages(chat._id)
          );
          elements.chatListDiv.appendChild(chatItem);

                    // Auto-load the most recent open chat if no chat is currently selected
                    if (!state.currentChatId && chat.status === 'open' && !foundOpenChatForAutoLoad) {
                        state.currentChatId = chat._id;
                        localStorage.setItem('currentChatId', state.currentChatId);
                        foundOpenChatForAutoLoad = true;
                    }
                });
            }
        } catch (error) {
            console.error('Error loading user chats:', error);
            if (t) {
                renderMessage('bot', t['Error loading your chats.'], new Date().toISOString());
            }
        }
    };
    //     if (!config || !elements.chatbotWidget) return;

  //     const currentPathname = window.location.pathname;

  //     function shouldDisplayWidget() {
  //         const allowed = config.allowedPaths;
  //         const disallowed = config.disallowedPaths;

  //         if (!Array.isArray(allowed) || !Array.isArray(disallowed)) {
  //             console.warn("[Chatbot] 'allowed' or 'disallowed' paths are not arrays. Defaulting to hidden.");
  //             return false;
  //         }

  //         let isAllowedByRules = true;
  //         if (allowed.length > 0) {
  //             isAllowedByRules = allowed.some(path =>
  //                 path === "/" ? currentPathname === "/" : currentPathname.startsWith(path)
  //             );
  //         }

  //         let isDisallowedByRules = false;
  //         if (disallowed.length > 0) {
  //             isDisallowedByRules = disallowed.some(path =>
  //                 path === "/" ? currentPathname === "/" : currentPathname.startsWith(path)
  //             );
  //         }

  //         return isAllowedByRules && !isDisallowedByRules;
  //     }

  //     let attempts = 0;
  //     const maxAttempts = 3;
  //     const delays = [200, 300, 700];

  //     function tryToggleWidget() {
  //         const shouldDisplay = shouldDisplayWidget();
  //         const widget = elements.chatbotWidget;

  //         if (widget) {
  //             widget.style.display = shouldDisplay ? "" : "none";
  //             if (shouldDisplay) {
  //                 // console.log(`[Chatbot] Widget visible after ${attempts + 1} attempt(s).`);
  //             } else {
  //                 console.warn("[Chatbot] Widget not loaded: path restrictions apply or element not found after retries.");
  //             }
  //             return;
  //         }

  //         if (attempts < maxAttempts) {
  //             attempts++;
  //             setTimeout(tryToggleWidget, delays[attempts - 1]);
  //         } else {
  //             console.warn("[Chatbot] Widget element not found after all retries. Widget will not be displayed.");
  //             if (widget) {
  //                 widget.style.display = "none";
  //             }
  //         }
  //     }

  //     tryToggleWidget();
  // }

  // /**
  //  * Waits for the chatbot widget element to be available before checking and toggling visibility.
  //  */
  // function waitForWidgetAndCheckVisibility() {
  //     if (elements.chatbotWidget) {
  //         checkAndToggleWidgetVisibility();
  //     } else {
  //         // Re-attempt after a short delay if widget element isn't available yet
  //         setTimeout(waitForWidgetAndCheckVisibility, 300);
  //     }
  // }

  // // Monkey-patch pushState and replaceState to detect SPA navigation
  // const originalPushState = history.pushState;
  // history.pushState = function() {
  //     originalPushState.apply(this, arguments);
  //     checkAndToggleWidgetVisibility();
  // };

  // const originalReplaceState = history.replaceState;
  // history.replaceState = function() {
  //     originalReplaceState.apply(this, arguments);
  //     checkAndToggleWidgetVisibility();
  // };

  // --- Event Handlers ---

  /**
   * Handles the click event for the main chat button to toggle the widget.
   */

  function applyGlassEffect(element, color1, color2, theme = "light") {
    if (!element) return;

    const rgba = (hex, alpha) => {
      const bigint = parseInt(hex.replace("#", ""), 16);
      const r = (bigint >> 16) & 255;
      const g = (bigint >> 8) & 255;
      const b = bigint & 255;
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    };

    const styles = {
      light: {
        background: `linear-gradient(135deg, ${rgba(color1, 0.35)} 0%, ${rgba(
          color2,
          0.45
        )} 50%, ${rgba(color2, 0.4)} 100%)`,
        border: `1px solid ${rgba(color1, 0.3)}`,
        boxShadow: `0 4px 12px ${rgba(
          color1,
          0.15
        )}, 0 2px 4px rgba(0,0,0,0.05), inset 0 1px 0 rgba(255,255,255,0.2)`,
        overlay: `linear-gradient(135deg, rgba(255,255,255,0.1) 0%, transparent 50%, ${rgba(
          color1,
          0.1
        )} 100%)`,
        hover: {
          background: `linear-gradient(135deg, ${rgba(color1, 0.25)} 0%, ${rgba(
            color2,
            0.35
          )} 50%, ${rgba(color2, 0.3)} 100%)`,
          borderColor: rgba(color1, 0.5),
          boxShadow: `0 8px 24px ${rgba(
            color1,
            0.25
          )}, 0 4px 8px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.3)`,
          transform: "translateY(-2px)",
        },
      },
      dark: {
        // Increased opacity values
        background: `linear-gradient(135deg, ${rgba(color1, 0.25)} 0%, ${rgba(
          color2,
          0.35
        )} 50%, ${rgba(color2, 0.25)} 100%)`,
        border: `1px solid ${rgba(color1, 0.3)}`,
        boxShadow: `0 4px 12px ${rgba(
          color1,
          0.2
        )}, 0 2px 4px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)`,
        overlay: `linear-gradient(135deg, rgba(255,255,255,0.05) 0%, transparent 50%, ${rgba(
          color1,
          0.05
        )} 100%)`,
        hover: {
          background: `linear-gradient(135deg, ${rgba(color1, 0.3)} 0%, ${rgba(
            color2,
            0.4
          )} 50%, ${rgba(color2, 0.3)} 100%)`,
          borderColor: rgba(color1, 0.5),
          boxShadow: `0 8px 24px ${rgba(
            color1,
            0.3
          )}, 0 4px 8px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08)`,
          transform: "none",
        },
      },
    };

    const style = styles[theme];

    // Base styles
    Object.assign(element.style, {
      background: style.background,
      backdropFilter: "blur(24px)",
      border: style.border,
      boxShadow: style.boxShadow,
      borderRadius: "1rem",
      color: "white",
      overflow: "hidden",
      position: "relative",
      transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
    });

    // Add or update overlay div
    let overlay = element.querySelector(".glass-effect-before");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.className = "glass-effect-before";
      Object.assign(overlay.style, {
        content: '""',
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        borderRadius: "inherit",
        pointerEvents: "none",
        zIndex: 0,
      });
      element.appendChild(overlay);
    }
    overlay.style.background = style.overlay;

    // Hover events
    element.addEventListener("mouseenter", () => {
      element.style.background = style.hover.background;
      element.style.borderColor = style.hover.borderColor;
      element.style.boxShadow = style.hover.boxShadow;
      element.style.transform = style.hover.transform;
    });

    element.addEventListener("mouseleave", () => {
      element.style.background = style.background;
      element.style.borderColor = style.border.replace("1px solid ", "");
      element.style.boxShadow = style.boxShadow;
      element.style.transform = "none";
    });
  }

  const handleToggleWidget = () => {
    if (!elements.chatWindow || !elements.chatButton) return;

    if (state.isExpanded) {
      elements.chatWindow.classList.remove("slide-down");
      elements.chatWindow.classList.add("smooth-slide-down");

      window.parent.postMessage(
        {
          type: "chatbotCollapse",
        },
        "*"
      );

      setTimeout(() => {
        elements.chatWindow.style.display = "none";
        elements.chatWindow.classList.remove("smooth-slide-down");
        elements.chatButton.style.display = "flex";
        elements.chatButton.classList.add("button-fade-in");
        setTimeout(() => {
          elements.chatButton.classList.remove("button-fade-in");
        }, 500);
        state.isExpanded = false;

        switchTab("home");
      }, 500);
    } else {
      window.parent.postMessage(
        {
          type: "chatbotExpand",
          width: "400px", // Desired expanded width
          height: "629px", // Desired expanded height
        },
        "*"
      );

      elements.chatButton.style.display = "none";
      elements.chatWindow.style.display = "flex";
      elements.chatWindow.classList.remove("slide-down", "smooth-slide-down");
      state.isExpanded = true;

      if (!state.userEmail) {
        showView("email");
      } else {
        showView("conversations");
        loadUserChats(state.userEmail);
      }
    }
  };

  /**
   * Handles displaying the chat list view.
   */
  const handleShowChatList = () => {
    localStorage.removeItem("currentChatId");
    state.currentChatId = null;

    hideTypingIndicator();
    if (elements.messagesContainer) {
      elements.messagesContainer.innerHTML = ""; // Clear messages
    }

        updateInputAreaVisibility(true); // Ensure input is visible when returning to chat li
        if (!state.userEmail) {
            showView('email');
        } else {
            showView('conversations', 'left');
            loadUserChats(state.userEmail);
        }
    };


  /**
   * Handles displaying the chat messages view for a given chat ID.
   * @param {string} chatId - The ID of the chat to display.
   */
  const handleShowChatMessages = async (chatId) => {
    state.currentChatId = chatId;
    localStorage.setItem("currentChatId", state.currentChatId);

    if (socket) {
      // Ensure socket is available
      socket.emit("join_chat", { chatId: chatId });
    }

    await loadMessages(chatId);

    showView("chat", "right");

    setTimeout(() => {
      if (elements.messagesContainer) {
        elements.messagesContainer.scrollTop =
          elements.messagesContainer.scrollHeight;
      }
    }, 450);
  };

  /**
   * Handles email submission to start a conversation.
   */
  const handleEmailSubmit = async () => {
    if (!elements.emailInput || !elements.emailSubmitBtn) return;

    const email = elements.emailInput.value.trim();
    if (email) {
      localStorage.setItem("chatbotEmail", email);
      state.userEmail = email;
      showView("conversations", "right");
      await loadUserChats(state.userEmail);
      // Optionally auto-open the most recent open chat if found
    } else {
      elements.emailInput.style.borderColor = "#ef4444";
      elements.emailInput.style.boxShadow = "0 0 0 3px rgba(239, 68, 68, 0.2)";
      elements.emailInput.focus();
      setTimeout(() => {
        elements.emailInput.style.borderColor = "var(--border-color)";
        elements.emailInput.style.boxShadow = "none";
      }, 2000);
    }
  };

  /**
   * Handles initiating a new chat.
   */
  const handleNewChat = async () => {
    if (!elements.messagesContainer || !config || !t || !socket) return;

        try {
            elements.messagesContainer.innerHTML = ''; // Clear messages for a new chat
            showView('chat', 'right');
            updateInputAreaVisibility(true)

            // Fetch current country data for new chat
            // Ensure this API call is allowed by your Content Security Policy if applicable
            const countryRes = await fetch('https://ipwho.is/');
            const data = await countryRes.json();
            socket.emit("create_new_chat", {
                chatbotCode: config.chatbotCode,
                email: state.userEmail,
                country: { country: data.success ? data.country : "", countryCode: data.success ? data.country_code : "", flag: data.success ? data.flag.img : "" }
            });
        } catch (error) {
            console.error('Error creating new chat:', error);
            hideTypingIndicator();
            renderMessage('bot', t['Error starting a new chat.'], new Date().toISOString());
        }
    };

    /**
     * Handles sending a message from the input field.
     */
    const handleSendMessage = async () => {
        if (!elements.msgInput || !state.currentChatId || !config || !socket) {
          return;
        }
    
        const msg = elements.msgInput.value.trim();
        if (!msg) {
          return;
        }
    
        const files = elements.fileInput.files;
    
        // Disable all option buttons on all message bubbles when a new message is sent
        const allMessageBubbles =
          elements.messagesContainer.querySelectorAll(".message-bubble");
        allMessageBubbles.forEach((bubble) => {
          const optionButtons = bubble.querySelectorAll(".option-button");
          optionButtons.forEach((button) => {
            button.disabled = true;
            button.style.opacity = "0.6";
            button.style.cursor = "default";
            button.onmouseenter = null;
            button.onmouseleave = null;
          });
        });
    
        let uploadedFileUrl = "";
        if (files.length > 0) {
          // console.log("Widget: Files detected. Starting upload process.");
          try {
            const formData = new FormData();
            for (let i = 0; i < files.length; i++) {
              formData.append("media", files[i]);
            }
            // Ensure chatId is appended if your backend expects it for file uploads
            formData.append("chatId", state.currentChatId);
    
            const uploadResponse = await fetch(`${config.backendUrl}/api/files`, {
              method: "POST",
              body: formData,
            });
    
            if (!uploadResponse.ok) {
              const errorData = await uploadResponse.json();
              throw new Error(`${errorData.message}  "File upload failed."`);
            }
    
            const uploadResult = await uploadResponse.json();
            uploadedFileUrl = uploadResult.data.url;
            // console.log("Widget: Files uploaded successfully. URLs:", uploadedFileUrl);
    
            console.log("uploadedFileUrl", uploadedFileUrl);
          } catch (error) {
            console.error("Widget: Error uploading files:", error);
            renderMessage(
              "bot",
              `Error uploading file(s): ${error.message},
                  new Date().toISOString()`
            );
            return; // Stop execution if file upload fails
          }
        }
    
        hideTypingIndicator();
        renderMessage('user', msg, new Date().toISOString(), [], undefined, uploadedFileUrl);
        elements.msgInput.value = ""; // Clear input field
        elements.fileInput.value = "";
        elements.fileInputContainer.classList.add("active");
        elements.sendBtn.classList.remove("active");
    
        socket.emit("message", {
          chatbotCode: config.chatbotCode,
          chatId: state.currentChatId,
          email: state.userEmail,
          message: msg,
          currentWebsiteURL: window.location.href,
          fileUrl: uploadedFileUrl,
        });
    
        updateInputAreaVisibility(true); // Keep input visible after sending message
      };
    
    /**
     * Handles switching between tabs (Home, Messages, Help).
     * @param {string} tabId - The ID of the tab to switch to ('home', 'messages', 'help').
     */
    async function switchTab(tabId, bypassConfig = false) {
        if(config.tabsMode === false && !bypassConfig) return;

    if (!elements.tabButtons || !elements.chatHeader) return;

    // Remove active class from all tabs and panels
    elements.tabButtons.forEach((tab) => {
      tab.classList.remove("active");
      tab.setAttribute("aria-selected", "false");
    });

    document.querySelectorAll(".tab-panel").forEach((panel) => {
      panel.classList.remove("active");
    });

    // Add active class to selected tab and panel
    const selectedTab = document.getElementById(tabId + "-tab");
    const selectedPanel = document.getElementById(tabId + "-panel");

    if (tabId === "home") {
      elements.chatHeader.style.display = "none";
    } else {
      elements.chatHeader.style.display = "flex";
    }

    if (tabId === "help") {
      showView("articles", "bottom");

      renderArticles(articles); // Render all articles initially
      elements.searchArticleInput.value = ""; // Clear search input
    } else if (tabId === "messages") {
      // If already in chat view, stay there. Otherwise, show conversations.
      if (state.userEmail) {
        if (state.currentView !== "chat") {
          showView("conversations", "right");
        }
      } else {
        showView("email", "right");
      }
    } else if (tabId === "home") {
      showView("home", "left"); // Assuming 'home' is a view defined in showView
    }

    if (selectedTab) {
      selectedTab.classList.add("active");
      selectedTab.setAttribute("aria-selected", "true");
    }
    if (selectedPanel) {
      selectedPanel.classList.add("active");
    }
  }

  // --- External Data (Articles) ---
  let articles = [];

  // --- Socket.IO Connection (declared here, instantiated in initializeChatbot) ---
  // Assuming 'io' is globally available from the Socket.IO client script
  let socket;

  function setupSocketListeners() {
    // Ensure config is available before creating socket
    if (!config || typeof io === "undefined") {
      console.error(
        "Attempted to set up socket listeners before config was loaded or Socket.IO client library is missing."
      );
      return;
    }
    socket = io(config.socketIoUrl, {
      path: "/socket.io",
      query: {
        chatbotCode: config.chatbotCode,
        currentWebsiteURL: window.location.href,
      },
      transports: ["websocket", "polling"],
    });

        socket.on("connect", () => {
            // console.log("Chatbot socket connected.");
        });

        socket.on("new_chat_data", (data) => {
            // console.log("Widget received new_chat_data:", data);
            state.currentChatId = data.chat._id;
            localStorage.setItem('currentChatId', state.currentChatId);
            socket.emit("join_chat", { chatId: state.currentChatId });
        });

        socket.on("reply", (data) => {
            hideTypingIndicator();
            // console.log("Widget received 'reply' event:", data);
            renderMessage(data.sender, data.text, data.timestamp || new Date().toISOString(), data.options, data.fileUrl);
        });

        socket.on("bot_typing_start", () => {
            // console.log("Widget received bot_typing_start");
            showTypingIndicator();
        });

        socket.on("bot_typing_stop", () => {
            // console.log("Widget received bot_typing_stop");
            hideTypingIndicator();
        });

        socket.on("chat_update", (data) => {
            // console.log("Widget received 'chat_update' event:", data);
            if (data.chatId === state.currentChatId) {
                if (data.message && data.sender === "bot") {
                    renderMessage(data.sender, data.message, new Date().toISOString(), data.options, data.fileUrl);
                }
                if (data.status === 'closed') {
                    updateInputAreaVisibility(false);

                    if (t && !data.message) { // Only add 'closed' message if no other message is provided
                        renderMessage('bot', t['This conversation has been closed.'], new Date().toISOString());
                    }
                } else if (data.status === 'open') {
                    // Re-evaluate input visibility based on the last message in the chat
                    const lastMessageElement = elements.messagesContainer.lastElementChild;
                    if (lastMessageElement && lastMessageElement.classList.contains('message-bubble')) {
                        const optionButtons = lastMessageElement.querySelectorAll('.option-button');
                        if (optionButtons.length > 0 && Array.from(optionButtons).some(btn => !btn.disabled)) {
                            updateInputAreaVisibility(false); // If options are present and not replied to, keep input hidden
        
                        } else {
                            updateInputAreaVisibility(true); // Otherwise, show input
        
                        }
                    } else {
                        updateInputAreaVisibility(true); // If no messages, show input\
    
                    }
                }
            }
        });
    }
    
    // --- Core Initialization Function ---
    async function initializeChatbot() {
        const tabsList = [
            {
                id: 'home-tab',
                title: t["Home"],
                ariaControls: "home-panel",
                icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-6"><path stroke-linecap="round" stroke-linejoin="round" d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" /></svg>`
            },
            {
                id: 'messages-tab',
                title: t["Messages"],
                ariaControls: "messages-panel",
                icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-6"><path stroke-linecap="round" stroke-linejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" /></svg>`
            },
            {
                id: 'help-tab',
                title: t["Help"],
                ariaControls: "help-panel",
                icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-6"><path stroke-linecap="round" stroke-linejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z" /></svg>`
            }
        ]
        // Populate elements object now that DOM is ready and config is available
        // It's crucial that these elements exist in your HTML when this function runs.
        elements.chatbotWidget = document.getElementById("chatbot-widget");
        elements.chatButton = document.getElementById("chat-button");
        elements.chatWindow = document.getElementById("chat-window");
        elements.headerTitle = document.getElementById('header-title');
        elements.headerSubtitle = document.getElementById('header-subtitle');
        elements.backBtnChats = document.getElementById('back-to-chats');
        elements.backBtnArtilces = document.getElementById('back-to-articles');
        elements.closeBtns = document.querySelectorAll('[id=close-chat]');
        elements.emailInputArea = document.getElementById('email-input-area');
        elements.emailInput = document.getElementById("emailInput");
        elements.emailSubmitBtn = document.getElementById("emailSubmitBtn");
        elements.chatListDiv = document.getElementById('chat-list');
        elements.messagesContainer = document.getElementById('messages-container');
        elements.typingIndicatorBubble = document.getElementById('typing-indicator-bubble');
        elements.inputArea = document.getElementById('chatbot-input-area');
        elements.msgInput = document.getElementById("msg");
        elements.sendBtn = document.getElementById("sendBtn");
        elements.newChatBtnContainer = document.getElementById('new-chat-button-container');
        elements.newChatBtn = document.getElementById("newChatBtn");
        elements.inputStatusMessage = document.getElementById('input-status-message');
        elements.footer = document.getElementById('footer');
        elements.fileInputContainer = document.getElementById('file-input-container');
        elements.chatHeader = document.getElementById('chat-header');
        elements.articlesContainer = document.getElementById('articles');
        elements.articleContentContainer = document.getElementById('article-content-container');
        elements.articleScrollableContainer = document.querySelector('.article-scrollable-container');
        elements.searchArticleInput = document.getElementById('search-article');
        elements.tabsFooter = document.getElementById('tabs-footer');
        elements.fileInput = document.getElementById("file-input");
        elements.fileCount = document.getElementById("file-count");
        elements.removeFile = document.getElementById("remove-file")
        tabsList.forEach(tab => {
          const tabButton = document.createElement('button');
          tabButton.id = tab.id;
          tabButton.role = "tab";
          tabButton.ariaControls = tab.ariaControls;
          tabButton.classList.add('tab-button');
          if(tab.id.includes("home")) {
            tabButton.classList.add('active');
            tabButton.ariaSelected = "true";
          } else {
            tabButton.ariaSelected = "false";
          }

      tabButton.textContent = tab.title;

      tabButton.insertAdjacentHTML("afterbegin", tab.icon);

      elements.tabsFooter.appendChild(tabButton);
    });

    elements.tabButtons = document.querySelectorAll(".tab-button");
    elements.homeScreenContent = document.getElementById("home-content");
    elements.homeQuickActions = document.getElementById("home-quick-actions");
    elements.staffPfps = document.getElementById("staff-pfp");
    elements.homeHeader = document.getElementById("home-header");
    elements.heading = document.getElementById("home-heading");
    elements.homeHelpSection = document.getElementById("home-help-section");
    elements.branding = document.getElementById("branding");

    if (config.autoOpen) {
      handleToggleWidget();
    }

    if (config.branding) {
      elements.branding.insertAdjacentHTML(
        "afterbegin",
        `<span>${t["Powered by"]}${" "}</span>`
      );
    } else {
      elements.branding.style.opacity = "0";
      elements.branding.style.marginBottom = "0";
      elements.branding.style.marginTop = "0";
    }
    if (config.tabsMode === false) {
      switchTab("messages", true);
    }

    if (config.heading) {
      elements.heading.innerHTML = config.heading.text;

      if (config.heading.color) {
        elements.heading.style.color = config.heading.color;
      }

      if (config.heading.fontSize) {
        elements.heading.style.fontSize = config.heading.fontSize;
      }

      if (config.heading.shadow) {
        elements.heading.style.textShadow = `0 2px 4px ${config.heading.shadowColor}`;
      } else {
        elements.heading.style.textShadow = "none";
      }
    }

    if (config.staffInitials) {
      config.staffInitials.forEach((initial) => {
        const divContainer = document.createElement("div");
        divContainer.textContent = initial;

        elements.staffPfps.appendChild(divContainer);
      });
    }

    if (config.logoUrl) {
      const img = `<img src="${config.logoUrl}" width="32" height="32"/>`;

      elements.homeHeader.insertAdjacentHTML("afterbegin", img);
    }

        if(config.homeTab.qickActionsButtons) {
            config.homeTab.qickActionsButtons.forEach(action => {
                const actionButton = document.createElement('button');
                actionButton.id = "cbh-deep-link";
                actionButton.ariaLabel = action.deepLink;
                const textSpan = document.createElement('span');
                textSpan.textContent = action.text;
                
                // console.log(action)
                actionButton.appendChild(textSpan);
                actionButton.insertAdjacentHTML('beforeend', action.icon);

        applyGlassEffect(
          actionButton,
          config.gradient1,
          config.gradient2,
          config.theme
        );
        elements.homeQuickActions.appendChild(actionButton);
      });
    }

    if (config.homeTab.helpSection) {
      const mainButton = `<button class="help-search-button" id="cbh-deep-link" aria-label="help->*cbhdeeplink^&^cbhdeeplink*->articles->*cbhdeeplink^&^cbhdeeplink*->null">
                                <span>Search for help</span>
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" class="search-icon">
                                    <path d="M15.0349 2.75L16.4378 2.75L16.695 3.44512C17.056 4.4208 17.1712 4.68588 17.3608 4.87551C17.5504 5.06514 17.8155 5.18028 18.7912 5.54132L19.4863 5.79853L19.4863 7.20147L18.7912 7.45869C17.8155 7.81972 17.5504 7.93486 17.3608 8.12449C17.1712 8.31412 17.056 8.57921 16.695 9.55488L16.4378 10.25L15.0349 10.25L14.7776 9.55488C14.4166 8.57921 14.3015 8.31412 14.1118 8.12449C13.9222 7.93486 13.6571 7.81972 12.6814 7.45868L11.9863 7.20147L11.9863 5.79853L12.6814 5.54132C13.6571 5.18028 13.9222 5.06514 14.1118 4.87551C14.3015 4.68588 14.4166 4.42079 14.7776 3.44512L15.0349 2.75Z" fill="currentColor"></path>
                                    <path d="M3.25 11.3528C3.25 7.15391 6.65391 3.75 10.8528 3.75V5.65071C7.70364 5.65071 5.15071 8.20364 5.15071 11.3528C5.15071 14.5021 7.70364 17.055 10.8528 17.055C14.0021 17.055 16.555 14.5021 16.555 11.3528H18.4557C18.4557 13.1098 17.8597 14.7275 16.859 16.015L20.75 19.906L19.406 21.25L15.515 17.359C14.2275 18.3597 12.6098 18.9557 10.8528 18.9557C6.65391 18.9557 3.25 15.5518 3.25 11.3528Z" fill="currentColor"></path>
                                </svg>            
                            </button>`;

      elements.homeHelpSection.insertAdjacentHTML("afterbegin", mainButton);

      config.homeTab.helpSection.forEach((helpDeepLinkButton) => {
        const helpButton = document.createElement("button");
        helpButton.textContent = helpDeepLinkButton.title;
        helpButton.id = "cbh-deep-link";
        helpButton.classList.add("help-option-button");
        helpButton.ariaLabel = helpDeepLinkButton.deepLink;

        elements.homeHelpSection.appendChild(helpButton);
      });
    } else {
      elements.homeHelpSection.style.display = "none";
    }

    if (config.bgImageUrl) {
      const el = elements.homeScreenContent;

      // Градієнти для темної та світлої теми
      const isDark =
        document.documentElement.getAttribute("data-theme") === "dark";

      const gradient = isDark
        ? `linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.75) 30%, rgba(0,0,0,0.55) 60%, rgba(255,255,255,0.15) 100%)`
        : `linear-gradient(to top, rgba(255,255,255,0.85) 0%, rgba(255,255,255,0.7) 30%, rgba(255,255,255,0.5) 60%, rgba(0,0,0,0.2) 100%)`;

      const imageUrl = config.bgImageUrl || "./bg-image.png";

      el.style.backgroundImage = `${gradient}, url("${imageUrl}")`;
    } else if (config.bgColor) {
      elements.homeScreenContent.style.backgroundColor = config.bgColor;
    } else {
      const fallbackGradient = `linear-gradient(to top, ${config.gradient1}, ${config.gradient2}90)`;

      elements.homeScreenContent.style.backgroundImage = fallbackGradient;
    }
    // Critical check: if the main button is not found, something is wrong with HTML/timing.
    if (
      !elements.chatButton ||
      !elements.chatWindow ||
      !elements.chatbotWidget
    ) {
      console.error(
        "CRITICAL: Essential chatbot DOM elements not found. Initialization stopped."
      );
      console.log("Missing Elements:", {
        chatButton: elements.chatButton,
        chatWindow: elements.chatWindow,
        chatbotWidget: elements.chatbotWidget,
      });
      return; // Stop initialization if critical elements are missing
    }

    const response = await fetch(
      `${config.backendUrl}/api/websites/faqs/${config.chatbotCode}`
    );

    const data = await response.json();
    articles = data.faqs;

    setCssCustomProperties();
    updateInitialTexts();
    addInputFocusEffects();
    // waitForWidgetAndCheckVisibility(); // This itself has retries for chatbotWidget
    initializeDeepLinkButtons();

        // Attach event listeners
        elements.chatButton.addEventListener('click', handleToggleWidget);
        // console.log('Event listener attached to chatButton.');

    elements.searchArticleInput.placeholder = t["Search for help"];
    // Ensure closeBtns is a NodeList and iterate it
    if (elements.closeBtns) {
      elements.closeBtns.forEach((btn) =>
        btn.addEventListener("click", handleToggleWidget)
      );
    }

    if (elements.emailSubmitBtn && elements.emailInput) {
      elements.emailSubmitBtn.addEventListener("click", handleEmailSubmit);
      elements.emailInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") handleEmailSubmit();
      });
    }

    if (elements.newChatBtn) {
      elements.newChatBtn.addEventListener("click", handleNewChat);
    }

        if (elements.msgInput && elements.fileInputContainer && elements.sendBtn) {
            elements.msgInput.addEventListener("input", () => {
                if (elements.msgInput.value.length !== 0) {
                    elements.fileInputContainer.classList.remove("active");
                    elements.sendBtn.classList.add("active");
                } else {
                    elements.fileInputContainer.classList.add("active");
                    elements.sendBtn.classList.remove("active");
                }
                let caret = msg.selectionStart;
                let value = msg.value;
              
                // Remove all line breaks first
                value = value.replace(/\n/g, '');
              
                // Break into lines of max 27 chars
                let chunks = value.match(/.{1,27}/g) || [];
                let newValue = chunks.join('\n');
              
                // Update value if needed
                if (msg.value !== newValue) {
                  msg.value = newValue;
                  msg.selectionStart = msg.selectionEnd = caret + 1;
                }
              
                // 💡 Auto-resize
                msg.style.height = 'auto'; // Reset first
                msg.style.height = msg.scrollHeight + 'px';
              
                // 🧽 Reset to base height if empty
                if (msg.value.trim() === '') {
                  msg.style.height = '1.2em'; // or set it to exact initial height like '24px'
                }
            });
        }

        if(elements.fileInput && elements.removeFile) {
            elements.fileInput.addEventListener("input", () => {
                if(elements.fileInput.files.length > 0) {
                    elements.fileCount.style.display = "block"
                } else {
                    elements.fileCount.style.display = "none"
                }
            });

            elements.removeFile.addEventListener('click', () => {
                elements.fileInput.value = '';
                elements.fileInput.dispatchEvent(new Event('input'))
            })
        }
        if (elements.sendBtn && elements.msgInput) {
            elements.sendBtn.addEventListener("click", handleSendMessage);
            elements.msgInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') handleSendMessage();
            });
        }

    if (elements.backBtnChats) {
      elements.backBtnChats.addEventListener("click", handleShowChatList);
    }
    if (elements.backBtnArtilces) {
      elements.backBtnArtilces.addEventListener("click", () =>
        showView("articles", "left")
      );
    }

    // Article search event listener
    if (elements.searchArticleInput) {
      elements.searchArticleInput.addEventListener("input", (event) => {
        const query = event.target.value.toLowerCase();
        const filteredArticles = articles.filter(
          (article) =>
            article.title.toLowerCase().includes(query) ||
            article.description.toLowerCase().includes(query)
        );
        renderArticles(filteredArticles);
      });
    }

    // Tab button event listeners
    if (elements.tabButtons) {
      elements.tabButtons.forEach((button) => {
        button.addEventListener("click", function () {
          const tabId = this.id.replace("-tab", "");
          switchTab(tabId);
        });
      });
    }

        // Initial view setup
        if (state.userEmail) {
            loadUserChats(state.userEmail);
            showView('conversations');
        } else {
            showView('email');
        }
        updateInputAreaVisibility(state.isInputVisible); // Ensure input visibility is correct on load
        // console.log(`updateInputAreaVisibility(${state.isInputVisible})`)

    // Initialize Socket.IO connection and listeners
    setupSocketListeners();
  }

    // --- Step 2: Ensure DOM is Ready ---
    let domReady = false;
    document.addEventListener('DOMContentLoaded', () => {
        domReady = true;
        // console.log('--- DOMContentLoaded fired. ---');
        window.parent.postMessage({ type: 'initialized' }, '*');
        attemptInitialization();
    });

    // --- Step 3: Combined Initialization Check ---
    // This function will attempt to call initializeChatbot only when both conditions are met
    function attemptInitialization() {
        // console.log('Waiting for DOM or config... DOM Ready:', domReady, 'Config Loaded:', config !== null); // Uncomment for more detailed waiting logs
        if (domReady && config !== null) {
            // console.log('--- Both DOM ready and config loaded. Proceeding with initialization. ---');
            initializeChatbot();
        }
    }

  // After config is loaded, also attempt initialization
  configLoadedPromise.then(() => {
    attemptInitialization();
  });
})();
