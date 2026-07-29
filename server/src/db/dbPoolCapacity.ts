import type { Pool } from "pg";
import type { DbCapacityConfig } from "@/internal/misc/dbCapacity/dbCapacityConfigSchemas.js";
import { getDefaultDbCapacityConfig } from "@/internal/misc/dbCapacity/dbCapacityConfigSchemas.js";

export type ManagedDbPoolName = "critical" | "general" | "replica";

type ManagedDbPool = {
	pool: Pool;
	normalMaxUses: number;
	retirementTarget: number | null;
	idleDrainRunning: boolean;
	onRelease: () => void;
	onRemove: () => void;
};

const managedPools = new Map<ManagedDbPoolName, ManagedDbPool>();
let latestConfig = getDefaultDbCapacityConfig({
	isProduction: process.env.NODE_ENV === "production",
});

const getConfiguredMaximum = ({
	config,
	name,
}: {
	config: DbCapacityConfig;
	name: ManagedDbPoolName;
}): number => {
	switch (name) {
		case "critical":
			return config.critical_pool_max;
		case "general":
			return config.general_pool_max;
		case "replica":
			return config.replica_pool_max;
	}
};

const stopRetiringSurplusConnections = ({
	managedPool,
}: {
	managedPool: ManagedDbPool;
}): void => {
	if (managedPool.retirementTarget === null) return;
	managedPool.pool.options.maxUses = managedPool.normalMaxUses;
	managedPool.retirementTarget = null;
};

const stopRetiringWhenAtTarget = ({
	managedPool,
}: {
	managedPool: ManagedDbPool;
}): void => {
	if (
		managedPool.retirementTarget !== null &&
		managedPool.pool.totalCount <= managedPool.retirementTarget
	) {
		stopRetiringSurplusConnections({ managedPool });
	}
};

const drainIdleSurplusConnections = async ({
	managedPool,
}: {
	managedPool: ManagedDbPool;
}): Promise<void> => {
	if (managedPool.idleDrainRunning) return;
	managedPool.idleDrainRunning = true;

	try {
		while (
			managedPool.retirementTarget !== null &&
			managedPool.pool.totalCount > managedPool.retirementTarget &&
			managedPool.pool.idleCount > 0
		) {
			const client = await managedPool.pool.connect();
			if (
				managedPool.retirementTarget === null ||
				managedPool.pool.totalCount <= managedPool.retirementTarget
			) {
				client.release();
				break;
			}
			client.release(true);
		}
	} catch {
		// A concurrent checkout can consume the last idle client before ours.
		// Busy clients are still retired safely by maxUses when they release.
	} finally {
		managedPool.idleDrainRunning = false;
	}
};

const applyMaximumToPool = ({
	name,
	managedPool,
	maximum,
}: {
	name: ManagedDbPoolName;
	managedPool: ManagedDbPool;
	maximum: number;
}): void => {
	managedPool.pool.options.max = maximum;

	if (name === "critical") {
		managedPool.pool.options.min = Math.min(10, maximum);
	}

	if (managedPool.pool.totalCount > maximum) {
		if (managedPool.retirementTarget === null) {
			managedPool.normalMaxUses = managedPool.pool.options.maxUses;
		}
		managedPool.retirementTarget = maximum;
		// pg-pool removes a client when its use count reaches maxUses. Setting
		// this to one only while above the new target drains surplus clients as
		// active queries release them, without interrupting in-flight work.
		managedPool.pool.options.maxUses = 1;
		void drainIdleSurplusConnections({ managedPool });
		return;
	}

	stopRetiringSurplusConnections({ managedPool });
};

export const applyDbCapacityConfig = ({
	config,
}: {
	config: DbCapacityConfig;
}): void => {
	latestConfig = config;

	for (const [name, managedPool] of managedPools) {
		applyMaximumToPool({
			name,
			managedPool,
			maximum: getConfiguredMaximum({ config, name }),
		});
	}
};

export const registerManagedDbPool = ({
	name,
	pool,
}: {
	name: ManagedDbPoolName;
	pool: Pool;
}): void => {
	const existing = managedPools.get(name);
	if (existing) {
		existing.pool.off("release", existing.onRelease);
		existing.pool.off("remove", existing.onRemove);
	}

	const managedPool: ManagedDbPool = {
		pool,
		normalMaxUses: pool.options.maxUses,
		retirementTarget: null,
		idleDrainRunning: false,
		onRelease: () => undefined,
		onRemove: () => undefined,
	};
	managedPool.onRelease = () => {
		stopRetiringWhenAtTarget({ managedPool });
	};
	managedPool.onRemove = () => {
		stopRetiringWhenAtTarget({ managedPool });
	};

	pool.on("release", managedPool.onRelease);
	pool.on("remove", managedPool.onRemove);
	managedPools.set(name, managedPool);

	applyMaximumToPool({
		name,
		managedPool,
		maximum: getConfiguredMaximum({ config: latestConfig, name }),
	});
};

export const _resetManagedDbPoolsForTesting = (): void => {
	for (const managedPool of managedPools.values()) {
		managedPool.pool.off("release", managedPool.onRelease);
		managedPool.pool.off("remove", managedPool.onRemove);
		stopRetiringSurplusConnections({ managedPool });
	}
	managedPools.clear();
	latestConfig = getDefaultDbCapacityConfig({
		isProduction: process.env.NODE_ENV === "production",
	});
};
