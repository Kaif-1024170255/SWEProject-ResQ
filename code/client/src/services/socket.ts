import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export interface SocketSubscription {
  unsubscribe: () => void;
}

/**
 * Initializes or updates the Socket.IO connection.
 * If a token is provided, it connects as an authenticated user.
 * If token is omitted/null, it connects as an anonymous listener.
 */
export function connectSocket(token?: string | null): Socket {
  const effectiveToken =
    token !== undefined
      ? token
      : typeof window !== 'undefined'
      ? localStorage.getItem('resq_auth_token')
      : null;

  // If already connected with the identical auth token, preserve connection
  if (socket) {
    const currentToken =
      socket.auth && typeof socket.auth === 'object'
        ? (socket.auth as { token?: string }).token
        : undefined;

    if (currentToken === (effectiveToken || undefined) && socket.connected) {
      return socket;
    }

    // Update credentials and reconnect without wiping registered listeners
    socket.auth = { token: effectiveToken || undefined };
    if (!socket.connected) {
      socket.connect();
    } else {
      socket.disconnect().connect();
    }
    return socket;
  }

  // Connects through current origin (proxied by Vite to port 5000 in dev)
  const socketUrl = window.location.origin;

  socket = io(socketUrl, {
    autoConnect: true,
    transports: ['websocket', 'polling'],
    auth: {
      token: effectiveToken || undefined,
    },
  });

  socket.on('connect', () => {
    console.log(
      `[Socket.IO] Connected. Socket ID: ${socket?.id} (Authenticated: ${Boolean(token)})`
    );
  });

  // Automated two-way telemetry acknowledgement for propagation latency tracking
  socket.onAny((_event: string, ...args: unknown[]) => {
    if (args && args.length > 0 && typeof args[0] === 'object' && args[0] !== null) {
      const payload = args[0] as Record<string, any>;
      if (payload._meta && typeof payload._meta.serverTimestamp === 'number') {
        socket?.emit('telemetry:ack', {
          emitId: payload._meta.emitId,
          serverTimestamp: payload._meta.serverTimestamp,
        });
      }
    }
  });

  socket.on('disconnect', (reason: string) => {
    console.log(`[Socket.IO] Disconnected. Reason: ${reason}`);
  });

  socket.on('connect_error', (err: Error) => {
    console.warn(`[Socket.IO] Connection error: ${err.message}`);
  });

  socket.on('error:permission_denied', (data: { error: string; requestId?: string }) => {
    console.warn(`[Socket.IO] Permission denied by server:`, data);
  });

  return socket;
}

/**
 * Disconnects the current socket connection cleanly.
 */
export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
    console.log('[Socket.IO] Cleanly disconnected by client application.');
  }
}

/**
 * Returns the current active socket instance, if any.
 */
export function getSocket(): Socket | null {
  return socket;
}

/**
 * Subscribes to general public broadcasts (available to all clients, including anonymous).
 */
export function subscribeToPublic<T = unknown>(
  event: string,
  callback: (payload: T) => void
): SocketSubscription {
  if (!socket) {
    connectSocket();
  }

  socket?.on(event, callback as (...args: unknown[]) => void);

  return {
    unsubscribe: () => {
      socket?.off(event, callback as (...args: unknown[]) => void);
    },
  };
}

const requestRoomRefCounts = new Map<string, number>();

/**
 * Subscribes to updates for a specific emergency request channel.
 * (Authenticated users only; triggers 'subscribe:request' on server)
 */
export function subscribeToRequest<T = unknown>(
  requestId: string,
  event: string,
  callback: (payload: T) => void,
  options?: { phone?: string }
): SocketSubscription {
  if (!socket) {
    connectSocket();
  }

  const currentCount = requestRoomRefCounts.get(requestId) || 0;
  if (currentCount === 0 || Boolean(options?.phone)) {
    const payload = options?.phone ? { requestId, phone: options.phone } : requestId;
    socket?.emit(
      'subscribe:request',
      payload,
      (res?: { status: 'ok' | 'error'; error?: string }) => {
        if (res?.status === 'error') {
          console.warn(
            `[Socket.IO] Failed to subscribe to room for request ${requestId}:`,
            res.error
          );
        } else {
          console.log(`[Socket.IO] Successfully subscribed to request room: ${requestId}`);
        }
      }
    );
  }
  requestRoomRefCounts.set(requestId, currentCount + 1);

  socket?.on(event, callback as (...args: unknown[]) => void);

  return {
    unsubscribe: () => {
      socket?.off(event, callback as (...args: unknown[]) => void);
      const remaining = (requestRoomRefCounts.get(requestId) || 1) - 1;
      if (remaining <= 0) {
        requestRoomRefCounts.delete(requestId);
        socket?.emit('unsubscribe:request', requestId);
      } else {
        requestRoomRefCounts.set(requestId, remaining);
      }
    },
  };
}

/**
 * Subscribes to notification:new events sent to the authenticated user.
 */
export function subscribeToNotification<T = unknown>(
  callback: (payload: T) => void
): SocketSubscription {
  if (!socket) {
    connectSocket();
  }

  socket?.on('notification:new', callback as (...args: unknown[]) => void);

  return {
    unsubscribe: () => {
      socket?.off('notification:new', callback as (...args: unknown[]) => void);
    },
  };
}

/**
 * Registers a callback invoked whenever the socket reconnects after a disconnect,
 * allowing UI views to re-fetch state from REST endpoints and resync.
 */
export function onReconnect(callback: () => void): SocketSubscription {
  if (!socket) {
    connectSocket();

  }

  const manager = socket?.io;
  const handler = () => {
    console.log('[Socket.IO] Reconnection event detected. Resyncing application state...');
    callback();
  };

  manager?.on('reconnect', handler);

  return {
    unsubscribe: () => {
      manager?.off('reconnect', handler);
    },
  };
}

