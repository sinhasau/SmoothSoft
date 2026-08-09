# PRD — Live Queue & Check-In

**Product:** JJ's Barbers queue management platform (Shortcuts Software competitor)
**Module:** Live Queue, Check-In, and Shop Configuration
**Status:** Built (interactive prototype) — not yet connected to a real backend
**Companion doc:** `wait-time-algorithm-spec.md` (wait-time math in full)

---

## 1. Problem statement

Barbershops running Shortcuts (or a paper/whiteboard system) have three recurring pain points:

1. **Wait-time estimates are guesswork.** Staff eyeball the line and customers get vague answers, which drives walk-outs.
2. **Check-in and status changes are manual and error-prone.** No single source of truth for who's waiting, who's being served, and by whom.
3. **No usable record of what happened.** Can't answer "how long did that actually take," "who cancelled and why," or "how is Kim doing this month" without reconstructing it by memory.

This module solves #1 (partially, see algorithm spec §0) and #2. It lays the groundwork for #3 via the activity log's backend timestamp field, but reporting itself is out of scope here (see the platform PRD).

## 2. Goals

- Give staff a single live board for who's in a chair, who's waiting, and what's next — usable on a shared shop tablet or a barber's personal device.
- Make every state change (check-in, start, complete, cancel, no-show, reassign, reschedule) a two-tap action anchored where the staff member is already looking, not a trip to a separate screen.
- Make mistakes cheap: every destructive or state-changing action is undoable.
- Give the manager a config surface (store hours, services, barber schedules, queue tuning, goals) that actually drives the live board's behavior, instead of hardcoded values.

## 3. Non-goals (this module)

- Customer-facing booking/check-in UI (built separately, not covered here)
- Payments, POS, checkout beyond a free-text charge/tip field
- Reporting/analytics dashboards
- Multi-location support
- Real backend/persistence — this is a front-end prototype with in-memory state

## 4. Users

| User | Device | Primary needs |
|---|---|---|
| Barber (working) | Personal device or shared tablet | See their own chair, start/complete clients, see requested-for-them queue |
| Front desk / any staff | Shared tablet | Check in walk-ins and appointments, manage the whole queue, resolve conflicts |
| Manager/owner | Any device, Settings tab | Configure store hours, services, staff schedules, queue tuning, goals |

## 5. Features

### 5.1 Team status (staff section, visually separated from queue)
- Roster of barbers with live status: `available`, `busy` (system-derived only — set by Start, cleared by Complete, never manually selectable), `break`, `off`.
- "+ clock in" control for off-shift barbers. It lists staff **scheduled today**
  first; everyone else on the roster sits behind a "Not scheduled (n)" button in
  the same menu. The split only applies when somebody **is** scheduled and off
  the floor — on a Sunday, or at a shop that does not keep weekly schedules
  current, the menu is one plain list of everyone. A clock-in menu that opens
  onto no names reads as broken, so the schedule never empties it. Clocking in an unscheduled barber has always been permitted by
  the API — the shop runs on live clock state, and covering on a day off is
  routine — so this is about which case leads, not about restricting the other.
  Staff whose employment status is not `active` are not offered.
  The control stays visible and disabled ("Everyone on the roster is already
  clocked in") rather than disappearing when there is nobody to clock in; a
  control that vanishes reads as a missing feature to whoever is looking for it.
  Covering a shift at a **different** location is not supported yet — that needs
  the multi-location staff assignment described in
  `ARCHITECTURE-data-and-perspectives.md`.
- **Opening the store surfaces staffing problems**, because opening is the moment
  the shop starts accepting walk-ins and an unseatable queue costs a real
  customer their afternoon. The Open store dialog shows:
  - *No barbers are assigned to this location* — the location has an empty
    roster, so nobody can ever be clocked in until staff are added under Staff.
    This previously surfaced only as a greyed-out "+ clock in" button, several
    taps away and after the store was already open.
  - *Nobody is clocked in yet* — the roster is fine, the floor is just empty.
    Routine when opening ahead of the first arrival, so it is a nudge.

  Both **warn and never block**. Opening twenty minutes before the first barber
  arrives is normal, and refusing to open would be worse than the problem.
- Changing status to `break`/`off` while a barber has an active client triggers a **conflict resolution prompt** (check the client out, or reassign to another barber) before the status change applies — prevents silently orphaning an in-progress service.

### 5.2 Now serving
- List of in-chair clients with barber, service, and elapsed indicator.
- **Complete** flow: editable service notes (pre-filled from the Start step), charge, tip. Saves to that client's service history and frees the barber.
- Per-row menu: return to top of waiting list, return to original waiting position (with inline confirmation showing who currently holds that slot), or cancel service outright.

### 5.3 Waiting list
- Drag-and-drop manual reordering; the manual order is treated as ground truth.
- Per-row: presence checkbox ("here" — physically at the shop vs. checked in remotely), estimated time, requested/assigned barber (tap to cycle, shared-device mode only), appointment badge + date badge for non-today appointments.
- **Start** flow: general notes (persistent per client) + service notes (defaulted from last visit) + scrollable service history + barber picker (only shows currently-available barbers). Disabled entirely when no barber is available, rather than opening an empty picker.
- Per-row menu: reschedule (appointments only — date, time, and a barber list filtered by schedule, not clock-in status), cancel, mark no-show.

### 5.4 Intake
- **Walk-in**: phone or guest tab, barber picker limited to currently clocked-in staff, defaults to present.
- **Appointment**: phone or guest tab, date picker (today + next open days, respecting store hours), time picker bounded to store hours, barber picker filtered by that barber's weekly schedule for the selected date/time — not their live clock-in status. Defaults to not-present until check-in day-of.

**Planned enhancement — new-client onboarding at check-in.** Today, an unrecognized phone number just becomes the display string for that queue entry — no actual client record gets created. The intended flow: when the phone number entered doesn't match an existing client, prompt a short intake instead of silently proceeding — name, and where relevant, allergy/patch-test consent for chemical services (see the platform PRD's Legal & Risk module) and referral source. This is the moment a real client profile (platform PRD, CRM module) should be created, not an afterthought bolted onto reporting later. Recognized numbers should skip straight to the existing fast-path.

