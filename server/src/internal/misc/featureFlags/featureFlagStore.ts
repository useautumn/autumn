import { ADMIN_FEATURE_FLAGS_CONFIG_KEY } from "@/external/aws/s3/adminS3Config.js";
import { registerEdgeConfig } from "@/internal/misc/edgeConfig/edgeConfigRegistry.js";
import { createEdgeConfigStore } from "@/internal/misc/edgeConfig/edgeConfigStore.js";
import {
	type FeatureFlagConfig,
	FeatureFlagConfigSchema,
} from "./featureFlagSchemas.js";

const store = createEdgeConfigStore<FeatureFlagConfig>({
	s3Key: ADMIN_FEATURE_FLAGS_CONFIG_KEY,
	schema: FeatureFlagConfigSchema,
	defaultValue: () => FeatureFlagConfigSchema.parse({}),
});

registerEdgeConfig({ store });

export const getRuntimeFeatureFlagStatus = () => store.getStatus();

export const getRuntimeFeatureFlags = (): FeatureFlagConfig => store.get();

/** Check a single boolean flag by dot-path. Fail-open (false) if path missing. */
export const getRuntimeFeatureFlag = ({ path }: { path: string }): boolean => {
	const config = store.get();
	const value = path.split(".").reduce<unknown>((node, key) => {
		if (node !== null && typeof node === "object" && key in (node as object)) {
			return (node as Record<string, unknown>)[key];
		}
		return undefined;
	}, config as unknown);

	return value === true;
};

/** Returns the list of customer IDs with skip-overage override for a given org. */
export const getSkipOverageSubmissionCustomers = ({
	orgId,
}: {
	orgId: string;
}): string[] => {
	const config = store.get();
	return config.skipOverageSubmissionFlags[orgId] ?? [];
};

export const getFeatureFlagConfigFromSource =
	async (): Promise<FeatureFlagConfig> => store.readFromSource();

export const updateFullFeatureFlagConfig = async ({
	config,
}: {
	config: FeatureFlagConfig;
}): Promise<void> => {
	await store.writeToSource({ config });
};

/** Sets in-memory feature flag config without S3. For testing only. */
export const _setFeatureFlagConfigForTesting = ({
	config,
}: {
	config: FeatureFlagConfig;
}): void => {
	store._setRuntimeConfigForTesting(config);
};
