# Wait-time algorithm specification

## 0. Implementation status (read this first)

This document specifies the **full target algorithm** (multi-barber simulation with rolling averages, fatigue buffers, and SLA-aware slotting). The current build uses a **deliberately simpler subset**, confirmed with the business owner:

| Spec section | Full spec | Currently built |
|---|---|---|
| §2 Expected duration | Per-barber rolling average → employee default → location default | **Built, as a median.** Per-barber rolling median over the last 10 plausible completions (min 3 samples), falling back to the location/service default from the **Services** table in Settings. Readings beyond 5x a service's catalog duration are discarded as left-open jobs. A per-client pace factor then adjusts the result — see §2 "Client pace". The `employee_default` tier is still not built. |
| §3–4 Multi-barber simulation | Per-barber timelines, greedy slotting across all eligible barbers, SLA-aware | **Both, side by side.** The customer-facing wait estimate still uses the simple shared running clock (`wait-time.ts`). The staff-facing **Outlook** section on the queue board uses a real per-barber projection (`barber-timeline.ts`): in-progress work anchors each barber's clock, then waiting entries are seated greedily on whichever eligible barber frees up soonest, honoring requested-barber holds, appointment times, and shift ends. Staffing follows **live clock status, not the published roster** — a barber who clocks out drops off the projection and their remaining work resurfaces under "Needs a chair" for staff to reseat by hand, rather than being silently reassigned. |
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
1. If a specific barber is known AND has >=3 completed services of this type:
     base = median(last min(10, count) plausible durations for this barber + service)
