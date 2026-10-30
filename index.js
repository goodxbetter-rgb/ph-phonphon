
(() => {
    'use strict';

    const EXTENSION_ID = 'cps-phone-system';
    const MODULE_NAME = 'CharacterPhoneSystem';
    const STORAGE_KEY = `${EXTENSION_ID}-messages`;

    let phoneWindow = null;
    let launcher = null;
    let activeTab = 'messages';
    let phoneView = 'user';
    let activeConversationKey = null;
    let isMinimized = false;
    let dragState = null;
    let launcherDragState = null;
    let launcherWasDragged = false;
    const generatingReplies = new Set();

    const TABS = {
        messages: { label: 'ข้อความ' },
        calls: { label: 'โทรศัพท์' },
        contacts: { label: 'รายชื่อ' },
    };

    // =========================================
    // Context and Storage
    // =========================================

    function getContext() {
        return window.SillyTavern?.getContext?.() || null;
    }

    function getCurrentCharacter() {
        const context = getContext();

        if (!context || context.characterId == null) return null;

        return context.characters?.[context.characterId] || null;
    }

    function getCurrentChatName() {
        const character = getCurrentCharacter();
        if (character) return character.name || 'ตัวละคร';

        const context = getContext();
        if (context?.groupId) return 'Group Chat';

        return 'ไม่ได้เลือกตัวละคร';
    }

    function getConversationKey() {
        const character = getCurrentCharacter();
        if (!character) return null;

        // Avatar filename is generally more stable than character index.
        return `character:${character.avatar || character.name}`;
    }

    function loadMessages() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (!saved) return {};

            const parsed = JSON.parse(saved);
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch (error) {
            console.warn(`[${MODULE_NAME}] Cannot load messages.`, error);
            return {};
        }
    }

    let conversations = loadMessages();

    function saveMessages() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
        } catch (error) {
            console.error(`[${MODULE_NAME}] Cannot save messages.`, error);
        }
    }

    function getConversation(key = getConversationKey()) {
        if (!key) return null;

        if (!Array.isArray(conversations[key])) {
            conversations[key] = [];
        }

        return conversations[key];
    }

    function createMessage(sender, text, status = 'Delivered') {
        return {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            sender,
            text,
            status,
            timestamp: Date.now(),
        };
    }

    // =========================================
    // Floating Launcher
    // =========================================

    function createLauncher() {
        if (launcher) return;

        launcher = document.createElement('button');
        launcher.id = `${EXTENSION_ID}-launcher`;
        launcher.className = 'cps-launcher';
        launcher.type = 'button';
        launcher.textContent = '☎';
        launcher.title = 'เปิด Character Phone System';

        launcher.addEventListener('pointerdown', event => {
            if (event.button !== 0) return;

            const rect = launcher.getBoundingClientRect();

            launcherDragState = {
                pointerId: event.pointerId,
                startX: event.clientX,
                startY: event.clientY,
                left: rect.left,
                top: rect.top,
            };

            launcherWasDragged = false;
            launcher.setPointerCapture(event.pointerId);
        });

        launcher.addEventListener('pointermove', event => {
            if (!launcherDragState) return;
            if (event.pointerId !== launcherDragState.pointerId) return;

            const dx = event.clientX - launcherDragState.startX;
            const dy = event.clientY - launcherDragState.startY;

            if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
                launcherWasDragged = true;
            }

            if (!launcherWasDragged) return;

            const left = Math.max(
                0,
                Math.min(
                    window.innerWidth - launcher.offsetWidth,
                    launcherDragState.left + dx
                )
            );

            const top = Math.max(
                0,
                Math.min(
                    window.innerHeight - launcher.offsetHeight,
                    launcherDragState.top + dy
                )
            );

            launcher.style.left = `${left}px`;
            launcher.style.top = `${top}px`;
            launcher.style.right = 'auto';
            launcher.style.bottom = 'auto';
        });

        launcher.addEventListener('pointerup', event => {
            if (!launcherDragState) return;
            if (event.pointerId !== launcherDragState.pointerId) return;

            if (launcherWasDragged) saveLauncherPosition();
            launcherDragState = null;
        });

        launcher.addEventListener('pointercancel', () => {
            launcherDragState = null;
            launcherWasDragged = false;
        });

        launcher.addEventListener('click', event => {
            if (launcherWasDragged) {
                event.preventDefault();
                event.stopPropagation();
                launcherWasDragged = false;
                return;
            }

            togglePhone();
        });

        document.body.appendChild(launcher);
        restoreLauncherPosition();
    }

    function saveLauncherPosition() {
        if (!launcher) return;

        const rect = launcher.getBoundingClientRect();

        try {
            localStorage.setItem(
                `${EXTENSION_ID}-launcher-position`,
                JSON.stringify({ left: rect.left, top: rect.top })
            );
        } catch (error) {
            console.warn(`[${MODULE_NAME}] Cannot save launcher position.`, error);
        }
    }

    function restoreLauncherPosition() {
        if (!launcher) return;

        try {
            const saved = localStorage.getItem(
                `${EXTENSION_ID}-launcher-position`
            );

            if (!saved) return;

            const position = JSON.parse(saved);

            if (
                typeof position.left !== 'number' ||
                typeof position.top !== 'number'
            ) return;

            launcher.style.left = `${Math.max(
                0,
                Math.min(position.left, window.innerWidth - launcher.offsetWidth)
            )}px`;

            launcher.style.top = `${Math.max(
                0,
                Math.min(position.top, window.innerHeight - launcher.offsetHeight)
            )}px`;

            launcher.style.right = 'auto';
            launcher.style.bottom = 'auto';
        } catch (error) {
            console.warn(`[${MODULE_NAME}] Cannot restore launcher position.`, error);
        }
    }

    // =========================================
    // Phone Window
    // =========================================

    function createPhone() {
        if (phoneWindow) return;

        phoneWindow = document.createElement('section');
        phoneWindow.id = `${EXTENSION_ID}-window`;
        phoneWindow.className = 'cps-window';

        phoneWindow.innerHTML = `
            <header class="cps-header">
                <div class="cps-header-info">
                    <span class="cps-status-dot"></span>
                    <span class="cps-header-title">PHONE</span>
                </div>

                <div class="cps-window-controls">
                    <button type="button" class="cps-minimize" title="ย่อหน้าต่าง">−</button>
                    <button type="button" class="cps-close" title="ปิดหน้าต่าง">×</button>
                </div>
            </header>

            <div class="cps-screen">
                <div class="cps-topbar">
                    <span class="cps-clock">12:00</span>
                    <span class="cps-network">● ● ●</span>
                </div>

                <div class="cps-phone-switcher">
                    <button type="button" class="cps-phone-switch" data-view="user">
                        <span>▣</span>
                        <span>Your Phone</span>
                    </button>

                    <button type="button" class="cps-phone-switch" data-view="character">
                        <span>◉</span>
                        <span>Character Phone</span>
                    </button>
                </div>

                <div class="cps-page">
                    <div class="cps-page-heading">
                        <div>
                            <div class="cps-greeting">YOUR PHONE</div>
                            <h2 class="cps-page-title">ข้อความ</h2>
                        </div>
                        <span class="cps-current-chat"></span>
                    </div>

                    <div class="cps-content"></div>
                </div>

                <nav class="cps-navigation">
                    <button type="button" class="cps-nav-button" data-tab="messages">
                        <span class="cps-nav-icon">✉</span>
                        <span>ข้อความ</span>
                    </button>

                    <button type="button" class="cps-nav-button" data-tab="calls">
                        <span class="cps-nav-icon">☎</span>
                        <span>โทรศัพท์</span>
                    </button>

                    <button type="button" class="cps-nav-button" data-tab="contacts">
                        <span class="cps-nav-icon">♙</span>
                        <span>รายชื่อ</span>
                    </button>
                </nav>
            </div>

            <div class="cps-resize-handle" title="ปรับขนาดหน้าต่าง"></div>
        `;

        document.body.appendChild(phoneWindow);

        phoneWindow.querySelector('.cps-close')
            .addEventListener('click', closePhone);

        phoneWindow.querySelector('.cps-minimize')
            .addEventListener('click', minimizePhone);

        phoneWindow.querySelectorAll('.cps-nav-button')
            .forEach(button => {
                button.addEventListener('click', () => {
                    activeConversationKey = null;
                    switchTab(button.dataset.tab);
                });
            });

        phoneWindow.querySelectorAll('.cps-phone-switch')
            .forEach(button => {
                button.addEventListener('click', () => {
                    switchPhoneView(button.dataset.view);
                });
            });

        setupDragging();
        setupResizing();
        restoreWindowPosition();
        updateClock();
        renderPage();
    }

    function openPhone() {
        createPhone();

        phoneWindow.classList.add('cps-visible');
        phoneWindow.classList.remove('cps-minimized');

        isMinimized = false;
    }

    function closePhone() {
        if (!phoneWindow) return;

        phoneWindow.classList.remove('cps-visible');
        phoneWindow.classList.remove('cps-minimized');
        isMinimized = false;
    }

    function minimizePhone() {
        if (!phoneWindow) return;

        phoneWindow.classList.toggle('cps-minimized');
        isMinimized = phoneWindow.classList.contains('cps-minimized');
    }

    function togglePhone() {
        if (!phoneWindow || !phoneWindow.classList.contains('cps-visible')) {
            openPhone();
        } else {
            closePhone();
        }
    }

    // =========================================
    // View Switching
    // =========================================

    function switchPhoneView(view) {
        if (view !== 'user' && view !== 'character') return;

        phoneView = view;
        activeConversationKey = null;
        renderPage();
    }

    function updatePhoneSwitcher() {
        if (!phoneWindow) return;

        phoneWindow.querySelectorAll('.cps-phone-switch').forEach(button => {
            const isActive = button.dataset.view === phoneView;

            button.classList.toggle('cps-active', isActive);
            button.setAttribute('aria-pressed', String(isActive));

            button.style.background = isActive
                ? 'var(--SmartThemeQuoteColor, #8b75b5)'
                : 'var(--SmartThemeBlurTintColor, rgba(128,128,128,0.12))';

            button.style.color = isActive
                ? '#ffffff'
                : 'var(--SmartThemeBodyColor, inherit)';

            button.style.opacity = isActive ? '1' : '0.75';
        });

        const greeting = phoneWindow.querySelector('.cps-greeting');

        if (greeting) {
            greeting.textContent = phoneView === 'user'
                ? 'YOUR PHONE'
                : 'CHARACTER PHONE · VIEW ONLY';
        }
    }

    // =========================================
    // Navigation and Rendering
    // =========================================

    function switchTab(tab) {
        if (!Object.hasOwn(TABS, tab)) return;

        activeTab = tab;
        renderPage();
    }

    function renderPage() {
        if (!phoneWindow) return;

        const title = phoneWindow.querySelector('.cps-page-title');
        const content = phoneWindow.querySelector('.cps-content');
        const currentChat = phoneWindow.querySelector('.cps-current-chat');

        title.textContent = activeTab === 'messages' && activeConversationKey
            ? getCurrentChatName()
            : TABS[activeTab].label;

        currentChat.textContent = getCurrentChatName();

        updatePhoneSwitcher();

        phoneWindow.querySelectorAll('.cps-nav-button').forEach(button => {
            button.classList.toggle(
                'cps-active',
                button.dataset.tab === activeTab
            );
        });

        if (activeTab === 'messages') {
            if (phoneView === 'character') {
                renderCharacterMessages(content);
            } else if (activeConversationKey) {
                renderConversation(content);
            } else {
                renderMessagesPage(content);
            }
        } else if (activeTab === 'calls') {
            renderCallsPage(content);
        } else if (activeTab === 'contacts') {
            renderContactsPage(content);
        }
    }

    function renderEmptyState(container, iconText, headingText, descriptionText) {
        container.replaceChildren();

        const emptyState = document.createElement('div');
        emptyState.className = 'cps-empty-state';

        const icon = document.createElement('div');
        icon.className = 'cps-empty-icon';
        icon.textContent = iconText;

        const heading = document.createElement('h3');
        heading.textContent = headingText;

        const description = document.createElement('p');
        description.textContent = descriptionText;

        emptyState.append(icon, heading, description);
        container.appendChild(emptyState);
    }

    // =========================================
    // Private Messages - Conversation List
    // =========================================

    function renderMessagesPage(container) {
        container.replaceChildren();

        const character = getCurrentCharacter();
        const key = getConversationKey();

        if (!character || !key) {
            renderEmptyState(
                container,
                '✉',
                'ยังไม่มีแชต',
                'เลือกแชตตัวละครแบบ 1:1 ก่อน จึงจะเริ่มใช้ข้อความส่วนตัวได้'
            );
            return;
        }

        const messages = getConversation(key);
        const lastMessage = messages[messages.length - 1];

        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'cps-conversation-card';

        const avatar = document.createElement('div');
        avatar.className = 'cps-contact-avatar';
        avatar.textContent = (character.name || '?').charAt(0).toUpperCase();

        const info = document.createElement('div');
        info.className = 'cps-contact-info';

        const name = document.createElement('div');
        name.className = 'cps-contact-name';
        name.textContent = character.name || 'ตัวละคร';

        const preview = document.createElement('div');
        preview.className = 'cps-conversation-preview';
        preview.textContent = lastMessage
            ? lastMessage.text
            : 'เริ่มบทสนทนา';

        info.append(name, preview);
        card.append(avatar, info);

        card.addEventListener('click', () => {
            openConversation(key);
        });

        container.appendChild(card);

        const hint = document.createElement('p');
        hint.className = 'cps-contacts-note';
        hint.textContent =
            'ห้องสนทนานี้เป็นพื้นที่แยกจากแชตหลัก ข้อความจะไม่ถูกส่งเข้าแชตหลักโดยตรง';

        container.appendChild(hint);
    }

    function renderCharacterMessages(container) {
        renderEmptyState(
            container,
            '◉',
            'Character Phone',
            'ข้อความของตัวละครจะแสดงที่นี่ในโหมดดูอย่างเดียว เมื่อระบบมีข้อมูลมือถือของตัวละคร'
        );
    }

    function openConversation(key) {
        if (phoneView !== 'user') return;

        activeConversationKey = key;

        const messages = getConversation(key);

        // Mark incoming messages as read only when the conversation is opened.
        messages.forEach(message => {
            if (message.sender === 'character') {
                message.status = 'Read';
            }
        });

        saveMessages();
        renderPage();
    }

    // =========================================
    // Private Messages - Conversation Thread
    // =========================================

    function renderConversation(container) {
        container.replaceChildren();

        const key = activeConversationKey;
        const messages = getConversation(key);

        if (!key || !messages) {
            activeConversationKey = null;
            renderMessagesPage(container);
            return;
        }

        const toolbar = document.createElement('div');
        toolbar.className = 'cps-chat-toolbar';

        const backButton = document.createElement('button');
        backButton.type = 'button';
        backButton.className = 'cps-chat-back';
        backButton.textContent = '← กลับ';
        backButton.addEventListener('click', () => {
            activeConversationKey = null;
            renderPage();
        });

        const contactName = document.createElement('strong');
        contactName.textContent = getCurrentChatName();

        toolbar.append(backButton, contactName);

        const thread = document.createElement('div');
        thread.className = 'cps-message-thread';

        messages.forEach(message => {
            const row = document.createElement('div');
            row.className = `cps-message-row ${
                message.sender === 'user' ? 'cps-message-outgoing' : 'cps-message-incoming'
            }`;

            const bubble = document.createElement('div');
            bubble.className = 'cps-message-bubble';
            bubble.textContent = message.text;

            row.appendChild(bubble);

            const meta = document.createElement('div');
            meta.className = 'cps-message-meta';

            const time = new Date(message.timestamp).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
            });

            meta.textContent = message.sender === 'user'
                ? `${time} · ${message.status || 'Sent'}`
                : time;

            row.appendChild(meta);
            thread.appendChild(row);
        });

        if (generatingReplies.has(key)) {
            const loading = document.createElement('div');
            loading.className = 'cps-generating-indicator';
            loading.textContent = `${getCurrentChatName()} กำลังพิมพ์…`;
            thread.appendChild(loading);
        }

        const composer = document.createElement('form');
        composer.className = 'cps-message-composer';

        const input = document.createElement('textarea');
        input.className = 'cps-message-input';
        input.placeholder = 'พิมพ์ข้อความ…';
        input.rows = 1;
        input.maxLength = 4000;
        input.disabled = generatingReplies.has(key);

        const sendButton = document.createElement('button');
        sendButton.type = 'submit';
        sendButton.className = 'cps-message-send';
        sendButton.textContent = 'ส่ง';
        sendButton.disabled = generatingReplies.has(key);

        composer.append(input, sendButton);

        composer.addEventListener('submit', event => {
            event.preventDefault();

            const text = input.value.trim();
            if (!text || generatingReplies.has(key)) return;

            sendPrivateMessage(key, text);
        });

        container.append(toolbar, thread, composer);

        thread.scrollTop = thread.scrollHeight;
    }

    async function sendPrivateMessage(key, text) {
        if (phoneView !== 'user') return;
        if (!key || generatingReplies.has(key)) return;

        const messages = getConversation(key);
        if (!messages) return;

        messages.push(createMessage('user', text, 'Delivered'));
        saveMessages();
        renderPage();

        await generateCharacterReply(key);
    }

    // =========================================
    // Private Messages - AI Reply
    // =========================================

    async function generateCharacterReply(key) {
        const context = getContext();

        if (!context || typeof context.generateQuietPrompt !== 'function') {
            showGenerationError(key, 'ไม่พบระบบสร้างข้อความของ SillyTavern');
            return;
        }

        const character = getCurrentCharacter();

        if (!character || key !== getConversationKey()) {
            showGenerationError(key, 'ไม่พบตัวละครที่เชื่อมกับห้องสนทนานี้');
            return;
        }

        const characterName = character.name || 'Character';
        const messages = getConversation(key);

        if (!messages?.length) return;

        generatingReplies.add(key);
        renderPage();

        const transcript = messages.slice(-20).map(message => {
            const speaker = message.sender === 'user' ? 'User' : characterName;
            return `${speaker}: ${message.text}`;
        }).join('\n');

        const quietPrompt = `
You are generating a private phone message from the character "${characterName}".

This is a separate 1-to-1 private message conversation.
Reply as the character, using the character information and personality
available in the current SillyTavern context.

PRIVATE MESSAGE HISTORY:
${transcript}

STRICT RULES:
- Output only the exact message the character sends.
- Do not write narration, actions, thoughts, stage directions, or scene descriptions.
- Do not write the user's dialogue or actions.
- Do not mention prompts, AI, roleplay instructions, or this system.
- Keep the reply natural and appropriate to the character's personality.
- Do not invent that the character has read, seen, or done something unless
  it is established in the conversation.
- Reply as a private message, not as a continuation of the main chat.
- Keep the response reasonably concise.

Write the character's next private message now.
        `.trim();

        try {
            const result = await context.generateQuietPrompt({ quietPrompt });

            let reply = typeof result === 'string'
                ? result
                : result?.text || result?.content || '';

            reply = String(reply)
                .replace(/^\s+|\s+$/g, '')
                .replace(/^["“]|["”]$/g, '')
                .trim();

            if (!reply) {
                throw new Error('The model returned an empty message.');
            }

            // Prevent accidental oversized responses.
            reply = reply.slice(0, 8000);

            const currentMessages = getConversation(key);

            currentMessages.push(
                createMessage('character', reply, 'Delivered')
            );

            saveMessages();

        } catch (error) {
            console.error(`[${MODULE_NAME}] Private message generation failed.`, error);

            const currentMessages = getConversation(key);

            currentMessages.push(
                createMessage(
                    'system',
                    'ไม่สามารถสร้างข้อความตอบกลับได้ ตรวจสอบการเชื่อมต่อ API แล้วลองส่งข้อความใหม่',
                    'Error'
                )
            );

            saveMessages();

        } finally {
            generatingReplies.delete(key);

            if (
                phoneWindow &&
                phoneWindow.classList.contains('cps-visible') &&
                phoneView === 'user' &&
                activeTab === 'messages' &&
                activeConversationKey === key
            ) {
                renderPage();
            }
        }
    }

    function showGenerationError(key, message) {
        const messages = getConversation(key);
        if (!messages) return;

        messages.push(createMessage('system', message, 'Error'));
        saveMessages();
        renderPage();
    }

    // =========================================
    // Calls
    // =========================================

    function renderCallsPage(container) {
        if (phoneView === 'character') {
            renderEmptyState(
                container,
                '◉',
                'Character Phone',
                'ประวัติการโทรของตัวละครจะแสดงที่นี่ในโหมดดูอย่างเดียว'
            );
            return;
        }

        renderEmptyState(
            container,
            '☎',
            'ประวัติการโทร',
            'ระบบโทรศัพท์ยังอยู่ระหว่างพัฒนา'
        );
    }

    // =========================================
    // Contacts
    // =========================================

    function renderContactsPage(container) {
        container.replaceChildren();

        if (phoneView === 'character') {
            renderEmptyState(
                container,
                '◉',
                'Character Contacts',
                'รายชื่อผู้ติดต่อของตัวละครจะแสดงที่นี่ในโหมดดูอย่างเดียว เมื่อมีข้อมูลพร้อมใช้งาน'
            );
            return;
        }

        const character = getCurrentCharacter();

        if (!character) {
            renderEmptyState(
                container,
                '♙',
                'ยังไม่มีรายชื่อ',
                'เลือกแชตตัวละครแบบ 1:1 ก่อน'
            );
            return;
        }

        const key = getConversationKey();
        const messages = getConversation(key);

        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'cps-contact-card cps-contact-card-button';

        const avatar = document.createElement('div');
        avatar.className = 'cps-contact-avatar';
        avatar.textContent = (character.name || '?').charAt(0).toUpperCase();

        const info = document.createElement('div');
        info.className = 'cps-contact-info';

        const name = document.createElement('div');
        name.className = 'cps-contact-name';
        name.textContent = character.name || 'ตัวละคร';

        const identity = document.createElement('div');
        identity.className = 'cps-contact-status';
        identity.textContent = 'รู้จักกัน · ตัวละครในแชตปัจจุบัน';

        const access = document.createElement('div');
        access.className = 'cps-contact-access';
        access.textContent = messages.length
            ? 'มีประวัติข้อความส่วนตัว'
            : 'ยังไม่มีประวัติข้อความ';

        info.append(name, identity, access);
        card.append(avatar, info);

        card.addEventListener('click', () => {
            activeTab = 'messages';
            openConversation(key);
        });

        container.appendChild(card);

        const note = document.createElement('p');
        note.className = 'cps-contacts-note';
        note.textContent =
            'การรู้จักกันไม่ได้หมายความว่ามีเบอร์โทรหรือบัญชีติดต่อกันโดยอัตโนมัติ';

        container.appendChild(note);
    }

    // =========================================
    // Clock
    // =========================================

    function updateClock() {
        if (!phoneWindow) return;

        const clock = phoneWindow.querySelector('.cps-clock');
        if (!clock) return;

        clock.textContent = new Date().toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
        });
    }

    // =========================================
    // Window Dragging
    // =========================================

    function setupDragging() {
        const header = phoneWindow.querySelector('.cps-header');

        header.addEventListener('pointerdown', event => {
            if (event.target.closest('button')) return;

            const rect = phoneWindow.getBoundingClientRect();

            dragState = {
                startX: event.clientX,
                startY: event.clientY,
                left: rect.left,
                top: rect.top,
            };

            header.setPointerCapture(event.pointerId);
        });

        header.addEventListener('pointermove', event => {
            if (!dragState) return;

            const left = Math.max(
                0,
                Math.min(
                    window.innerWidth - phoneWindow.offsetWidth,
                    dragState.left + event.clientX - dragState.startX
                )
            );

            const top = Math.max(
                0,
                Math.min(
                    window.innerHeight - 60,
                    dragState.top + event.clientY - dragState.startY
                )
            );

            phoneWindow.style.left = `${left}px`;
            phoneWindow.style.top = `${top}px`;
            phoneWindow.style.right = 'auto';
            phoneWindow.style.bottom = 'auto';
        });

        const stopDragging = () => {
            if (!dragState) return;

            dragState = null;
            saveWindowPosition();
        };

        header.addEventListener('pointerup', stopDragging);
        header.addEventListener('pointercancel', stopDragging);
    }

    // =========================================
    // Window Resizing
    // =========================================

    function setupResizing() {
        const handle = phoneWindow.querySelector('.cps-resize-handle');

        let resizing = false;
        let startX = 0;
        let startY = 0;
        let startWidth = 0;
        let startHeight = 0;

        handle.addEventListener('pointerdown', event => {
            event.preventDefault();

            resizing = true;
            startX = event.clientX;
            startY = event.clientY;
            startWidth = phoneWindow.offsetWidth;
            startHeight = phoneWindow.offsetHeight;

            handle.setPointerCapture(event.pointerId);
        });

        handle.addEventListener('pointermove', event => {
            if (!resizing) return;

            const width = Math.max(
                280,
                Math.min(
                    window.innerWidth,
                    startWidth + event.clientX - startX
                )
            );

            const height = Math.max(
                400,
                Math.min(
                    window.innerHeight,
                    startHeight + event.clientY - startY
                )
            );

            phoneWindow.style.width = `${width}px`;
            phoneWindow.style.height = `${height}px`;
        });

        const stopResizing = () => {
            if (!resizing) return;

            resizing = false;
            saveWindowPosition();
        };

        handle.addEventListener('pointerup', stopResizing);
        handle.addEventListener('pointercancel', stopResizing);
    }

    // =========================================
    // Save / Restore Window Position
    // =========================================

    function saveWindowPosition() {
        if (!phoneWindow) return;

        const rect = phoneWindow.getBoundingClientRect();

        try {
            localStorage.setItem(
                `${EXTENSION_ID}-position`,
                JSON.stringify({
                    left: rect.left,
                    top: rect.top,
                    width: rect.width,
                    height: rect.height,
                })
            );
        } catch (error) {
            console.warn(`[${MODULE_NAME}] Cannot save window position.`, error);
        }
    }

    function restoreWindowPosition() {
        if (!phoneWindow) return;

        try {
            const saved = localStorage.getItem(`${EXTENSION_ID}-position`);
            if (!saved) return;

            const position = JSON.parse(saved);

            if (
                typeof position.left !== 'number' ||
                typeof position.top !== 'number' ||
                typeof position.width !== 'number' ||
                typeof position.height !== 'number'
            ) return;

            phoneWindow.style.left = `${Math.max(
                0,
                Math.min(position.left, window.innerWidth - 100)
            )}px`;

            phoneWindow.style.top = `${Math.max(
                0,
                Math.min(position.top, window.innerHeight - 100)
            )}px`;

            phoneWindow.style.width = `${Math.max(280, position.width)}px`;
            phoneWindow.style.height = `${Math.max(400, position.height)}px`;

            phoneWindow.style.right = 'auto';
            phoneWindow.style.bottom = 'auto';
        } catch (error) {
            console.warn(`[${MODULE_NAME}] Cannot restore window position.`, error);
        }
    }

    // =========================================
    // SillyTavern Events
    // =========================================

    function handleChatChanged() {
        activeConversationKey = null;

        if (phoneWindow) {
            renderPage();
        }
    }

    function initialize() {
        if (document.getElementById(`${EXTENSION_ID}-launcher`)) return;

        if (!getContext()) {
            console.error(`[${MODULE_NAME}] SillyTavern context is unavailable.`);
            return;
        }

        createLauncher();

        const context = getContext();

        if (context.eventSource && context.event_types?.CHAT_CHANGED) {
            context.eventSource.on(
                context.event_types.CHAT_CHANGED,
                handleChatChanged
            );
        }

        console.log(`[${MODULE_NAME}] Extension initialized.`);
    }

    function waitForSillyTavern() {
        if (window.SillyTavern?.getContext) {
            initialize();
            return;
        }

        setTimeout(waitForSillyTavern, 500);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', waitForSillyTavern, {
            once: true,
        });
    } else {
        waitForSillyTavern();
    }
})();
