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
const dropped = new Set<string>();
export const dropIngressAccounts = ({
	accountIds,
}: {
	accountIds: string[];
}): void => {
	for (const accountId of accountIds) dropped.add(accountId);
};
export const isIngressAccountDropped = ({
	accountId,
}: {
	accountId: string;
}): boolean => dropped.has(accountId);
export const getIngressRoute = ({
	accountId,
}: {
	accountId: string;
}): string | undefined => routes.get(accountId);
export const ingressRouteCount = (): number => routes.size;

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
export const clearShardRoutesForRun = ({ runId }: { runId: string }): void => {
	for (const [shard, route] of shardRoutes) {
		if (route.runId === runId) shardRoutes.delete(shard);
	}
};
