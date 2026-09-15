// Part of customer placement: a live count change remaps ownership.
// Change only with fresh topics, SQLite and checkpoint namespaces.
export const BALANCE_WORKER_PARTITION_COUNT = 512;

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
			`BALANCE_WORKER_PARTITION_COUNT is fixed at ${BALANCE_WORKER_PARTITION_COUNT}; changing it requires a topic/state migration`,
		);
	}
	return BALANCE_WORKER_PARTITION_COUNT;
}
