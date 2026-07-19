# Wait-time algorithm specification

## 0. Implementation status (read this first)

This document specifies the **full target algorithm** (multi-barber simulation with rolling averages, fatigue buffers, and SLA-aware slotting). The current build uses a **deliberately simpler subset**, confirmed with the business owner:

| Spec section | Full spec | Currently built |
|---|---|---|
| §2 Expected duration | Per-barber rolling average → employee default → location default | **Location/service default only** (`Haircut` 20 min, `Beard trim` 12 min, `Haircut + beard trim` 30 min), now sourced from the **Services** table in Settings rather than hardcoded |
| §3–4 Multi-barber simulation | Per-barber timelines, greedy slotting across all eligible barbers, SLA-aware | **Simple running total** — one shared clock starting at the real current time, incremented by each waiting person's own service duration, in queue order. Does not model which specific barber is busy vs. free. |
| §5 Range display | 90–115% band | **Not yet implemented** — wait times currently display as a single `~` estimate, not a range |
| §6 Recalc triggers | Full list | Implemented for the events that affect the simple model (queue order, service defaults, real-time clock); barber-status-based recalculation not yet meaningful since barber availability isn't modeled |
| §9 Configurables | Full table | All fields now live in **Settings → Queue & wait-time settings**, editable by the manager, but only `location_default[service_type]` (via the Services table) actually feeds the current calculation. The rest (`cleanup_buffer_minutes`, `overrun_increment_minutes`, `long_shift_*`, `appointment_max_wait_minutes`, etc.) are captured and stored but **not yet wired into any calculation** — they're staged for when the full simulation is built. |

**New in this round — barber scheduling now feeds appointments correctly:**
- Each barber has a `schedule` (weekly working days + shift start/end), editable in **Settings → Barber roster & schedules**.
- Store-wide `storeHours` (per-day open/closed + hours) is also manager-editable in Settings.
- The appointment and reschedule barber pickers now filter to barbers who are (a) scheduled to work that specific weekday and (b) within their shift hours and (c) within store hours for that day — **not** whether they're currently clocked in. Clocked-in status still gates the **walk-in** barber picker, since that's a same-day, right-now decision.

**Recommendation:** build the full multi-barber simulation (§3–4) once volume/accuracy demands it — the simple running total will visibly under- or over-estimate whenever barbers have uneven current workloads. See the Live Queue PRD for a proposed trigger for when to prioritize this.

## 1. Data model recap

```
barbers
  id, name
  status: off | available | busy | break        (busy is system-derived only, never manual)
  shift: { scheduled_start, scheduled_end, actual_clock_in, actual_clock_out }
  rolling_avg: { [service_type]: minutes }        one value per service type this barber performs

queue_entries
  id, name/phone, service_type
  status: waiting | proposed | in_service | completed | no_show | cancelled
  requested_barber: "Any available" | barber_id
  assigned_barber: barber_id | null
  check_in_time, check_in_method: self | phone | staff | appointment
  is_appointment, appointment_time
  party_id (nullable — display grouping only, never affects scheduling)
  original_waiting_index (captured at Start, used for "return to original position")
  estimated_start, actual_start, actual_end

shop_settings
  buffer_low_pct (default 0.90), buffer_high_pct (default 1.15)
  preference_weighting_enabled (default off for v1)
  preference_tolerance_minutes (default 10)
  allow_decline (default off for v1)
  decline_window_seconds (default 60)
```

## 2. Expected duration (how long a service is predicted to take)

**Resolution order, per barber + service type:**

```
1. If the barber has ≥1 completed service of this type:
     expected = mean(last min(10, count) completed durations for this barber + service)
2. Else if the barber has a manager-set starting default for this service
   (entered once when the profile was created, e.g. a trainee gets 30 min,
   an experienced hire gets 15 min):
     expected = employee_default[service]
3. Else:
     expected = location_default[service]     (shop_settings, manager-editable per service type)
```

This is a simple moving average over the last 10 completed services, not a smoothed running average — easy for a shop owner to reason about ("what's Kim's haircut time based on lately"), and it naturally ages out an early bad day once 10 more cuts have happened. Location defaults exist so a brand-new barber with zero history still produces a sane estimate on day one, and the employee default lets you seed that number based on experience rather than everyone starting from the same shop-wide guess.

