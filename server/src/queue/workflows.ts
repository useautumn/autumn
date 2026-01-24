import type { AppEnv } from "@autumn/shared";
import { JobName } from "./JobName.js";
import { addTaskToQueue, runHatchetWorkflow } from "./queueUtils.js";

// ============ Payload Types ============

export type SendProductsUpdatedPayload = {
	orgId: string;
	env: AppEnv;
	customerId: string;
	customerProductId: string;
	scenario: string;
};

export type GenerateFeatureDisplayPayload = {
	featureId: string;
	orgId: string;
	env: AppEnv;
};

export type VerifyCacheConsistencyPayload = {
	customerId: string;
	orgId: string;
	env: AppEnv;
	source: string;
	newCustomerProductId: string;
	previousFullCustomer: string;
};

// ============ Workflow Registry ============

type WorkflowRunner = "sqs" | "hatchet";

type WorkflowConfig<TPayload> = {
	jobName: JobName;
	runner: WorkflowRunner;
	_payloadType?: TPayload;
};

const workflowRegistry = {
	sendProductsUpdated: {
		jobName: JobName.SendProductsUpdated,
		runner: "sqs",
	} as WorkflowConfig<SendProductsUpdatedPayload>,

	generateFeatureDisplay: {
		jobName: JobName.GenerateFeatureDisplay,
		runner: "sqs",
	} as WorkflowConfig<GenerateFeatureDisplayPayload>,

	verifyCacheConsistency: {
		jobName: JobName.VerifyCacheConsistency,
		runner: "hatchet",
	} as WorkflowConfig<VerifyCacheConsistencyPayload>,
} as const;

// ============ Type Utilities ============

type WorkflowRegistry = typeof workflowRegistry;
type WorkflowName = keyof WorkflowRegistry;

type PayloadFor<T extends WorkflowName> =
	WorkflowRegistry[T] extends WorkflowConfig<infer P> ? P : never;

type TriggerOptions = {
	delayMs?: number;
	metadata?: Record<string, string>;
};

// ============ Generic Trigger Function (internal) ============

const triggerWorkflow = async <T extends WorkflowName>({
	name,
	payload,
	options,
}: {
	name: T;
	payload: PayloadFor<T>;
	options?: TriggerOptions;
}) => {
	const config = workflowRegistry[name];

	if (config.runner === "hatchet") {
		await runHatchetWorkflow({
			workflowName: config.jobName as JobName.VerifyCacheConsistency,
			payload: payload as VerifyCacheConsistencyPayload,
			delayMs: options?.delayMs,
			metadata: options?.metadata,
		});
	} else {
		await addTaskToQueue({
			jobName: config.jobName,
			payload: payload,
			delayMs: options?.delayMs,
		});
	}
};

// ============ Typed Trigger Functions (exported) ============

export const workflows = {
	triggerSendProductsUpdated: (
		payload: SendProductsUpdatedPayload,
		options?: TriggerOptions,
	) => triggerWorkflow({ name: "sendProductsUpdated", payload, options }),

	triggerGenerateFeatureDisplay: (
		payload: GenerateFeatureDisplayPayload,
		options?: TriggerOptions,
	) => triggerWorkflow({ name: "generateFeatureDisplay", payload, options }),

	triggerVerifyCacheConsistency: (
		payload: VerifyCacheConsistencyPayload,
		options?: TriggerOptions,
	) => triggerWorkflow({ name: "verifyCacheConsistency", payload, options }),
};
