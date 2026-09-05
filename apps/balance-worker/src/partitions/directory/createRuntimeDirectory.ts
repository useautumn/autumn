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
			health.status !== "ready" ||
			health.failureReason !== null
		) {
			throw new Error("Cannot admit an unavailable partition");
		}
		state.set(partition, { routeEpoch, runtime });
	}

	function withdraw(target: PartitionTarget): void {
		state.delete(target.partition);
	}

	function findRuntime(
		route: PartitionRoute,
	): PartitionRuntimePort | undefined {
		const entry = state.get(route.partition);
		if (!entry) return undefined;
		const health = entry.runtime.getHealth();
		if (health.status !== "ready" || health.failureReason !== null) {
			withdraw({ partition: route.partition });
			return undefined;
		}
		return entry.routeEpoch === route.routeEpoch ? entry.runtime : undefined;
	}

	return { admit, withdraw, findRuntime };
}
