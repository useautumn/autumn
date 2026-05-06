import type { Migration } from "@autumn/shared";
import type { AutumnContext } from "../../../../../honoUtils/HonoEnv";

/**
 * Common shape every prepare module implements. `Input` and `Result`
 * are module-specific (see `modules/<kind>/types.ts`). The orchestrator
 * wraps the returned `Result` in the loose `{ key, kind, result }`
 * envelope before persistence / response.
 */
export type PrepareModule<Input, Result> = {
	kind: string;

	/** Pure planning. No writes. */
	plan: (args: {
		ctx: AutumnContext;
		migration: Migration;
		input: Input;
	}) => Promise<Result>;

	/** Persist the desired set. Idempotent (deterministic IDs). */
	apply: (args: {
		ctx: AutumnContext;
		migration: Migration;
		input: Input;
		planned: Result;
	}) => Promise<Result>;
};
