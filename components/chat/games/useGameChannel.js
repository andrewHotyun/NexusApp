// ========================================
// useGameChannel — Hook for Game Data Channel (React Native)
// ========================================
// Syncs game state between players via WebRTC Data Channel.
// Zero Firebase load — everything is peer-to-peer.

import { useState, useRef, useCallback, useMemo } from 'react';

export default function useGameChannel() {
  const channelRef = useRef(null);
  const [isReady, setIsReady] = useState(false);
  const listenersRef = useRef(new Map()); // type -> Set<callback>

  const initChannel = useCallback((peerConnection, isCaller) => {
    if (!peerConnection) return;
    if (channelRef.current) return; // already initialized

    const setupChannel = (ch) => {
      channelRef.current = ch;

      ch.onopen = () => {
        console.log('[GameChannel] Data channel opened');
        setIsReady(true);
      };

      ch.onclose = () => {
        console.log('[GameChannel] Data channel closed');
        setIsReady(false);
      };

      ch.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          const cbs = listenersRef.current.get(msg.type);
          if (cbs) cbs.forEach(cb => cb(msg));
          const wild = listenersRef.current.get('*');
          if (wild) wild.forEach(cb => cb(msg));
        } catch (e) {
          console.warn('[GameChannel] bad message:', e);
        }
      };
    };

    if (isCaller) {
      try {
        const ch = peerConnection.createDataChannel('games', { ordered: true });
        setupChannel(ch);
      } catch (e) {
        console.warn('[GameChannel] create failed:', e);
      }
    } else {
      const handler = (event) => {
        if (event.channel && event.channel.label === 'games') {
          setupChannel(event.channel);
        }
      };
      peerConnection.addEventListener('datachannel', handler);
    }
  }, []);

  // Send a game message
  const sendMessage = useCallback((msg) => {
    if (channelRef.current && channelRef.current.readyState === 'open') {
      channelRef.current.send(JSON.stringify(msg));
    }
  }, []);

  // Subscribe to a message type (or '*' for all)
  const onMessage = useCallback((type, callback) => {
    if (!listenersRef.current.has(type)) {
      listenersRef.current.set(type, new Set());
    }
    listenersRef.current.get(type).add(callback);

    // Return unsubscribe function
    return () => {
      const set = listenersRef.current.get(type);
      if (set) set.delete(callback);
    };
  }, []);

  const api = useMemo(() => ({
    isReady,
    sendMessage,
    onMessage,
    initChannel
  }), [isReady, sendMessage, onMessage, initChannel]);

  return api;
}
