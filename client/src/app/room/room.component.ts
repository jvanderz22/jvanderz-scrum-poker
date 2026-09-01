import { Component, computed, effect, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { RoomService } from '../room.service';

@Component({
  selector: 'app-room',
  standalone: true,
  imports: [FormsModule],
  template: `
    @if (needsName()) {
      <div class="gate">
        <div class="gate-card">
          <h1>Join the table</h1>
          <p>You're about to join <strong>{{ roomId }}</strong>. What should the room call you?</p>
          <input
            [(ngModel)]="nameInput"
            name="nameInput"
            placeholder="Your name"
            maxlength="40"
            (keyup.enter)="join()"
            autofocus
          />
          <button class="cta" (click)="join()" [disabled]="!nameInput.trim()">Take a seat</button>
        </div>
      </div>
    } @else {
      <div class="room">
        <header>
          <div>
            <h1>{{ state()?.name || 'Planning session' }}</h1>
            <p class="status">{{ connected() ? 'Live' : 'Reconnecting…' }}</p>
          </div>
          <button class="link-btn" (click)="copyLink()">
            {{ copied() ? 'Link copied' : 'Copy invite link' }}
          </button>
        </header>

        <section class="seats">
          @for (p of orderedParticipants(); track p.id) {
            <div class="seat" [class.me]="p.id === myClientId" [class.disconnected]="!p.connected">
              <div class="face" [class.flipped]="revealed()">
                @if (revealed()) {
                  <span class="value">{{ p.estimate ?? '—' }}</span>
                } @else {
                  <span class="back">{{ p.hasEstimate ? '●' : '' }}</span>
                }
              </div>
              <span class="seat-name">{{ p.name }}{{ p.id === state()?.creatorId ? ' · host' : '' }}</span>
            </div>
          }
        </section>

        @if (isHost()) {
          <div class="host-controls">
            @if (!revealed()) {
              <button class="cta" (click)="reveal()" [disabled]="!anyEstimates()">Reveal estimates</button>
            } @else {
              <button class="cta" (click)="reset()">Start new round</button>
            }
          </div>
        }

        <section class="deck">
          <p class="deck-label">Your estimate</p>
          <div class="cards">
            @for (card of state()?.deck ?? []; track card) {
              <button
                class="deck-card"
                [class.selected]="myEstimate() === card"
                (click)="pick(card)"
                [disabled]="revealed()"
              >
                {{ card }}
              </button>
            }
          </div>
        </section>
      </div>
    }
  `,
  styles: [`
    :host { display: block; min-height: 100vh; background: var(--ink); color: var(--parchment); }

    .gate {
      min-height: 100vh;
      display: flex; align-items: center; justify-content: center;
      padding: 1.5rem;
    }
    .gate-card {
      background: var(--parchment); color: var(--ink);
      border-radius: 12px; padding: 2.5rem;
      max-width: 380px; width: 100%;
      display: flex; flex-direction: column; gap: 1rem;
    }
    .gate-card h1 { font-size: 1.7rem; }
    .gate-card input {
      font-size: 1rem; padding: 0.7rem 0.85rem;
      border: 1px solid rgba(22,35,43,0.25); border-radius: 8px;
    }

    .room { max-width: 960px; margin: 0 auto; padding: 2.5rem 1.5rem 4rem; }

    header {
      display: flex; align-items: flex-start; justify-content: space-between;
      gap: 1rem; margin-bottom: 2.5rem; flex-wrap: wrap;
    }
    header h1 { font-size: 1.8rem; }
    .status { color: var(--parchment-dim); font-size: 0.85rem; margin: 0.25rem 0 0; }

    .link-btn {
      background: transparent; color: var(--parchment);
      border: 1px solid rgba(243,233,214,0.4); border-radius: 8px;
      padding: 0.6rem 1rem; font-size: 0.9rem;
    }
    .link-btn:hover { border-color: var(--gold); color: var(--gold); }

    .seats {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
      gap: 1.25rem;
      margin-bottom: 2rem;
    }
    .seat { display: flex; flex-direction: column; align-items: center; gap: 0.5rem; }
    .seat.disconnected { opacity: 0.4; }

    .face {
      width: 72px; height: 100px;
      border-radius: 10px;
      border: 1px solid rgba(243,233,214,0.3);
      background: linear-gradient(155deg, var(--ink-soft), var(--ink));
      display: flex; align-items: center; justify-content: center;
      font-family: var(--font-display); font-size: 1.6rem;
      transition: transform 0.3s ease, background 0.3s ease;
    }
    .face.flipped { background: var(--parchment); color: var(--ink); }
    .back { color: var(--gold); font-size: 1rem; }
    .seat.me .face { border-color: var(--gold); }
    .seat-name { font-size: 0.85rem; color: var(--parchment-dim); text-align: center; }

    .host-controls { display: flex; justify-content: center; margin-bottom: 2.5rem; }

    .deck-label { color: var(--parchment-dim); font-size: 0.9rem; margin: 0 0 0.75rem; text-align: center; }
    .cards { display: flex; flex-wrap: wrap; gap: 0.6rem; justify-content: center; }
    .deck-card {
      width: 56px; height: 78px;
      border-radius: 8px;
      border: 1px solid rgba(243,233,214,0.35);
      background: var(--ink-soft);
      color: var(--parchment);
      font-family: var(--font-display); font-size: 1.2rem;
      transition: transform 0.15s ease, border-color 0.15s ease, background 0.15s ease;
    }
    .deck-card:hover:not(:disabled) { transform: translateY(-4px); border-color: var(--gold); }
    .deck-card.selected { background: var(--red); border-color: var(--red); }
    .deck-card:disabled { opacity: 0.5; }

    .cta {
      background: var(--red); color: var(--parchment); border: none;
      border-radius: 8px; padding: 0.85rem 1.6rem; font-size: 1rem; font-weight: 600;
    }
    .cta:disabled { opacity: 0.5; }
  `],
})
export class RoomComponent implements OnInit, OnDestroy {
  roomId = '';
  nameInput = '';
  copied = signal(false);

  state: RoomService['state'];
  connected: RoomService['connected'];
  revealed = computed(() => this.state()?.revealed ?? false);
  anyEstimates = computed(() => (this.state()?.participants ?? []).some((p) => p.hasEstimate));
  // Before reveal, keep join order. After reveal, sort by estimate (deck order, so
  // numbers ascending then ? then ☕, with no-estimate last), breaking ties by name.
  orderedParticipants = computed(() => {
    const s = this.state();
    const participants = s?.participants ?? [];
    if (!s?.revealed) return participants;
    const deck = s.deck ?? [];
    const rank = (estimate: string | null) => {
      const i = estimate == null ? -1 : deck.indexOf(estimate);
      return i === -1 ? Number.POSITIVE_INFINITY : i;
    };
    return [...participants].sort(
      (a, b) => rank(a.estimate) - rank(b.estimate) || a.name.localeCompare(b.name),
    );
  });
  myEstimate = computed(
    () => this.state()?.participants.find((p) => p.id === this.myClientId)?.estimate ?? null,
  );

  needsName = signal(false);
  myClientId: string | null = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private rooms: RoomService,
  ) {
    this.state = this.rooms.state;
    this.connected = this.rooms.connected;

    // If the server reports the room is gone (e.g. deleted mid-session), bail home.
    effect(() => {
      if (this.rooms.error() === 'Room not found') this.goHome();
    });
  }

  async ngOnInit(): Promise<void> {
    this.roomId = this.route.snapshot.paramMap.get('id') || '';

    if (!(await this.rooms.roomExists(this.roomId))) {
      this.goHome();
      return;
    }

    this.myClientId = this.rooms.storedClientId(this.roomId);

    if (this.myClientId) {
      this.rooms.connect(this.roomId, '');
    } else {
      this.needsName.set(true);
    }
  }

  private goHome(): void {
    this.rooms.disconnect();
    this.router.navigate(['/']);
  }

  ngOnDestroy(): void {
    this.rooms.disconnect();
  }

  join(): void {
    if (!this.nameInput.trim()) return;
    this.needsName.set(false);
    this.rooms.connect(this.roomId, this.nameInput.trim());
    // storedClientId is written once the join ack comes back; poll it briefly.
    const check = setInterval(() => {
      const id = this.rooms.storedClientId(this.roomId);
      if (id) {
        this.myClientId = id;
        clearInterval(check);
      }
    }, 100);
  }

  isHost(): boolean {
    return !!this.myClientId && this.myClientId === this.state()?.creatorId;
  }

  pick(card: string): void {
    if (this.myEstimate() === card) {
      this.rooms.clearEstimate(this.roomId);
    } else {
      this.rooms.submitEstimate(this.roomId, card);
    }
  }

  reveal(): void {
    this.rooms.reveal(this.roomId);
  }

  reset(): void {
    this.rooms.reset(this.roomId);
  }

  copyLink(): void {
    navigator.clipboard.writeText(window.location.href).then(() => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 1800);
    });
  }
}
