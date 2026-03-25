import { AsyncLocalStorage } from "node:async_hooks";

type RedisScope = {
	orgId?: string;
};

const redisScope = new AsyncLocalStorage<RedisScope>();

export const runWithRedisScope = async <T>({
	orgId,
	fn,
}: {
	orgId?: string;
	fn: () => Promise<T> | T;
}): Promise<T> => {
	const store = redisScope.getStore();

	if (store) {
		const previousOrgId = store.orgId;
		store.orgId = orgId ?? store.orgId;

		try {
			return await fn();
		} finally {
			store.orgId = previousOrgId;
		}
	}

	return await redisScope.run({ orgId }, fn);
};

export const setRedisScopeOrgId = ({ orgId }: { orgId?: string }) => {
	const store = redisScope.getStore();
	if (!store) return;

	store.orgId = orgId;
};

export const getRedisScopeOrgId = () => redisScope.getStore()?.orgId;