### 5.5 Activity log
- Every state change is logged with a **date only** in the visible UI; the full date+time is retained as a `fullTimestamp` field as a stand-in for a real backend audit log.
- **Undo** is inline: clicking Undo on an eligible row swaps that row's action area to "Confirm undo" / "Cancel" in place — no separate dialog. Undo restores a full before/after snapshot (or re-queues the client, for checkout-style actions).

### 5.6 Device modes
- **Shared device**: full board, all barbers, all actions available.
- **Personal device**: bound to one barber; shows only their own chair and queue entries requested for/assignable to them; still allows manual reassignment via the owner picker.

### 5.7 Settings (manager configuration)
| Section | Fields |
|---|---|
| Store hours | Per-day open/closed toggle + open/close time |
| Services | Name, default duration, price — add/remove |
| Queue & wait-time settings | Cleanup buffer, overrun increment, long-shift fatigue threshold + extra time, max break length, appointment SLA window, at-risk notify lead time *(captured now, most not yet wired into the calculation — see algorithm spec §0)* |
| Shop-wide goals | Daily revenue/barber, clients/day/barber, tip rate target, chair utilization target |
| Barber roster & schedules | Name, weekly working days, shift hours, default service duration, per-barber revenue/clients-per-day goals — add/remove barbers |

## 6. Interaction principles established during build

- **Every dialog opens next to its trigger**, not in a bottom modal — walk-in/appointment forms drop below their button; the break/off conflict prompt anchors under the specific barber's chip; return-to-original and reschedule swap in place inside the already-open ⋮ menu; undo swaps in place inside its own log row.
- Native form controls (`<select>`, checkboxes) that manage their own state must be excluded from the page's outside-click handler, or the handler tears down and rebuilds the control mid-interaction, closing native dropdowns before the user can choose. (This caused a real bug — see §8.)
- Tall panels (e.g. Start, with notes + history) can render below the visible/scrollable area when triggered from a row near the bottom of a long list, since the container only sizes itself to normal document flow. Mitigated with a reserved bottom-scroll buffer plus an internal `max-height` + scroll on the panel itself; flagged as needing a real floating/portal layer for production.

## 7. Data model (current, in-memory)

```
barber:    { id, name, status, defaultDuration, schedule: {days[], start, end}, goals: {daily_revenue, clients_per_day} }
service:   { id, name, duration, price }
storeHours:{ day, open, start, end }  × 7
queueEntry:{ id, name, service, status, assigned, isAppt, time, apptDate, apptDateLabel, present, originalWaitingIndex, pendingServiceNote, returning }
logEntry:  { id, date, fullTimestamp, text, undone, canUndo, beforeSnap, requeuePayload }
clientHistory: { [clientName]: [{ date, service, note }] }
clientGeneralNotes: { [clientName]: string }
```

## 8. Known bugs fixed during build (for QA regression reference)

- Undo logged as "undoable" without actually capturing a before-snapshot for `cancelWaiting`, `markNoShow`, `returnToTop`, `returnToOriginalActual` — silently no-op'd. Fixed by capturing the snapshot before mutation in all four.
- Clock-in and barber-status `<select>` elements lacked the exclusion class needed to survive the outside-click handler, causing native dropdowns to open and immediately close. Fixed by excluding all self-managing form controls.
- Start panel could render its lower portion (including the barber list) outside the visible/scrollable container when triggered from a row near the bottom of the list. Fixed with a reserved scroll buffer + internal panel scroll, flagged as a prototype-only patch.

## 9. Suggested acceptance criteria for backend integration

- All state transitions in §5.1–5.5 must be atomic and produce a corresponding audit log entry with a true server timestamp.
- Undo must be implemented as a real compensating action (or event-sourced replay), not a client-side JSON snapshot, once multiple devices can be editing the same queue concurrently.
- Barber/service/store-hours settings changes must take effect on the live board without requiring a refresh.

## 10. Open questions

1. When does wait-time accuracy demand upgrading from the simple running total to the full multi-barber simulation in the algorithm spec? Suggested trigger: when the shop regularly runs 3+ barbers concurrently with uneven workloads, or when walk-out rate is being tracked and attributed to bad estimates.
2. Should `present` (physically at shop) have a customer-facing equivalent (e.g. an "I'm here" tap from their phone) rather than only staff-set?
3. Multi-person/party check-ins were discussed in an earlier round as independent `queue_entries` linked by a display-only `party_id` — not yet built into this version's intake forms.