**Cleanup buffer** — every service block reserves the expected duration *plus* a fixed cleanup buffer before the next block can start, so the timeline reflects check-in-to-check-out, not just scissors-on-hair time:

```
block_duration = expected_duration + cleanup_buffer_minutes
```

**Running over — live overrun adjustment:**

```
elapsed = now − job_start
if elapsed <= expected_duration:
    projected_end = job_start + expected_duration + cleanup_buffer_minutes
else:
    projected_end = now + overrun_increment_minutes
```

Once a barber is visibly running past their own predicted time, the estimate stops trusting the stale prediction and instead nudges forward by `overrun_increment_minutes` every time it's recalculated — so everyone waiting behind them sees their estimate creep up in small steps as the overrun continues, rather than a frozen number that's obviously wrong or a wild one-time guess.

**Long-shift fatigue buffer** — barbers slow down late in a long shift. Once a barber's elapsed shift time passes `long_shift_threshold_hours`, add `long_shift_extra_minutes` to their expected duration for each subsequent service:

```
if (now − actual_clock_in) > long_shift_threshold_hours:
    expected_duration += long_shift_extra_minutes
```

## 3. Building each barber's timeline (run fresh on every estimate — never cached)

For every barber with `status != off`, construct an ordered list of time blocks:

1. **Current job** (if `busy`): `[now, current_job_start + rolling_avg(current_service)]`
2. **Confirmed appointments**, in time order: `[appointment_time, appointment_time + rolling_avg(service)]`
3. Everything between/after those blocks is **open time** a walk-in can fill.

A barber's "next free" time is the end of their last known block, chained forward — if their current cut ends at 2:15 but they have a 3:00 appointment, there's a 45-minute open gap that walk-ins fill first, in check-in order.

Barbers on `break` or `off` are excluded from the pool entirely.

**Appointment SLA (protecting appointment times):** appointments aren't just another block — the shop's promise is that an appointment holder won't wait more than `appointment_max_wait_minutes` past their scheduled time. When slotting a walk-in into a barber's open gaps, the algorithm checks: would this assignment push that barber's actual availability for the appointment past `appointment_time + appointment_max_wait_minutes`? If yes, skip assigning that walk-in to this barber (route to another eligible barber, or leave them in the "any available" pool) rather than silently breaking the SLA. If *no* barber can honor the SLA (e.g. everyone's already backed up), flag the appointment as at-risk so staff see it before the customer does.

## 9. Configurables (shop-level, manager-editable)

| Setting | Default | Effect |
|---|---|---|
| `location_default[service_type]` | Haircut 20 min, beard trim 12 min, haircut + beard 30 min | Fallback expected duration when a barber has no history and no employee default |
| `employee_default[barber][service_type]` | Set once at profile creation, optional | Overrides the location default for that barber until real data (10 services) takes over |
| `cleanup_buffer_minutes` | 3 | Added after every service block before the next can start |
| `overrun_increment_minutes` | 5 | How far a running-over service's projected end gets pushed forward each recalculation |
| `long_shift_threshold_hours` | 5 | Elapsed shift time after which the fatigue buffer kicks in |
| `long_shift_extra_minutes` | 5 | Extra time added per service once a barber is past the fatigue threshold |
| `max_break_minutes` | 30 | If a barber's break exceeds this, their chip gets a visual warning — doesn't auto-change their status, just flags it for staff |
| `appointment_max_wait_minutes` | 10 | Maximum the algorithm will let an appointment holder's actual start slip past their scheduled time before flagging it at-risk |
| `buffer_low_pct` / `buffer_high_pct` | 90% / 115% | Displayed range around the point estimate (unchanged from section 5) |

## 4. Estimating a new arrival's wait

**Specific barber requested** — wait = that barber's next open slot at or after now, honoring their existing blocks and anyone already ahead of this client specifically for them.

**"Next available"** (renamed from "Any available" to match shipped UI copy) — greedy multi-server simulation:
1. Take every eligible barber's current "next free" time.
2. Walk the *existing* waiting list in current order. For each person ahead who is also "next available," tentatively assign them to whichever eligible barber frees up soonest, and advance that barber's "next free" time by the rolling average for that person's service.
3. People with a specific requested barber don't consume other barbers' capacity — they only advance their own requested barber's timeline.
4. The new arrival's estimate = the earliest remaining "next free" time once step 2 is exhausted.

