/** THE toggle for running Trigger.dev tasks in-process on `bun tw` swarm VMs,
 * which have no Trigger runner. Flip to false once Trigger is wired into tw. */
const RUN_TRIGGER_TASKS_INLINE_IN_TW = true;

// Gated on TW_WORKER_MODE so a forgotten prod key fails loudly instead of
// silently dropping tasks off the durable layer.
export const shouldRunTriggerTasksInline = () =>
	RUN_TRIGGER_TASKS_INLINE_IN_TW &&
	process.env.TW_WORKER_MODE === "1" &&
	process.env.NODE_ENV !== "production" &&
	!process.env.TRIGGER_SERVER_SECRET_KEY &&
	!process.env.TRIGGER_SECRET_KEY;
