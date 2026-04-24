import { ADMIN_JOB_QUEUE_CONFIG_KEY } from "@/external/aws/s3/adminS3Config.js";
import { registerEdgeConfig } from "@/internal/misc/edgeConfig/edgeConfigRegistry.js";
import { createEdgeConfigStore } from "@/internal/misc/edgeConfig/edgeConfigStore.js";
import {
	type JobQueueConfig,
	JobQueueConfigSchema,
} from "./jobQueueSchemas.js";

export const JOB_QUEUE_IDS = {
	primary: "primary",
	track: "track",
} as const;

export const KNOWN_JOB_QUEUES = [
	{
		id: JOB_QUEUE_IDS.primary,
		label: "Primary Queue",
		description: "Shared SQS queue for standard background jobs.",
		defaultEnabled: true,
	},
	{
		id: JOB_QUEUE_IDS.track,
		label: "Track Replay Queue",
		description: "Dedicated async track replay queue used during fail-open recovery.",
		defaultEnabled: true,
	},
] as const;

const store = createEdgeConfigStore<JobQueueConfig>({
	s3Key: ADMIN_JOB_QUEUE_CONFIG_KEY,
	schema: JobQueueConfigSchema,
	defaultValue: () => ({ queues: {} }),
});

registerEdgeConfig({ store });

export const isJobQueueEnabled = ({
	queue,
	defaultEnabled = true,
}: {
	queue: string;
	defaultEnabled?: boolean;
}) => store.get().queues[queue]?.enabled ?? defaultEnabled;

export const getJobQueueConfigStatus = () => store.getStatus();

export const getJobQueueConfigFromSource = async () => store.readFromSource();

export const updateFullJobQueueConfig = async ({
	config,
}: {
	config: JobQueueConfig;
}) => {
	await store.writeToSource({ config });
};
