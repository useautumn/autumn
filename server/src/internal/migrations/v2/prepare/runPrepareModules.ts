import type { AutumnContext } from "../../../../honoUtils/HonoEnv.js";
import type { ImplicitPrepInstance } from "./getImplicitPrepareModules.js";
import type { PreparedState, PrepareModuleResult } from "./types/index.js";
import type { PrepareModule } from "./types/prepareModule.js";

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

	const runModule = async <Input, Result>(
		module: PrepareModule<Input, Result>,
		input: Input,
	): Promise<Result> => {
		const planned = await module.plan({ ctx, scopeId, input });
		if (dryRun) return planned;
		return module.apply({ ctx, scopeId, input, planned });
	};

	for (const instance of modules) {
		const { key, module } = instance;
		const result = await (instance.module.kind === "ensure_plan_licenses"
			? runModule(instance.module, instance.input)
			: runModule(instance.module, instance.input));
		nextState[key] = result;
		results.push({ key, kind: module.kind, result });
	}

	return { results, preparedState: nextState };
};
