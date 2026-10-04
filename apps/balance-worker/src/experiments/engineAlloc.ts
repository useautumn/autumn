import {
	BASELINE_ENGINE_DIET,
	bindEngineDiet,
	type EngineDietFlags,
} from "@autumn/balance-engine";
import { type StagingArm, variant } from "@autumn/edge-config";

/**
 * ATMN-603: under B the engine's track decide runs its lean paths (row changes, the carried-context
 * advance and the request built once, all byte-identical to A); A is the engine as it is. The paths are
 * stateless, so the arm follows the 10 s windows.
 */
export const ENGINE_ALLOC_EXPERIMENT = "engine-alloc";

const LEAN_ENGINE_DIET: EngineDietFlags = Object.freeze({
	rowChanges: true,
	requestOnce: true,
	advanceContext: true,
});

export function engineDietForArm({
	arm,
}: {
	arm: StagingArm;
}): EngineDietFlags {
	return arm === "B" ? LEAN_ENGINE_DIET : BASELINE_ENGINE_DIET;
}

/** Binds the engine to this window's arm; `force` is for tests and local runs, never the environment in production. */
export function bindEngineAllocExperiment({
	force,
}: {
	force?: StagingArm;
} = {}): void {
	bindEngineDiet({
		read: () =>
			engineDietForArm({ arm: force ?? variant(ENGINE_ALLOC_EXPERIMENT) }),
	});
}

/** Dev and test only: `BALANCE_WORKER_ENGINE_ALLOC_ARM=B` runs the lean paths where no staging bucket exists. */
export function forcedEngineAllocArmFromEnv(): StagingArm | undefined {
	if (process.env.NODE_ENV === "production") return undefined;
	const forced = process.env.BALANCE_WORKER_ENGINE_ALLOC_ARM;
	return forced === "A" || forced === "B" ? forced : undefined;
}
