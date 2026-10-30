
(() => {
    'use strict';

    const EXTENSION_ID = 'cps-phone-system';
    const MODULE_NAME = 'CharacterPhoneSystem';

    let phoneWindow = null;
    let launcher = null;
    let activeTab = 'messages';
    let isMinimized = false;
    let dragState = null;

    const TABS = {
        messages: {
            label: 'ข้อความ',
            icon: '✉',
        },
        calls: {
            label: 'โทรศัพท์',
            icon: '☎',
        },
    };

    function getContext() {
        if (!window.SillyTavern?.getContext) {
            return null;
        }

        return window.SillyTavern.getContext();
    }

    function getCurrentChatName() {
        const context = getContext();

        if (!context) return 'ไม่ได้เชื่อมต่อแชต';

        if (context.characterId !== undefined && context.characterId !== null) {
            return context.characters?.[context.characterId]?.name || 'ตัวละคร';
        }

        if (context.groupId) {
            return 'Group Chat';
        }

        return 'ไม่ได้เลือกตัวละคร';
    }

    function createLauncher() {
        if (launcher) return;

        launcher = document.createElement('button');
        launcher.id = `${EXTENSION_ID}-launcher`;
        launcher.className = 'cps-launcher';
        launcher.type = 'button';
        launcher.textContent = '☎';
        launcher.title = 'เปิด Character Phone System';

        launcher.addEventListener('click', togglePhone);

        document.body.appendChild(launcher);
    }

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
                    <button
                        type="button"
                        class="cps-minimize"
                        title="ย่อหน้าต่าง"
                    >−</button>

                    <button
                        type="button"
                        class="cps-close"
                        title="ปิดหน้าต่าง"
                    >×</button>
                </div>
            </header>

            <div class="cps-screen">
                <div class="cps-topbar">
                    <span class="cps-clock">12:00</span>
                    <span class="cps-network">● ● ●</span>
                </div>

                <div class="cps-page">
                    <div class="cps-page-heading">
                        <div>
                            <div class="cps-greeting">CHARACTER PHONE</div>
                            <h2 class="cps-page-title">ข้อความ</h2>
                        </div>

                        <span class="cps-current-chat"></span>
                    </div>

                    <div class="cps-content"></div>
                </div>

                <nav class="cps-navigation">
                    <button
                        type="button"
                        class="cps-nav-button"
                        data-tab="messages"
                    >
                        <span class="cps-nav-icon">✉</span>
                        <span>ข้อความ</span>
                    </button>

                    <button
                        type="button"
                        class="cps-nav-button"
                        data-tab="calls"
                    >
                        <span class="cps-nav-icon">☎</span>
                        <span>โทรศัพท์</span>
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
        }
    }

    function renderMessagesPage(container) {
        container.replaceChildren();

        const emptyState = document.createElement('div');
        emptyState.className = 'cps-empty-state';

        const icon = document.createElement('div');
        icon.className = 'cps-empty-icon';
        icon.textContent = '✉';

        const heading = document.createElement('h3');
        heading.textContent = 'ยังไม่มีข้อความ';

        const description = document.createElement('p');
        description.textContent = 'ข้อความส่วนตัวจะแสดงที่นี่';

        emptyState.append(icon, heading, description);
        container.appendChild(emptyState);
    }

    function renderCallsPage(container) {
        container.replaceChildren();

        const emptyState = document.createElement('div');
        emptyState.className = 'cps-empty-state';

        const icon = document.createElement('div');
        icon.className = 'cps-empty-icon';
        icon.textContent = '☎';

        const heading = document.createElement('h3');
        heading.textContent = 'ประวัติการโทร';

        const description = document.createElement('p');
        description.textContent = 'ยังไม่มีรายการโทรศัพท์';

        emptyState.append(icon, heading, description);
        container.appendChild(emptyState);
    }

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
                Math.min(window.innerWidth, startWidth + event.clientX - startX)
            );

            const height = Math.max(
                400,
                Math.min(window.innerHeight, startHeight + event.clientY - startY)
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
            ) {
                return;
            }

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

    function handleChatChanged() {
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
