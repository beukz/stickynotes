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
        // Subscribe to sticky_notes table
        const subscribeMsg = {
            topic: "realtime:public:sticky_notes",
            event: "phx_join",
            payload: {},
            ref: "1"
        };
        socket.send(JSON.stringify(subscribeMsg));
    };

    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.event === "postgres_changes") {
            const payload = data.payload;
            console.log("Change detected:", payload);
            // Broadcast to all extension parts
            chrome.runtime.sendMessage({
                action: "supabaseChange",
                payload: payload
            });
        }
        
        // Pharos/Phoenix heartbeat
        if (data.event === "phx_reply" && data.topic === "realtime:public:sticky_notes") {
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
