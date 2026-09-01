import { Injectable, signal } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { API_BASE } from './env';

export interface Participant {
  id: string;
  name: string;
  connected: boolean;
  hasEstimate: boolean;
  estimate: string | null;
}

export interface RoomState {
  id: string;
  name: string;
  creatorId: string;
  revealed: boolean;
  deck: string[];
  participants: Participant[];
}

/**
 * Wraps the single socket connection and the client's identity for whichever
 * room it's currently in. clientId is a per-room-membership id: the server
 * hands one back on create/join and we keep it in sessionStorage so a page
 * refresh reconnects as the same seat instead of a new one.
 */
@Injectable({ providedIn: 'root' })
export class RoomService {
  private socket: Socket | null = null;

  readonly state = signal<RoomState | null>(null);
  readonly connected = signal(false);
  readonly error = signal<string | null>(null);

  async createRoom(roomName: string, creatorName: string): Promise<{ roomId: string; clientId: string }> {
    const res = await fetch(`${API_BASE}/api/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: roomName, creatorName }),
    });
    if (!res.ok) throw new Error('Could not create room');
    const data = await res.json();
    sessionStorage.setItem(`poker:${data.roomId}`, data.clientId);
    return data;
  }

  storedClientId(roomId: string): string | null {
    return sessionStorage.getItem(`poker:${roomId}`);
  }

  connect(roomId: string, name: string): void {
    if (this.socket) this.socket.disconnect();
    this.error.set(null);

    const socket = io(API_BASE, { transports: ['websocket'] });
    this.socket = socket;

    socket.on('connect', () => {
      this.connected.set(true);
      socket.emit(
        'room:join',
        { roomId, clientId: this.storedClientId(roomId), name },
        (res: { ok?: boolean; error?: string; clientId?: string; state?: RoomState }) => {
          if (res?.error) {
            this.error.set(res.error);
            return;
          }
          if (res?.clientId) sessionStorage.setItem(`poker:${roomId}`, res.clientId);
          if (res?.state) this.state.set(res.state);
        },
      );
    });

    socket.on('room:state', (state: RoomState) => this.state.set(state));
    socket.on('disconnect', () => this.connected.set(false));
  }

  submitEstimate(roomId: string, value: string): void {
    const clientId = this.storedClientId(roomId);
    this.socket?.emit('estimate:submit', { roomId, clientId, value });
  }

  clearEstimate(roomId: string): void {
    const clientId = this.storedClientId(roomId);
    this.socket?.emit('estimate:clear', { roomId, clientId });
  }

  reveal(roomId: string): void {
    const clientId = this.storedClientId(roomId);
    this.socket?.emit('room:reveal', { roomId, clientId });
  }

  reset(roomId: string): void {
    const clientId = this.storedClientId(roomId);
    this.socket?.emit('room:reset', { roomId, clientId });
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
  }
}
