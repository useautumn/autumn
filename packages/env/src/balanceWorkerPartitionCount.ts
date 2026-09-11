// Staging sizing only: choose and validate the production count before rollout.
// Changing a live topic's count remaps customers and requires a topic/state migration.
export const BALANCE_WORKER_PARTITION_COUNT = 8;

export function getBalanceWorkerPartitionCount({
	runtimeEnv,
}: {
	runtimeEnv: Record<string, string | undefined>;
}): number {
	const configured = runtimeEnv.BALANCE_WORKER_PARTITION_COUNT;
	if (
		configured !== undefined &&
		Number(configured) !== BALANCE_WORKER_PARTITION_COUNT
	) {
		throw new Error(
			`BALANCE_WORKER_PARTITION_COUNT is fixed at ${BALANCE_WORKER_PARTITION_COUNT} for staging; changing it requires a topic/state migration`,
		);
	}
	return BALANCE_WORKER_PARTITION_COUNT;
}
