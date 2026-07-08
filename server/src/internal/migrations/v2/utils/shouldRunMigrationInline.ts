// tw-swarm-only fallback: keyless VMs run migrations in-process. Gated on
// TW_WORKER_MODE so a forgotten prod key fails loudly (migrations need Trigger's durable layer).
export const shouldRunMigrationInline = () =>
	process.env.TW_WORKER_MODE === "1" &&
	process.env.NODE_ENV !== "production" &&
	!process.env.TRIGGER_SERVER_SECRET_KEY &&
	!process.env.TRIGGER_SECRET_KEY;
