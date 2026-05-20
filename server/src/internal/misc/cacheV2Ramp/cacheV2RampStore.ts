import { ms } from "@autumn/shared";
import { ADMIN_CACHE_V2_RAMP_CONFIG_KEY } from "@/external/aws/s3/adminS3Config.js";
import { registerEdgeConfig } from "@/internal/misc/edgeConfig/edgeConfigRegistry.js";
import { createEdgeConfigStore } from "@/internal/misc/edgeConfig/edgeConfigStore.js";
import {
	type CacheV2RampConfig,
	CacheV2RampConfigSchema,
	type RampDestination,
} from "./cacheV2RampSchemas.js";

/** Thrown when a write would violate a cache-v2-ramp invariant. Read by admin
 *  handlers and translated to HTTP 400. Acts as a safety net against the race
 *  where a handler validates against its 10s-polled snapshot but the source
 *  state has already moved on. */
export class CacheV2RampInvariantError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "CacheV2RampInvariantError";
	}
}

const store = createEdgeConfigStore<CacheV2RampConfig>({
	s3Key: ADMIN_CACHE_V2_RAMP_CONFIG_KEY,
	schema: CacheV2RampConfigSchema,
	defaultValue: () => ({
		destination: null,
		percent: 0,
		previousPercent: 0,
		changedAt: 0,
		orgs: {},
	}),
	pollIntervalMs: ms.seconds(10),
});

registerEdgeConfig({ store });

const findActiveOrgOverride = (config: CacheV2RampConfig) =>
	Object.entries(config.orgs).find(([, entry]) => entry.percent > 0);

const assertHasDestination = (config: CacheV2RampConfig, action: string) => {
	if (!config.destination) {
		throw new CacheV2RampInvariantError(
			`${action} requires a destination to be configured first`,
		);
	}
};

const assertNoActivePercent = (config: CacheV2RampConfig, action: string) => {
	if (config.percent > 0) {
		throw new CacheV2RampInvariantError(
			`${action} blocked: global percent is ${config.percent}%. Set it to 0 first.`,
		);
	}
	const activeOrg = findActiveOrgOverride(config);
	if (activeOrg) {
		throw new CacheV2RampInvariantError(
			`${action} blocked: org "${activeOrg[0]}" has percent ${activeOrg[1].percent}%. Set it to 0 first.`,
		);
	}
};

export const getCacheV2RampConfig = (): CacheV2RampConfig => store.get();

export const getCacheV2RampStatus = () => store.getStatus();

export const updateCacheV2RampPercent = async ({
	percent,
	orgId,
}: {
	percent: number;
	orgId?: string;
}) => {
	const current = await store.readFromSource();
	const now = Date.now();

	if (percent > 0) {
		assertHasDestination(
			current,
			`Setting ${orgId ? `org "${orgId}" override` : "global percent"} to ${percent}%`,
		);
	}

	if (orgId) {
		const existingOrg = current.orgs[orgId];
		const nextOrgs = {
			...current.orgs,
			[orgId]: {
				percent,
				previousPercent: existingOrg?.percent ?? 0,
				changedAt: now,
			},
		};
		await store.writeToSource({ config: { ...current, orgs: nextOrgs } });
		return;
	}

	await store.writeToSource({
		config: {
			...current,
			percent,
			previousPercent: current.percent,
			changedAt: now,
		},
	});
};

export const removeCacheV2RampOrg = async ({ orgId }: { orgId: string }) => {
	const current = await store.readFromSource();
	if (!current.orgs[orgId]) return;
	const { [orgId]: _removed, ...rest } = current.orgs;
	await store.writeToSource({ config: { ...current, orgs: rest } });
};

/** Write the destination URL + encrypted connection string. Pass null to clear.
 *  Refuses to overwrite OR clear the destination while any percent is non-zero
 *  to avoid mid-ramp surprises (would invalidate the in-pool client / strand
 *  cache entries on the old cluster). */
export const updateCacheV2RampDestination = async ({
	destination,
}: {
	destination: RampDestination | null;
}) => {
	const current = await store.readFromSource();

	if (destination === null) {
		assertNoActivePercent(current, "Clearing destination");
	} else if (current.destination) {
		// Swapping to a new destination while traffic is being routed would
		// strand cache entries on the old cluster and trip the disconnect race.
		assertNoActivePercent(current, "Overwriting destination");
	}

	await store.writeToSource({ config: { ...current, destination } });
};

/** Test-only: override the in-memory config without writing to S3. */
export const _setCacheV2RampConfigForTesting = (
	config: Partial<CacheV2RampConfig>,
) => {
	store._setRuntimeConfigForTesting({
		destination: null,
		percent: 0,
		previousPercent: 0,
		changedAt: 0,
		orgs: {},
		...config,
	});
};
