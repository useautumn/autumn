import type { AutumnContext } from "../../../../honoUtils/HonoEnv.js";
import type {
	ImplicitPrepInstance,
	PrepInstance,
} from "./getImplicitPrepareModules.js";
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

	/** The orchestrator is deliberately blind to result shapes — consumers
	 * re-parse `prepared_state` with their own schema. `module` and `input`
	 * are correlated per union member, so they stay paired as one value. */
	const runInstance = async (
		instance: ImplicitPrepInstance,
	): Promise<unknown> => {
		const { module, input } = instance as PrepInstance;
		const planned = await module.plan({ ctx, scopeId, input });
		if (dryRun) return planned;
		return module.apply({ ctx, scopeId, input, planned });
	};

	for (const instance of modules) {
		const result = await runInstance(instance);
		nextState[instance.key] = result;
		results.push({
			key: instance.key,
			kind: instance.module.kind,
			result,
		});
	}

	return { results, preparedState: nextState };
};
