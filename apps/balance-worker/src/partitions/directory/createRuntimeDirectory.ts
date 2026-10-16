import type { PartitionRuntimeStatus } from "../../runtime/types/partitionRuntimeState.js";
import type { PartitionDirectoryState } from "../types/partitionState.js";
import type {
	PartitionAdmission,
	PartitionDirectory,
	PartitionRoute,
	PartitionRuntimePort,
	PartitionTarget,
} from "../types/partitions.js";

export function createRuntimeDirectory(): PartitionDirectory {
	const state: PartitionDirectoryState = new Map();

	function admit(admission: PartitionAdmission): void {
		const { partition, routeEpoch, runtime } = admission;
		if (!/^(0|[1-9]\d*)$/.test(routeEpoch))
			throw new Error("Invalid ownership route epoch");
		const health = runtime.getHealth();
		if (
			health.partition !== partition ||
			!isServing({ status: health.status }) ||
			health.failureReason !== null
		) {
			throw new Error("Cannot admit an unavailable partition");
		}
		state.set(partition, { routeEpoch, runtime });
	}

	/** A later claim naming this worker for the runtime it already serves is the route callers now hold. */
	function adoptNewerRoute(admission: PartitionAdmission): void {
		const { partition, routeEpoch, runtime } = admission;
		if (!/^(0|[1-9]\d*)$/.test(routeEpoch)) return;
		const admitted = state.get(partition);
		if (!admitted || admitted.runtime !== runtime) return;
		if (BigInt(routeEpoch) <= BigInt(admitted.routeEpoch)) return;
		state.set(partition, { routeEpoch, runtime });
	}

	function withdraw(target: PartitionTarget): void {
		state.delete(target.partition);
	}

	function findOwnedRuntime(
		target: PartitionTarget,
	): PartitionRuntimePort | undefined {
		const entry = state.get(target.partition);
		if (!entry) return undefined;
		const health = entry.runtime.getHealth();
		if (
			!isServing({ status: health.status }) ||
			health.failureReason !== null
		) {
			withdraw(target);
			return undefined;
		}
		return entry.runtime;
	}

	function findRuntime(
		route: PartitionRoute,
	): PartitionRuntimePort | undefined {
		const entry = state.get(route.partition);
		if (!findOwnedRuntime(route) || !entry) return undefined;
		return entry.routeEpoch === route.routeEpoch ? entry.runtime : undefined;
	}

	return { admit, adoptNewerRoute, withdraw, findRuntime, findOwnedRuntime };
}

/** An activating runtime is admitted already: it was named owner, and a command waits at its gate. */
function isServing({ status }: { status: PartitionRuntimeStatus }): boolean {
	return status === "ready" || status === "activating";
}
