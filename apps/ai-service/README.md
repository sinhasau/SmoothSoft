# apps/ai-service

Not yet scaffolded. Python/FastAPI, deliberately separate from apps/api — see
SYSTEM-ARCHITECTURE-platform.md §5.

Consumes events asynchronously off the job queue, writes results back as new
event types. Never sits in the synchronous request path — an AI failure or
slowdown should never be able to block a checkout or check-in.

Planned features, in the order they're likely to matter: no-show risk scoring
(needs real event history to train against — don't build this until there's
real usage data), smart scheduling assist, review response drafting,
consultation note summarization.
