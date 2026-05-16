import type { AutumnContext } from "../../../../../honoUtils/HonoEnv";

/**
 * Common shape every prepare module implements. `Input` and `Result`
 * are module-specific. The orchestrator wraps the returned `Result` in
 * the loose `{ key, kind, result }` envelope.
 *
 * `scopeId` is the namespace under which deterministic catalog rows
 * are created — `mig_<internal_id>` for migrations, or any other prefix
 * for ad-hoc script invocations.
 */
export type PrepareModule<Input, Result> = {
	kind: string;

	/** Pure planning. No writes. */
	plan: (args: {
		ctx: AutumnContext;
		scopeId: string;
		input: Input;
	}) => Promise<Result>;

	/** Persist the desired set. Idempotent (deterministic IDs). */
	apply: (args: {
		ctx: AutumnContext;
		scopeId: string;
		input: Input;
		planned: Result;
	}) => Promise<Result>;
};