This is recomputed from live state every time, not stored — it's cheap enough (a handful of barbers, a handful of waiting entries) to just re-run rather than incrementally patch.

## 5. Displaying a range, not a false-precision number

```
low  = round_down(point_estimate × buffer_low_pct, nearest 5 min)
high = round_up(point_estimate × buffer_high_pct, nearest 5 min)
```

Default 90%–115% band. Shown as "~15–25 min" or as clock times ("2:40–2:55 PM") on the confirmation screen. `buffer_low_pct`/`buffer_high_pct` are shop-level settings — a shop that consistently runs over should widen the band rather than the algorithm just being wrong more often.

## 6. What triggers a full recalculation for everyone still waiting

- **Complete** (checkout) — updates that barber's rolling average *and* frees them; both ripple downstream.
- **Start** — converts an estimate into a locked-in actual start time.
- **Manual drag reorder** — the new order becomes ground truth; estimates recompute against it rather than the algorithm quietly overriding a manual choice.
- **Barber status change** — clock-in, break, off, all change the eligible pool.
- **Appointment added or cancelled** — changes fixed blocks on that barber's timeline.

## 7. How the built UI actions map onto this

- **Return to waiting (top / original position)** — re-enters the simulation as an ordinary waiting entry; `assigned_barber` resets to "Any available" and gets re-evaluated fresh, since the original barber isn't guaranteed to still be free.
- **"Returning" badge** — cosmetic only, no effect on the math; it just tells staff this person already had a false start.
- **Party check-ins** — each person is an independent input; no coupling, confirmed in this conversation as the preferred model.
- **Decline flow** (if enabled later) — a `proposed` state sits between `waiting` and `in_service`; declining adds that barber to the entry's `excluded_barbers` list and re-runs the simulation excluding them.

## 8. Worked example

*(This describes the full multi-barber simulation, not the simplified version currently shipped — see §0.)*

3 barbers on shift: Joel (busy, current job ends ~2:15, avg haircut 22 min), Kim (busy, ends ~2:05, avg haircut 18 min), Alex (on break, excluded).

Marcus checks in at 1:58 PM, "next available," haircut. Sam and Priya are already waiting ahead of him, both "next available."

- Kim frees at 2:05 → Sam assigned to Kim → Kim's next-free becomes 2:05 + 18 = 2:23.
- Joel frees at 2:15 → Priya assigned to Joel → Joel's next-free becomes 2:15 + 22 = 2:37.
- Marcus: earliest remaining next-free = Kim at 2:23. Point estimate = 2:23 PM.
- Displayed range: low = 2:23 × 0.90 relative to a ~25 min wait from 1:58 → ~2:20 PM, high ≈ 2:26 PM → shown as "2:20–2:26 PM" (rounded to "~2:20–2:30 PM" at 5-minute granularity).

---

# Open decisions log

| # | Item | Resolution |
|---|---|---|
| 1 | "Return to original position" when the queue has moved | **Resolved** — add a confirmation showing who's currently at that position before committing |
| 2 | Start button when zero barbers are available | **Resolved** — disable the Start button entirely (not the empty-modal message) until someone's free |
| 3 | Personal device mode shows the full waiting queue | **Resolved** — keep as-is |
| 4 | Preference-weighting tolerance & decline-window | **Resolved** — confirmed deferred for MVP, both off by default, defaults documented in section 9 for whenever they're turned on |
| 5 | `buffer_low_pct` / `buffer_high_pct` defaults | **Resolved** — keep tunable, 90%–115% as the shipped default |

## New items from this round (need your call or already resolved)

| # | Item | Status |
|---|---|---|
| 6 | `queue_entries.status` needs distinct `cancelled` vs `no_show` paths reachable from the live queue UI, not just one generic "remove" | Being built into the waiting-row menu now (see below) |
| 7 | A way to mark whether a checked-in customer is physically at the shop ("present") vs. still en route | Being built into the waiting row now (see below) |
| 8 | Default `present` value on check-in — self/phone check-ins default to not-yet-present, guest walk-ins added by staff default to present, appointments default to not-present until day-of | Assumption made below — flag if you want different defaults |
