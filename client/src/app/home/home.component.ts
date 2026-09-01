import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { RoomService } from '../room.service';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="wrap">
      <section class="pitch">
        <div class="suits" aria-hidden="true">
          <span class="card back">8</span>
          <span class="card back">13</span>
          <span class="card back">?</span>
        </div>
        <h1>Deal the estimates.</h1>
        <p class="sub">
          Start a table, send the link to your team, and let everyone place a
          card face-down. Nobody sees a number until you flip the table.
        </p>
      </section>

      <section class="table-card">
        <h2>Start a session</h2>
        <label>
          Session name
          <input
            [(ngModel)]="sessionName"
            name="sessionName"
            placeholder="Sprint 42 planning"
            maxlength="60"
            (keyup.enter)="create()"
          />
        </label>
        <label>
          Your name
          <input
            [(ngModel)]="hostName"
            name="hostName"
            placeholder="Jamie"
            maxlength="40"
            (keyup.enter)="create()"
          />
        </label>

        @if (error()) {
          <p class="err">{{ error() }}</p>
        }

        <button class="cta" (click)="create()" [disabled]="creating()">
          {{ creating() ? 'Setting the table…' : 'Create room' }}
        </button>
      </section>
    </div>
  `,
  styles: [`
    .wrap {
      min-height: 100vh;
      display: grid;
      grid-template-columns: 1.1fr 0.9fr;
    }
    @media (max-width: 860px) {
      .wrap { grid-template-columns: 1fr; }
    }

    .pitch {
      background: var(--ink);
      padding: 5rem 4rem;
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 1.5rem;
    }
    @media (max-width: 860px) { .pitch { padding: 3rem 1.75rem 1rem; } }

    .suits { display: flex; gap: 0.75rem; }
    .card {
      width: 56px; height: 78px;
      border: 1px solid rgba(243,233,214,0.35);
      border-radius: 8px;
      display: flex; align-items: center; justify-content: center;
      font-family: var(--font-display);
      font-size: 1.4rem;
      color: var(--parchment);
      background: linear-gradient(155deg, var(--ink-soft), var(--ink));
    }
    .card:nth-child(2) { transform: translateY(-8px) rotate(-3deg); }
    .card:nth-child(3) { transform: translateY(4px) rotate(4deg); color: var(--gold); }

    h1 {
      font-size: clamp(2.4rem, 5vw, 3.6rem);
      color: var(--parchment);
      line-height: 1.05;
      max-width: 14ch;
    }
    .sub {
      max-width: 42ch;
      color: var(--parchment-dim);
      font-size: 1.05rem;
      line-height: 1.6;
    }

    .table-card {
      background: var(--parchment);
      color: var(--ink);
      padding: 5rem 4rem;
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 1.1rem;
    }
    @media (max-width: 860px) { .table-card { padding: 2.5rem 1.75rem 4rem; } }

    .table-card h2 {
      font-size: 1.6rem;
      margin-bottom: 0.5rem;
    }

    label {
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
      font-size: 0.9rem;
      color: var(--ink-soft);
    }
    input {
      font-size: 1rem;
      padding: 0.7rem 0.85rem;
      border: 1px solid rgba(22,35,43,0.25);
      border-radius: 8px;
      background: #fff;
      font-family: var(--font-body);
    }

    .cta {
      margin-top: 0.5rem;
      background: var(--red);
      color: var(--parchment);
      border: none;
      border-radius: 8px;
      padding: 0.85rem 1.4rem;
      font-size: 1rem;
      font-weight: 600;
      transition: transform 0.15s ease, background 0.15s ease;
    }
    .cta:hover:not(:disabled) { background: #9c322b; }
    .cta:active:not(:disabled) { transform: scale(0.98); }
    .cta:disabled { opacity: 0.6; cursor: default; }

    .err { color: var(--red); font-size: 0.9rem; margin: 0; }
  `],
})
export class HomeComponent {
  sessionName = '';
  hostName = '';
  creating = signal(false);
  error = signal<string | null>(null);

  constructor(private rooms: RoomService, private router: Router) {}

  async create() {
    if (!this.hostName.trim()) {
      this.error.set('Tell us what to call you.');
      return;
    }
    this.error.set(null);
    this.creating.set(true);
    try {
      const { roomId } = await this.rooms.createRoom(
        this.sessionName.trim() || 'Planning session',
        this.hostName.trim(),
      );
      this.router.navigate(['/room', roomId]);
    } catch (e) {
      this.error.set('Could not reach the server. Is it running?');
    } finally {
      this.creating.set(false);
    }
  }
}
