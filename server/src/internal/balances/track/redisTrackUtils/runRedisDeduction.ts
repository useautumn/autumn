import type { AutumnContext } from "../../../../honoUtils/HonoEnv.js";
import { getCachedApiCustomer } from "../../../customers/cusUtils/apiCusCacheUtils/getCachedApiCustomer.js";
import { globalEventBatchingManager } from "../eventUtils/EventBatchingManager.js";
import { globalSyncBatchingManager } from "../syncUtils/SyncBatchingManager.js";
import { constructEvent, type EventInfo } from "../trackUtils/eventUtils.js";
import { globalBatchingManager } from "./BatchingManager.js";

interface FeatureDeduction {
	feature: {
		id: string;
		[key: string]: any;
	};
	deduction: number;
}

interface RunRedisDeductionParams {
	ctx: AutumnContext;
	customerId: string;
	entityId?: string;
	featureDeductions: FeatureDeduction[];
	overageBehavior: "cap" | "reject";
	skipEvent?: boolean;
	eventInfo?: EventInfo;
}

interface DeductionResult {
	success: boolean;
	error?: string;
	internalCustomerId?: string;
	internalEntityId?: string;
}

/**
 * Executes deductions against cached customer data in Redis
 * Uses batching manager to efficiently process multiple deductions
 */
export const runRedisDeduction = async ({
	ctx,
	customerId,
	entityId,
	featureDeductions,
	overageBehavior,
	skipEvent = false,
	eventInfo,
}: RunRedisDeductionParams): Promise<DeductionResult> => {
	const { org, env } = ctx;

	// Ensure customer is in cache
	const { apiCustomer: cachedCustomer } = await getCachedApiCustomer({
		ctx,
		customerId,
	});

	// Map feature deductions to the format expected by batching manager
	const mappedDeductions = featureDeductions.map(({ feature, deduction }) => ({
		featureId: feature.id,
		amount: deduction,
	}));

	const result = await globalBatchingManager.deduct({
		customerId,
		featureDeductions: mappedDeductions,
		orgId: org.id,
		env,
		entityId,
		overageBehavior,
	});

	if (!result.success) {
		ctx.logger.info(
			`Track failed: ${result.error} for customer: ${customerId}`,
		);
	}

	// Fallback to PostgreSQL for continuous_use + overage features
	if (!result.success && result.error === "REQUIRES_POSTGRES_TRACKING") {
		throw new Error(result.error);
	}

	// Redis deduction successful: queue sync jobs and event insertion
	if (result.success) {
		for (const deduction of featureDeductions) {
			globalSyncBatchingManager.addSyncPair({
				customerId: customerId,
				featureId: deduction.feature.id,
				orgId: org.id,
				env,
				entityId: entityId,
			});
		}

		// Queue event insertion (skip if skip_event is true)
		if (!skipEvent && cachedCustomer?.autumn_id && eventInfo) {
			globalEventBatchingManager.addEvent(
				constructEvent({
					ctx,
					eventInfo: eventInfo,
					internalCustomerId: cachedCustomer?.autumn_id,

					internalEntityId:
						cachedCustomer?.entities?.find((entity) => entity.id === entityId)
							?.autumn_id ?? undefined,

					customerId: customerId,
					entityId: entityId,
				}),
			);
		}
	}

	// const after = await getCachedApiCustomer({
	// 	ctx,
	// 	customerId,
	// });

	// console.log("Credits after track:", {
	// 	balance: after?.features?.credits?.balance,
	// 	monthlyBalance: after?.features?.credits?.breakdown?.[0]?.balance,
	// 	lifetimeBalance: after?.features?.credits?.breakdown?.[1]?.balance,
	// });

	return {
		success: result.success,
		error: result.error,
	};
};
