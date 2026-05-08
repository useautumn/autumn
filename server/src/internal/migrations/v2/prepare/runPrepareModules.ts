import type { AutumnContext } from "../../../../honoUtils/HonoEnv.js";
import type { ImplicitPrepInstance } from "./inferImplicitPrep.js";
import type { PreparedState, PrepareModuleResult } from "./types/index.js";

/**
 * Pure orchestrator. Walks a list of prep module instances under a
 * given `scope_id`, runs plan → apply per module (apply skipped on
 * dry-run), threads `prepared_state` through. No DB reads/writes
 * outside what the modules themselves do — script-callable.
 */
export const runPrepareModules = async ({
	ctx,
	scope_id,
	modules,
	dry_run,
	prior_state = {},
}: {
	ctx: AutumnContext;
	scope_id: string;
	modules: ImplicitPrepInstance[];
	dry_run: boolean;
	prior_state?: PreparedState;
}): Promise<{
	results: PrepareModuleResult[];
	prepared_state: PreparedState;
}> => {
	const results: PrepareModuleResult[] = [];
	const next_state: PreparedState = { ...prior_state };

	for (const { key, module, input } of modules) {
		const planned = await module.plan({ ctx, scope_id, input });
		const result = dry_run
			? planned
			: await module.apply({ ctx, scope_id, input, planned });
		if (!dry_run) next_state[key] = result;
		results.push({ key, kind: module.kind, result });
	}

	return { results, prepared_state: next_state };
};
