import type { AppEnv } from "@autumn/shared";
import { logger } from "better-auth";
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

type GenerateFeatureDisplayPayload = {
	featureId: string;
	orgId: string;
	env: AppEnv;
};

type VerifyCacheConsistencyPayload = {
	customerId: string;
	orgId: string;
	env: AppEnv;
	source: string;
	newCustomerProductId: string;
	previousFullCustomer: string;
};

export type GrantCheckoutRewardPayload = {
	orgId: string;
	env: AppEnv;
	customerId: string;
	productId: string;
	stripeSubscriptionId?: string;
};

export type BatchResetCusEntsPayload = {
	orgId: string;
	env: string;
	resets: {
		internalCustomerId: string;
		customerId: string;
		cusEntIds: string[];
	}[];
};

export type AutoTopUpPayload = {
	orgId: string;
	env: AppEnv;
	customerId: string;
	featureId: string;
};
export type StoreInvoiceLineItemsPayload = {
	orgId: string;
	env: AppEnv;
	stripeInvoiceId: string;
	autumnInvoiceId: string;
	/** LineItem[] for matching Stripe line items back to Autumn billing context */
	billingLineItems?: unknown[];
	/** When true, only update Stripe-authoritative fields (amounts, quantities) and preserve Autumn metadata */
	reconcileOnly?: boolean;
};

export type StoreDeferredInvoiceLineItemsPayload = {
	orgId: string;
	env: AppEnv;
	/** Stripe InvoiceItem[] from createStripeInvoiceItems for ProrateNextCycle deferred charges */
	deferredStripeInvoiceItems: unknown[];
	/** LineItem[] (chargeImmediately=false) for matching to Stripe invoice items */
	billingLineItems: unknown[];
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

	grantCheckoutReward: {
		jobName: JobName.GrantCheckoutReward,
		runner: "sqs",
	} as WorkflowConfig<GrantCheckoutRewardPayload>,

	batchResetCusEnts: {
		jobName: JobName.BatchResetCusEnts,
		runner: "sqs",
	} as WorkflowConfig<BatchResetCusEntsPayload>,

	autoTopUp: {
		jobName: JobName.AutoTopUp,
		runner: "sqs",
	} as WorkflowConfig<AutoTopUpPayload>,

	storeInvoiceLineItems: {
		jobName: JobName.StoreInvoiceLineItems,
		runner: "sqs",
	} as WorkflowConfig<StoreInvoiceLineItemsPayload>,

	storeDeferredInvoiceLineItems: {
		jobName: JobName.StoreDeferredInvoiceLineItems,
		runner: "sqs",
	} as WorkflowConfig<StoreDeferredInvoiceLineItemsPayload>,
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
		try {
			await addTaskToQueue({
				jobName: config.jobName,
				payload: payload,
				delayMs: options?.delayMs,
			});
		} catch (error) {
			logger.error(`Failed to trigger workflow ${name}: ${error}`);
		}
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

	triggerGrantCheckoutReward: (
		payload: GrantCheckoutRewardPayload,
		options?: TriggerOptions,
	) => triggerWorkflow({ name: "grantCheckoutReward", payload, options }),

	triggerBatchResetCusEnts: (
		payload: BatchResetCusEntsPayload,
		options?: TriggerOptions,
	) => triggerWorkflow({ name: "batchResetCusEnts", payload, options }),

	triggerAutoTopUp: (payload: AutoTopUpPayload, options?: TriggerOptions) =>
		triggerWorkflow({ name: "autoTopUp", payload, options }),
	triggerStoreInvoiceLineItems: (
		payload: StoreInvoiceLineItemsPayload,
		options?: TriggerOptions,
	) => triggerWorkflow({ name: "storeInvoiceLineItems", payload, options }),

	triggerStoreDeferredInvoiceLineItems: (
		payload: StoreDeferredInvoiceLineItemsPayload,
		options?: TriggerOptions,
	) =>
		triggerWorkflow({
			name: "storeDeferredInvoiceLineItems",
			payload,
			options,
		}),
};
