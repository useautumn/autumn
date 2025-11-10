import type { CustomerData, EntityData } from "@autumn/shared";
import type { AutumnContext } from "../../../../honoUtils/HonoEnv.js";
import { getCachedApiCustomer } from "../../../customers/cusUtils/apiCusCacheUtils/getCachedApiCustomer.js";
import { getOrCreateApiCustomer } from "../../../customers/cusUtils/getOrCreateApiCustomer.js";
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
	customerData?: CustomerData;
	entityId?: string;
	entityData?: EntityData;
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
	customerData,
	entityId,
	entityData,
	featureDeductions,
	overageBehavior,
	skipEvent = false,
	eventInfo,
}: RunRedisDeductionParams): Promise<DeductionResult> => {
	const { org, env } = ctx;

	// Ensure customer is in cache
	const { apiCustomer: cachedCustomer } = await getOrCreateApiCustomer({
		ctx,
		customerId,
		customerData,
		entityId,
		entityData,
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
		// Only queue sync pairs for scopes that were actually modified
		// This prevents unnecessary syncs and race conditions
		for (const deduction of featureDeductions) {
			// If customer was changed, queue customer-level sync
			if (result.customerChanged) {
				globalSyncBatchingManager.addSyncPair({
					customerId: customerId,
					featureId: deduction.feature.id,
					orgId: org.id,
					env,
					entityId: undefined, // Customer-level sync
				});
			}

			// For each changed entity, queue entity-level sync
			if (result.changedEntityIds && result.changedEntityIds.length > 0) {
				for (const changedEntityId of result.changedEntityIds) {
					globalSyncBatchingManager.addSyncPair({
						customerId: customerId,
						featureId: deduction.feature.id,
						orgId: org.id,
						env,
						entityId: changedEntityId,
					});
				}
			}
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

	const apiCustomer = await getCachedApiCustomer({
		ctx,
		customerId,
	});

	const msgesFeature = apiCustomer.apiCustomer.features?.messages?.balance;
	console.log(
		`Feature deductions:`,
		featureDeductions.map((d) => ({
			featureId: d.feature.id,
			deduction: d.deduction,
		})),
	);
	console.log(`Post track, messages balance:`, msgesFeature);

	return {
		success: result.success,
		error: result.error,
	};
};
