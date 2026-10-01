/**
 * In-memory Stripe connected-account → worker URL map served by /ingress/connect.
 * Frozen cross-task API. OWNED BY THE KEYS TASK.
 */
const routes = new Map<string, string>();

export const setIngressRoute = ({
	accountId,
	workerUrl,
}: {
	accountId: string;
	workerUrl: string;
}): void => {
	routes.set(accountId, workerUrl);
};
export const deleteIngressRoute = ({
	accountId,
}: {
	accountId: string;
}): void => {
	routes.delete(accountId);
};
export const getIngressRoute = ({
	accountId,
}: {
	accountId: string;
}): string | undefined => routes.get(accountId);
export const ingressRouteCount = (): number => routes.size;

/** Dedicated-shard fallback: events on that shard's webhook whose account no worker registered. */
const shardRoutes = new Map<string, { workerUrl: string; runId: string }>();

export const setShardRoute = ({
	shard,
	workerUrl,
	runId,
}: {
	shard: string;
	workerUrl: string;
	runId: string;
}): void => {
	shardRoutes.set(shard, { workerUrl, runId });
};
export const getShardRoute = ({
	shard,
}: {
	shard: string;
}): string | undefined => shardRoutes.get(shard)?.workerUrl;
/** Only drops routes the run still owns, so a later run's worker keeps its route. */
export const clearShardRoutesForRun = ({ runId }: { runId: string }): void => {
	for (const [shard, route] of shardRoutes) {
		if (route.runId === runId) shardRoutes.delete(shard);
	}
};
