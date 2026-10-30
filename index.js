
(() => {
    'use strict';

    const EXTENSION_ID = 'cps-phone-system';
    const MODULE_NAME = 'CharacterPhoneSystem';

    let phoneWindow = null;
    let launcher = null;
    let activeTab = 'messages';
    let phoneView = 'user';
    let isMinimized = false;
    let dragState = null;

    let launcherDragState = null;
    let launcherWasDragged = false;

    const TABS = {
        messages: { label: 'ข้อความ', icon: '✉' },
        calls: { label: 'โทรศัพท์', icon: '☎' },
        contacts: { label: 'รายชื่อ', icon: '♙' },
    };

    function getContext() {
        if (!window.SillyTavern?.getContext) return null;
        return window.SillyTavern.getContext();
    }

    function getCurrentChatName() {
        const context = getContext();

        if (!context) return 'ไม่ได้เชื่อมต่อแชต';

        if (context.characterId !== undefined && context.characterId !== null) {
            return context.characters?.[context.characterId]?.name || 'ตัวละคร';
        }

        if (context.groupId) return 'Group Chat';

        return 'ไม่ได้เลือกตัวละคร';
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

            const maxLeft = window.innerWidth - launcher.offsetWidth;
            const maxTop = window.innerHeight - launcher.offsetHeight;

            const left = Math.max(
                0,
                Math.min(maxLeft, launcherDragState.left + dx)
            );

            const top = Math.max(
                0,
                Math.min(maxTop, launcherDragState.top + dy)
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
                JSON.stringify({
                    left: rect.left,
                    top: rect.top,
                })
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

            const left = Math.max(
                0,
                Math.min(position.left, window.innerWidth - launcher.offsetWidth)
            );

            const top = Math.max(
                0,
                Math.min(position.top, window.innerHeight - launcher.offsetHeight)
            );

            launcher.style.left = `${left}px`;
            launcher.style.top = `${top}px`;
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
            return;
        }

        closePhone();
    }

    // =========================================
    // Phone View Switching
    // =========================================

    function switchPhoneView(view) {
        if (view !== 'user' && view !== 'character') return;

        phoneView = view;
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
    // Navigation
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

        title.textContent = TABS[activeTab].label;
        currentChat.textContent = getCurrentChatName();

        updatePhoneSwitcher();

        phoneWindow.querySelectorAll('.cps-nav-button').forEach(button => {
            button.classList.toggle(
                'cps-active',
                button.dataset.tab === activeTab
            );
        });

        if (activeTab === 'messages') {
            renderMessagesPage(content);
        } else if (activeTab === 'calls') {
            renderCallsPage(content);
        } else if (activeTab === 'contacts') {
            renderContactsPage(content);
        }
    }

    // =========================================
    // Empty State
    // =========================================

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
    // Messages
    // =========================================

    function renderMessagesPage(container) {
        if (phoneView === 'character') {
            renderEmptyState(
                container,
                '◉',
                'Character Phone',
                'ข้อความของตัวละครจะแสดงที่นี่ในโหมดดูอย่างเดียว เมื่อมีข้อมูลพร้อมใช้งาน'
            );
            return;
        }

        renderEmptyState(
            container,
            '✉',
            'ยังไม่มีข้อความ',
            'ข้อความส่วนตัวของคุณจะแสดงที่นี่'
        );
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
            'ยังไม่มีรายการโทรศัพท์'
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

        const context = getContext();
        const characterName = getCurrentChatName();

        if (
            !context ||
            context.characterId === undefined ||
            context.characterId === null
        ) {
            renderEmptyState(
                container,
                '♙',
                'ยังไม่มีรายชื่อ',
                'เลือกแชตตัวละครก่อน รายชื่อที่รู้จักจะแสดงที่นี่'
            );
            return;
        }

        const contactCard = document.createElement('div');
        contactCard.className = 'cps-contact-card';

        const avatar = document.createElement('div');
        avatar.className = 'cps-contact-avatar';
        avatar.textContent = characterName.charAt(0).toUpperCase() || '?';

        const info = document.createElement('div');
        info.className = 'cps-contact-info';

        const name = document.createElement('div');
        name.className = 'cps-contact-name';
        name.textContent = characterName;

        const identity = document.createElement('div');
        identity.className = 'cps-contact-status';
        identity.textContent = 'รู้จักกัน · ตัวละครในแชตปัจจุบัน';

        const access = document.createElement('div');
        access.className = 'cps-contact-access';
        access.textContent = 'ยังไม่มีข้อมูลช่องทางติดต่อ';

        info.append(name, identity, access);
        contactCard.append(avatar, info);

        container.appendChild(contactCard);

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

        const now = new Date();

        clock.textContent = now.toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
        });
    }

    // =========================================
    // Phone Window Dragging
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

            const deltaX = event.clientX - dragState.startX;
            const deltaY = event.clientY - dragState.startY;

            const maxLeft = window.innerWidth - phoneWindow.offsetWidth;
            const maxTop = window.innerHeight - 60;

            const left = Math.max(
                0,
                Math.min(maxLeft, dragState.left + deltaX)
            );

            const top = Math.max(
                0,
                Math.min(maxTop, dragState.top + deltaY)
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
    // Phone Window Resizing
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
    // Save / Restore Phone Position
    // =========================================

    function saveWindowPosition() {
        if (!phoneWindow) return;

        const rect = phoneWindow.getBoundingClientRect();

        const position = {
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
        };

        try {
            localStorage.setItem(
                `${EXTENSION_ID}-position`,
                JSON.stringify(position)
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
        if (phoneWindow) renderPage();
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
