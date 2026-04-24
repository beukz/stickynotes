import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./client.js";
// session is retrieved via the background service worker (see initRealtime)

async function initRealtime() {
    const response = await chrome.runtime.sendMessage({ action: "getSession" });
    const session = response?.session;

    // Supabase Realtime WebSocket (Phoenix protocol)
    // NOTE: Offscreen docs in extensions enforce CSP 'self', so we avoid external SDK imports.
    const wsBase = SUPABASE_URL.replace(/^http/i, "ws");
    let wsUrl = `${wsBase}/realtime/v1/websocket?apikey=${encodeURIComponent(SUPABASE_ANON_KEY)}&vsn=1.0.0`;
    const socket = new WebSocket(wsUrl);

    const accessToken = session?.access_token || null;

    function joinTopic(topic, ref, postgres_changes) {
        const payload = {
            config: { postgres_changes },
        };
        if (accessToken) payload.access_token = accessToken;
        socket.send(JSON.stringify({ topic, event: "phx_join", payload, ref: String(ref) }));
    }

    socket.onopen = () => {
        console.log("Realtime socket open");
        joinTopic("realtime:public:sticky_notes", 1, [{ event: "*", schema: "public", table: "sticky_notes" }]);
        joinTopic("realtime:public:stickynotes_notifications", 2, [{ event: "INSERT", schema: "public", table: "stickynotes_notifications" }]);
    };

    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.event === "postgres_changes") {
            const payload = data.payload;
            if (!payload) return;

            if (payload.table === "stickynotes_notifications") {
                chrome.runtime.sendMessage({
                    action: "newNotification",
                    notification: payload.record || payload.new || payload,
                });
            } else {
                chrome.runtime.sendMessage({
                    action: "supabaseChange",
                    payload,
                });
            }
        }
    };

    socket.onerror = (e) => {
        console.error("Realtime socket error", e);
    };

    socket.onclose = (e) => {
        console.warn("Realtime socket closed", e?.code, e?.reason);
    };

    // Heartbeat every 25s
    setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({
                topic: "phoenix",
                event: "heartbeat",
                payload: {},
                ref: Date.now().toString()
            }));
        }
    }, 25000);
}

initRealtime();
