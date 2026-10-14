const RUN_TRIGGER_TASKS_INLINE_IN_TW = true;

export const shouldRunTriggerTasksInline = () =>
	RUN_TRIGGER_TASKS_INLINE_IN_TW &&
	process.env.TW_WORKER_MODE === "1" &&
	process.env.NODE_ENV !== "production" &&
	!process.env.TRIGGER_SERVER_SECRET_KEY &&
	!process.env.TRIGGER_SECRET_KEY;
