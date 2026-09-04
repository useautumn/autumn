import type { MiscRedisConfigStore } from "./createMiscRedisConfigStore.js";
import type {
	MiscRedisConfig,
	MiscRedisInstanceName,
} from "./miscRedisConfigSchemas.js";

let miscRedisConfigStore: MiscRedisConfigStore | undefined;

export const configureMiscRedisConfigStore = ({
	store,
}: {
	store: MiscRedisConfigStore;
}): void => {
	if (miscRedisConfigStore && miscRedisConfigStore !== store) {
		throw new Error("Misc Redis config store has already been configured");
	}
	miscRedisConfigStore = store;
};

export const getConfiguredMiscRedisConfigStore = (): MiscRedisConfigStore => {
	if (!miscRedisConfigStore) {
		throw new Error("Misc Redis config store is not configured");
	}
	return miscRedisConfigStore;
};

export const getMiscRedisConfig = (): MiscRedisConfig =>
	getConfiguredMiscRedisConfigStore().get();

export const getMiscRedisConfigStatus = () =>
	getConfiguredMiscRedisConfigStore().getStatus();

export const getActiveMiscRedisInstanceName = (): MiscRedisInstanceName =>
	getMiscRedisConfig().activeInstance;

export const startMiscRedisConfigPolling = (): Promise<void> =>
	getConfiguredMiscRedisConfigStore().startPolling();

export const stopMiscRedisConfigPolling = (): void =>
	getConfiguredMiscRedisConfigStore().stopPolling();

export const _setMiscRedisConfigForTesting = (
	config: Partial<MiscRedisConfig>,
): void => {
	getConfiguredMiscRedisConfigStore()._setRuntimeConfigForTesting({
		activeInstance: "main",
		ramp: null,
		backup: null,
		...config,
	});
};
