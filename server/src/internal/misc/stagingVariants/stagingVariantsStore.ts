import { hostname } from "node:os";
import {
	bindStagingVariants,
	type EdgeConfigLogger,
	type StagingVariantsConfig,
	stagingVariantsEdgeConfig,
} from "@autumn/edge-config";
import { isStagingEnv } from "@autumn/env";
import {
	getAwsTaskArn,
	resolveAwsTaskIdentity,
} from "@/external/aws/ecs/awsTaskIdentity.js";
import { createEdgeConfigStore } from "@/internal/misc/edgeConfig/edgeConfigStore.js";

const store = createEdgeConfigStore<StagingVariantsConfig>({
	s3Key: stagingVariantsEdgeConfig.key,
	schema: stagingVariantsEdgeConfig.schema,
	defaultValue: stagingVariantsEdgeConfig.defaultValue,
	pollIntervalMs: stagingVariantsEdgeConfig.pollIntervalMs,
	// A blip must not switch a running experiment off mid-rung.
	retainOnError: true,
});

/** Staging only: elsewhere nothing is bound, so `variant()` is always A and nothing polls. */
export const startStagingVariants = async ({
	logger,
}: {
	logger?: EdgeConfigLogger;
}) => {
	if (!isStagingEnv({ runtimeEnv: process.env })) return;
	await resolveAwsTaskIdentity();
	bindStagingVariants({
		read: store.get,
		identity: getAwsTaskArn() ?? hostname(),
	});
	await store.startPolling({ logger });
};

export const stopStagingVariants = () => store.stopPolling();
