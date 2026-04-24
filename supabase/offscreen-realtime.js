import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./client.js";
import { getSession } from "./auth.js";

// We'll use the Realtime SDK via a CDN since we're in an offscreen doc (DOM available)
const REALTIME_SDK_URL = "https://cdn.jsdelivr.net/npm/@supabase/realtime-js@2.10.2/dist/main/index.js";

async function initRealtime() {
    const response = await chrome.runtime.sendMessage({ action: "getSession" });
    const session = response?.session;
    if (!session?.access_token) return;

    // Supabase Realtime via REST/WS
    const wsUrl = `${SUPABASE_URL.replace("http", "ws")}/realtime/v1/websocket?apikey=${SUPABASE_ANON_KEY}&Authorization=Bearer ${session.access_token}`;

    const socket = new WebSocket(wsUrl);

    socket.onopen = () => {
        console.log("Realtime socket open");

        // Subscribe to sticky_notes
        const subscribeMsg = {
            topic: "realtime:public:sticky_notes",
            event: "phx_join",
            payload: {
                config: {
                    postgres_changes: [
                        { event: "*", schema: "public", table: "sticky_notes" }
                    ]
                }
            },
            ref: "1"
        };
        socket.send(JSON.stringify(subscribeMsg));

        // Subscribe to stickynotes_notifications
        const subscribeNotifMsg = {
            topic: "realtime:public:stickynotes_notifications",
            event: "phx_join",
            payload: {
                config: {
                    postgres_changes: [
                        { event: "INSERT", schema: "public", table: "stickynotes_notifications" }
                    ]
                }
            },
            ref: "2"
        };
        socket.send(JSON.stringify(subscribeNotifMsg));
    };

    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.event === "postgres_changes") {
            const payload = data.payload;
            console.log("Change detected:", payload);

            if (payload.table === "stickynotes_notifications" && data.topic === "realtime:public:stickynotes_notifications") {
                // Broadcast new notification for background script to handle alerts
                chrome.runtime.sendMessage({
                    action: "newNotification",
                    notification: payload.record
                });
            } else {
                // Broadcast to all extension parts for syncing
                chrome.runtime.sendMessage({
                    action: "supabaseChange",
                    payload: payload
                });
            }
        }

        // Pharos/Phoenix heartbeat
        if (data.event === "phx_reply" && (data.topic === "realtime:public:sticky_notes" || data.topic === "realtime:public:stickynotes_notifications")) {
            // subscribed!
        }
    };

    // Heartbeat every 30s
    setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({
                topic: "phoenix",
                event: "heartbeat",
                payload: {},
                ref: Date.now().toString()
            }));
        }
    }, 30000);
}

initRealtime();
