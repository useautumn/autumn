import { hostname } from "node:os";
import {
	bindStagingVariants,
	type EdgeConfigLogger,
	type StagingVariantsConfig,
	stagingVariantsEdgeConfig,
	stagingVariantsEnabled,
} from "@autumn/edge-config";
import {
	getAwsTaskArn,
	resolveAwsTaskIdentity,
} from "@/external/aws/ecs/awsTaskIdentity.js";
import { getAdminS3Config } from "@/external/aws/s3/adminS3Config.js";
import { createEdgeConfigStore } from "@/internal/misc/edgeConfig/edgeConfigStore.js";

const store = createEdgeConfigStore<StagingVariantsConfig>({
	s3Key: stagingVariantsEdgeConfig.key,
	schema: stagingVariantsEdgeConfig.schema,
	defaultValue: stagingVariantsEdgeConfig.defaultValue,
	pollIntervalMs: stagingVariantsEdgeConfig.pollIntervalMs,
	// A blip must not switch a running experiment off mid-rung.
	retainOnError: true,
});

/** Only on the staging admin bucket: elsewhere nothing polls or binds, so `variant()` is always A. */
export const startStagingVariants = async ({
	logger,
}: {
	logger?: EdgeConfigLogger;
}) => {
	const { bucket } = getAdminS3Config();
	if (!stagingVariantsEnabled({ bucket })) return;
	await resolveAwsTaskIdentity();
	bindStagingVariants({
		read: store.get,
		identity: getAwsTaskArn() ?? hostname(),
		bucket,
	});
	await store.startPolling({ logger });
};

export const stopStagingVariants = () => store.stopPolling();

export const readStagingVariantsAtBoot = () => store.readFromSource();
