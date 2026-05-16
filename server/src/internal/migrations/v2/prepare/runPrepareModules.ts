import type { AutumnContext } from "../../../../honoUtils/HonoEnv.js";
import type { ImplicitPrepInstance } from "./getImplicitPrepareModules.js";
import type { PreparedState, PrepareModuleResult } from "./types/index.js";

/**
 * Pure orchestrator. Walks a list of prep module instances under a
 * given `scopeId`, runs plan → apply per module (apply skipped on
 * dry-run), threads `preparedState` through. No DB reads/writes
 * outside what the modules themselves do — script-callable.
 */
export const runPrepareModules = async ({
	ctx,
	scopeId,
	modules,
	dryRun,
}: {
	ctx: AutumnContext;
	scopeId: string;
	modules: ImplicitPrepInstance[];
	dryRun: boolean;
}): Promise<{
	results: PrepareModuleResult[];
	preparedState: PreparedState;
}> => {
	const results: PrepareModuleResult[] = [];
	const nextState: PreparedState = {};

	for (const { key, module, input } of modules) {
		const planned = await module.plan({ ctx, scopeId, input });
		const result = dryRun
			? planned
			: await module.apply({ ctx, scopeId, input, planned });
		nextState[key] = result;
		results.push({ key, kind: module.kind, result });
	}

	return { results, preparedState: nextState };
};
