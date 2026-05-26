// Shared WebSocket utility to allow multiple components to reuse a single connection.
let socket = null;
const listeners = new Set();
let reconnectTimeout = null;

export const getSocket = () => {
    const token = localStorage.getItem('token');
    if (!token) return null;

    if (socket && (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN)) {
        return socket;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/ws?token=${encodeURIComponent(token)}`;

    console.log('🔌 Connecting to shared WebSocket:', wsUrl);
    socket = new WebSocket(wsUrl);

    socket.onopen = () => {
        console.log('✅ Shared WebSocket connection opened');
        if (reconnectTimeout) {
            clearTimeout(reconnectTimeout);
            reconnectTimeout = null;
        }
    };

    socket.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            listeners.forEach(listener => listener(data));
        } catch (err) {
            console.error('Error parsing shared WebSocket message:', err);
        }
    };

    socket.onclose = (event) => {
        console.log(`🔌 Shared WebSocket connection closed (code: ${event.code}).`);
        socket = null;
        
        // Attempt to reconnect if token is still present
        if (localStorage.getItem('token') && !reconnectTimeout) {
            reconnectTimeout = setTimeout(() => {
                reconnectTimeout = null;
                getSocket();
            }, 3000);
        }
    };

    socket.onerror = (err) => {
        console.error('❌ Shared WebSocket error:', err);
    };

    return socket;
};

export const addSocketListener = (listener) => {
    listeners.add(listener);
    getSocket(); // Ensure connected
    return () => {
        listeners.delete(listener);
    };
};

export const sendSocketMessage = (msg) => {
    const ws = getSocket();
    if (!ws) return false;

    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
        return true;
    }

    // If socket is connecting, wait and try sending
    const checkInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(msg));
            clearInterval(checkInterval);
        } else if (ws.readyState === WebSocket.CLOSED) {
            clearInterval(checkInterval);
        }
    }, 100);

    return false;
};

export const closeSocket = () => {
    if (socket) {
        socket.close();
        socket = null;
    }
    if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
    }
};
