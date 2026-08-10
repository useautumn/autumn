/** THE toggle for running Trigger.dev tasks in-process on `bun tw` swarm VMs,
 * which have no Trigger runner. Flip to false once Trigger is wired into tw. */
const RUN_TRIGGER_TASKS_INLINE_IN_TW = true;

/** Local opt-in: Trigger's dev worker runs in their cloud, so a laptop's
 * localhost Redis/Postgres is unreachable from it and the context build fails.
 * Set RUN_TRIGGER_TASKS_INLINE=1 to execute in-process instead. */
const optedInLocally = () =>
	process.env.RUN_TRIGGER_TASKS_INLINE === "1" &&
	process.env.NODE_ENV !== "production";

// Gated on TW_WORKER_MODE so a forgotten prod key fails loudly instead of
// silently dropping tasks off the durable layer.
const inTwSwarm = () =>
	RUN_TRIGGER_TASKS_INLINE_IN_TW &&
	process.env.TW_WORKER_MODE === "1" &&
	process.env.NODE_ENV !== "production" &&
	!process.env.TRIGGER_SERVER_SECRET_KEY &&
	!process.env.TRIGGER_SECRET_KEY;

export const shouldRunTriggerTasksInline = () => optedInLocally() || inTwSwarm();
