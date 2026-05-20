import { ms } from "@autumn/shared";
import { ADMIN_DRAGONFLY_RAMP_CONFIG_KEY } from "@/external/aws/s3/adminS3Config.js";
import { registerEdgeConfig } from "@/internal/misc/edgeConfig/edgeConfigRegistry.js";
import { createEdgeConfigStore } from "@/internal/misc/edgeConfig/edgeConfigStore.js";
import {
	type DragonflyRampConfig,
	DragonflyRampConfigSchema,
	type RampDestination,
} from "./dragonflyRampSchemas.js";

const store = createEdgeConfigStore<DragonflyRampConfig>({
	s3Key: ADMIN_DRAGONFLY_RAMP_CONFIG_KEY,
	schema: DragonflyRampConfigSchema,
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

export const getDragonflyRampConfig = (): DragonflyRampConfig => store.get();

export const getDragonflyRampStatus = () => store.getStatus();

export const updateDragonflyRampPercent = async ({
	percent,
	orgId,
}: {
	percent: number;
	orgId?: string;
}) => {
	const current = await store.readFromSource();
	const now = Date.now();

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

export const removeDragonflyRampOrg = async ({ orgId }: { orgId: string }) => {
	const current = await store.readFromSource();
	if (!current.orgs[orgId]) return;
	const { [orgId]: _removed, ...rest } = current.orgs;
	await store.writeToSource({ config: { ...current, orgs: rest } });
};

/** Write the destination URL + encrypted connection string. Pass null to clear. */
export const updateDragonflyRampDestination = async ({
	destination,
}: {
	destination: RampDestination | null;
}) => {
	const current = await store.readFromSource();
	await store.writeToSource({ config: { ...current, destination } });
};

/** Test-only: override the in-memory config without writing to S3. */
export const _setDragonflyRampConfigForTesting = (
	config: Partial<DragonflyRampConfig>,
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
