
# Character Phone System (CPS)

A phone interface extension for SillyTavern roleplay.

Character Phone System adds an interactive phone window to SillyTavern, allowing users to interact with characters through a separate mobile-style interface.

## Features

### Phase 1

- Private Messages (1:1)
- Simulated Phone Calls
- Incoming and Outgoing Call Interfaces
- Persistent Conversation History
- Message Status (Sent / Delivered / Read)
- Activity Summary Bridge

### Interface

- Floating Phone Window
- Draggable Window
- Resizable Window
- Glassmorphism Design
- Separate Messages and Calls Pages
- Persistent Window Position

## Installation

1. Open your SillyTavern installation folder.
2. Navigate to:

   `public/scripts/extensions/third-party/`

3. Clone or download this repository into that directory.

   The resulting folder structure should look like this:

   ```text
   third-party/
   └── Character-Phone-System/
       ├── manifest.json
       ├── index.js
       ├── style.css
       └── README.md
   ```

4. Restart SillyTavern or reload the page.
5. Open the Extensions menu and check whether Character Phone System has loaded.

## Usage

1. Open a character chat.
2. Find the floating phone icon.
3. Click the icon to open the phone interface.
4. Use the bottom navigation to switch between Messages and Calls.

## Project Structure

```text
Character-Phone-System/
├── manifest.json
├── index.js
├── style.css
└── README.md
```

## Development Roadmap

### Phase 1 — Core Phone System

- [x] Floating Phone Interface
- [x] Draggable Window
- [x] Resizable Window
- [x] Messages Interface
- [x] Calls Interface
- [ ] Private Messaging Engine
- [ ] NPC-Initiated Messages
- [ ] Incoming Call Events
- [ ] Outgoing Call System
- [ ] Conversation Persistence
- [ ] Message Status Management
- [ ] Summary Bridge

### Future Development

- NPC-to-NPC Communication
- Advanced Contact Management
- Relationship-Based Communication Rules

## Compatibility

Designed for SillyTavern.

Compatibility with specific SillyTavern versions and APIs must be tested before release.

## License

MIT License
