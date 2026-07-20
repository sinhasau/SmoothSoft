'use client';

import { useEffect } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { API_URL } from './api';

let socket: Socket | null = null;

function getSocket(): Socket {
  if (!socket) {
    socket = io(API_URL, { withCredentials: true, transports: ['websocket', 'polling'] });
  }
  return socket;
}

/** Invalidates the queue board query the instant the server broadcasts a change — no polling. */
export function useLiveQueueSync() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const s = getSocket();
    const onChanged = () => {
      void queryClient.invalidateQueries({ queryKey: ['queue', 'board'] });
      void queryClient.invalidateQueries({ queryKey: ['queue', 'activity'] });
    };
    s.on('queue:changed', onChanged);
    return () => {
      s.off('queue:changed', onChanged);
    };
  }, [queryClient]);
}
