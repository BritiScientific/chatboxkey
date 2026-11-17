# QuickRoom — Temporary Group Chat

A real-time group chat built with Node.js, Express and Socket.IO. It requires no login, database, or frontend build process.

## Requirements

- Node.js 18 or newer
- npm
- An internet connection for the Google Font (the app itself does not depend on it)

## Run locally

1. Extract this ZIP.
2. Open the extracted `quick-temp-chat` folder in VS Code.
3. Open Terminal → New Terminal.
4. Run:

   ```bash
   npm install
   npm start
   ```

5. Open **http://localhost:3000** in your browser.
6. Open the same address in another browser/device on the same network to test joining. For another device on your LAN, use your computer's local IP address and port `3000`.

For automatic restart while developing:

```bash
npm run dev
```

## Deploy it live

This is a Node.js web service and needs a host that supports long-lived WebSocket connections. Do not deploy it as a static-only website.

### Deploy on Render

Netlify Drop only hosts static files; it cannot run this app's Socket.IO server. This project includes a `render.yaml` Blueprint configuration for Render, which runs the Node.js server and supports WebSockets.

1. Push the contents of this project folder (the folder containing `package.json`, `server.js`, `public/`, and `render.yaml`) to a GitHub repository.
2. In Render, choose **New → Blueprint**, connect the repository, and deploy the `render.yaml` configuration.
3. Open the HTTPS URL Render gives you. Create a room and share its code or link with friends.

The free service may sleep when idle, so the first visit after inactivity can take a little while. Keep a single service instance because rooms are stored in memory.

## How the strict destroy rule works

- The server keeps rooms, participants, messages and image data only in process memory.
- If any participant emits Leave / End Room, or their Socket.IO connection disconnects (including closing the tab), the server destroys the entire room.
- All connected participants are notified and returned to the landing page.
- The room entry, participant map and message array are cleared, and the room code is removed from the active-room map.
- The app intentionally does not implement reconnect grace periods. A network drop ends the room.

## Important operational notes

- This is intentionally ephemeral, not a durable chat service. Restarting/redeploying the server destroys every active room.
- In-memory rooms are local to one Node.js process. Run a single instance with no multi-instance load balancing unless you add a shared coordination layer (which would no longer be purely in-memory per process).
- Images are limited to 5 MB each and are held as in-memory data URLs while the room exists.
- Messages are limited to 2,000 characters.
- Do not use this design for sensitive or regulated information. "Not saved to a database" does not mean traffic is end-to-end encrypted or that hosting/network infrastructure cannot observe traffic.
- The host may retain infrastructure logs. The app itself does not write chat messages or images to disk.
- The strict rule treats any Socket.IO disconnect as a participant leaving. Mobile backgrounding, flaky Wi-Fi, or a brief network interruption can therefore terminate the room.

## Project structure

```text
quick-temp-chat/
├── package.json
├── server.js
├── README.md
└── public/
    ├── index.html
    ├── styles.css
    └── app.js
```