2. Else (the "next available" case — this shop's primary path):
     base = pool median = median of the ON-FLOOR barbers' own medians for this service
3. Else if the barber has a manager-set starting default for this service
   (entered once when the profile was created, e.g. a trainee gets 30 min,
   an experienced hire gets 15 min):
     base = employee_default[service]
4. Else:
     base = location_default[service]     (shop_settings, manager-editable per service type)

then, if this client has >=3 timed visits of their own:
     expected = base * client_pace_factor      (see "Client pace" below)
```

A rolling window of the last 10 completed services — easy for a shop owner to reason about ("what's Kim's haircut time based on lately"), and it naturally ages out an early bad day once 10 more cuts have happened. Location defaults exist so a brand-new barber with zero history still produces a sane estimate on day one, and the employee default lets you seed that number based on experience rather than everyone starting from the same shop-wide guess.

**Median, not mean.** Over a 10-sample window a single extreme reading moves a mean by `(outlier - typical) / 10` and stays there for the next ten jobs: one four-hour "forgot to hit Complete" turns a 20-minute average into 42. The median is unmoved by one or two extremes, needs no tuning to stay honest, and makes a low-end guard unnecessary — an accidental complete-immediately click is just another value the middle ignores.

**Outlier bound scales with the service.** A reading is discarded when it exceeds `OUTLIER_MULTIPLE` (5) times the service's own catalog duration, rather than a flat ceiling. 5x lets a 20-minute haircut run to 100 minutes for a genuinely difficult head of hair, while a 10-minute line-up is cut off at 50 — a single absolute cap cannot tell those apart. Past that it is not a slow service, it is a job someone left open. Services with no catalog duration fall back to a 12-hour backstop. Discarded readings never occupy one of the 10 sample slots.

### Client pace

Some clients simply take longer — thick hair, a talkative chair, a child who will not sit still. That is real, repeatable signal, and it is a property of the *client*, not the barber or the service.

It is tracked as a **ratio, not an absolute median**: `median(actual / expected)` across the client's recent timed visits, where `expected` is what the algorithm would have predicted without knowing them. A client is a small sample spread across different services and barbers — someone with three visits might have had a haircut, a beard trim, and a colour, from two barbers — so an absolute per-client-per-service median would almost never reach a usable sample count, whereas "this person runs about 1.3x expected" pools every visit into one number that transfers even to a service they have never had before. Taking the ratio against the barber-aware expectation also keeps it from re-counting how fast the barber is.

Guards, all in `client-pace.ts`:

| Guard | Value | Why |
|---|---|---|
| `MIN_CLIENT_VISITS` | 3 | Below this a client's pace is noise; the factor is not applied at all and a new client is predicted from the service alone. |
| `MIN_FACTOR` / `MAX_FACTOR` | 0.6 / 1.6 | One client can nudge an estimate, never dominate it — the queue behind them pays for an overestimate just as surely as an underestimate, and the live overrun adjustment already covers a visit that runs long. |
| Plausibility bound | shared with above | The same 5x rule, so a forgotten Complete cannot define someone's pace either. |

**"Next available" is the common case, so tier 2 matters most.** A walk-in reaches the estimate with no `assigned_location_staff_id` and no `requested_location_staff_id`, so a per-barber lookup finds nothing. Without a pool median it would drop straight to the static catalog duration and none of the measured history would apply at all on the path the shop actually runs on. The pool median is the median of the on-floor barbers' *own* medians — each barber counted once, since any of them might take the chair, rather than in proportion to how busy they have been — and it moves with the shift, which a catalog number cannot.

**The divisor is the invariant.** `expected` must be the barber's own median wherever one exists, not the catalog duration. `expectedMinutesFor()` in `queue.service.ts` is the single definition, used both as the divisor when measuring a ratio and as the base it is applied to — a ratio measured against barber medians but applied to a catalog duration is a unit mismatch that systematically under-predicts wherever the floor runs slower than the catalog claims. Divide by the catalog instead and the barber's pace also lands inside the client's factor: a client who only ever sees a barber running 26 minutes on a 20-minute cut reads as "30% longer" when they are perfectly average, and the queue then multiplies that against the barber median it already uses — counting the same slowness twice. Every call site that computes a factor (the queue board and the client profile) has to divide by the same thing, or the two numbers disagree.

The client's median service time and this factor are shown on their profile, so staff can see why someone is quoted longer than the service default.

**Cleanup buffer** — every service block reserves the expected duration *plus* a fixed cleanup buffer before the next block can start, so the timeline reflects check-in-to-check-out, not just scissors-on-hair time:

```
block_duration = expected_duration + cleanup_buffer_minutes
```

**Running over — live overrun adjustment:**

```
predicted_end = job_start + expected_duration
overrun       = now − predicted_end
if overrun <= 0:
    projected_end = predicted_end
else:
    projected_end = predicted_end + overrun + catch_up_buffer_minutes
                  # equivalently: now + catch_up_buffer_minutes
```

Once a barber is running past their predicted time, the estimate stops trusting the stale prediction. **The buffer added is how far behind the job actually is, plus a small catch-up cushion** (`catch_up_buffer_minutes`, default 3). A job 8 minutes behind is projected to finish 11 minutes past its original prediction.

**No barber is ever asked how behind they are.** The overrun is measured from `queue_entries.service_started_at`, stamped automatically when staff hit **Start** — an action they already take to begin the service — against the predicted duration. There is no reporting step, and nothing for a barber to do differently.

Why the cushion rather than projecting the end at exactly `now`: a job that has already run over is almost never finishing this exact second. Quoting `now` would be revised upward again moments later, and everyone waiting would watch their estimate ratchet up in a series of small disappointments. The cushion absorbs the tail of the overrun so the number holds still. It applies only to jobs already running over — healthy jobs get no padding, since inflating every chair would inflate the whole board.

> **Superseded:** this replaces the original fixed `overrun_increment_minutes` design. A fixed step was a guess at how much longer the job would take; the elapsed overrun is a measurement, and the cushion covers the remaining uncertainty explicitly rather than by repeated nudging. Implemented in `apps/api/src/queue/overrun.ts`.

**Shop-wide lateness** — `shopOverrunMinutes()` reports how far behind the floor as a whole is running: the **largest single** overrun across in-progress jobs, not the sum or the average. Overruns happen in parallel, so three barbers each 5 minutes behind have put the shop 5 minutes behind, not 15; summing would wildly overstate the delay on a busy floor, and averaging would hide one badly stuck chair behind several on-time ones.

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
| `catch_up_buffer_minutes` | 3 | Cushion added on top of a running-over service's *actual* measured overrun (see §2). Replaces the superseded fixed `overrun_increment_minutes`. Applies only once a job is past its prediction — on-time jobs get no padding. |
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
