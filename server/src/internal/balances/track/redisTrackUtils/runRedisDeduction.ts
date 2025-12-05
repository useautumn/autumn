import {
	type ApiBalance,
	ApiBalanceSchema,
	type ApiCustomer,
	InsufficientBalanceError,
	type TrackParams,
	type TrackQuery,
} from "@autumn/shared";
import { currentRegion } from "@/external/redis/initRedis.js";
import { normalizeFromSchema } from "@/utils/cacheUtils/normalizeFromSchema.js";
import type { AutumnContext } from "../../../../honoUtils/HonoEnv.js";
import { tryRedisWrite } from "../../../../utils/cacheUtils/cacheUtils.js";
import { getOrCreateApiCustomer } from "../../../customers/cusUtils/getOrCreateApiCustomer.js";
import { globalEventBatchingManager } from "../eventUtils/EventBatchingManager.js";
import { globalSyncBatchingManager } from "../syncUtils/SyncBatchingManager.js";
import { constructEvent, type EventInfo } from "../trackUtils/eventUtils.js";
import type { FeatureDeduction } from "../trackUtils/getFeatureDeductions.js";
import {
	type DeductionResult,
	globalBatchingManager,
} from "./BatchingManager.js";

type RunRedisDeductionParams = {
	ctx: AutumnContext;
	// customerId: string;
	// customerData?: CustomerData;
	// entityId?: string;
	// entityData?: EntityData;
	query: TrackQuery;
	trackParams: TrackParams;
	featureDeductions: FeatureDeduction[];
	overageBehavior: "cap" | "reject";
	eventInfo?: EventInfo;
};

interface RunRedisDeductionResult {
	fallback: boolean;
	code:
		| "success"
		| "insufficient_balance"
		| "idempotency_key"
		| "allocated_feature"
		| "skip_cache"
		| "redis_write_failed";

	internalCustomerId?: string;
	internalEntityId?: string;
	balances?: Record<string, ApiBalance>; // Object of changed balances keyed by featureId
}

const queueSyncAndEvent = ({
	ctx,
	trackParams,
	featureDeductions,
	eventInfo,
	result,
	apiCustomer,
}: RunRedisDeductionParams & {
	result: DeductionResult;
	apiCustomer: ApiCustomer;
}) => {
	const { customer_id, entity_id } = trackParams;
	const { org, env } = ctx;

	ctx.logger.info(
		`[queueSync] (${customer_id}): customer changed: ${result.customerChanged}, changed entity ids: ${Array.isArray(result.changedEntityIds) ? result.changedEntityIds.join(", ") : "none"}`,
	);

	for (const deduction of featureDeductions) {
		// If customer was changed, queue customer-level sync
		if (result.customerChanged) {
			globalSyncBatchingManager.addSyncPair({
				customerId: customer_id,
				featureId: deduction.feature.id,
				orgId: org.id,
				env,
				entityId: undefined, // Customer-level sync
				region: currentRegion,
			});
		}

		// For each changed entity, queue entity-level sync
		if (result.changedEntityIds && result.changedEntityIds.length > 0) {
			for (const changedEntityId of result.changedEntityIds) {
				globalSyncBatchingManager.addSyncPair({
					customerId: customer_id,
					featureId: deduction.feature.id,
					orgId: org.id,
					env,
					entityId: changedEntityId,
					region: currentRegion,
				});
			}
		}
	}

	if (!trackParams.skip_event && apiCustomer?.autumn_id && eventInfo) {
		globalEventBatchingManager.addEvent(
			constructEvent({
				ctx,
				eventInfo: eventInfo,
				internalCustomerId: apiCustomer?.autumn_id,

				internalEntityId:
					apiCustomer?.entities?.find((entity) => entity.id === entity_id)
						?.autumn_id ?? undefined,

				customerId: customer_id,
				entityId: entity_id,
			}),
		);
	}
};

/**
 * Executes deductions against cached customer data in Redis
 * Uses batching manager to efficiently process multiple deductions
 */
export const runRedisDeduction = async ({
	ctx,
	query,
	trackParams,
	featureDeductions,
	overageBehavior,
	eventInfo,
}: RunRedisDeductionParams): Promise<RunRedisDeductionResult> => {
	const { org, env, skipCache } = ctx;

	if (query.skip_cache || skipCache) {
		return {
			fallback: true,
			code: "skip_cache",
		};
	}

	const {
		customer_id: customerId,
		customer_data: customerData,
		entity_id: entityId,
		entity_data: entityData,
	} = trackParams;

	const { apiCustomer } = await getOrCreateApiCustomer({
		ctx,
		customerId,
		customerData,
		entityId,
		entityData,
	});

	const result = await tryRedisWrite<RunRedisDeductionResult>(async () => {
		// Map feature deductions to the format expected by batching manager
		const mappedDeductions = featureDeductions.map(
			({ feature, deduction }) => ({
				featureId: feature.id,
				amount: deduction,
			}),
		);

		const result = await globalBatchingManager.deduct({
			customerId,
			featureDeductions: mappedDeductions,
			orgId: org.id,
			env,
			entityId,
			overageBehavior,
		});

		if (result.balances) {
			result.balances = Object.fromEntries(
				Object.entries(result.balances).map(([featureId, balance]) => [
					featureId,
					normalizeFromSchema({ schema: ApiBalanceSchema, data: balance }),
				]),
			);
		}

		if (result.success) {
			try {
				queueSyncAndEvent({
					ctx,
					query,
					trackParams,
					featureDeductions,
					overageBehavior,
					eventInfo,
					result,
					apiCustomer,
				});
			} catch (error) {
				ctx.logger.error(`Failed to queue sync and event! ${error}`);
			}
		}

		// Handle PAID_ALLOCATED error - fallback to Postgres
		if (result.error === "PAID_ALLOCATED") {
			ctx.logger.info(
				`Paid allocated feature detected, falling back to Postgres: ${featureDeductions.map((d) => d.feature.id).join(", ")}`,
			);
			return {
				fallback: true,
				code: "allocated_feature",
			};
		}

		return {
			fallback: false,
			code:
				result.error === "INSUFFICIENT_BALANCE"
					? "insufficient_balance"
					: !result.success
						? "redis_write_failed"
						: "success",

			balances: result.balances,
		};
	});

	if (result === null) {
		return {
			fallback: true,
			code: "redis_write_failed",
		};
	}

	if (result.code === "insufficient_balance") {
		throw new InsufficientBalanceError({
			value: trackParams.value ?? 1,
			featureId: trackParams.feature_id,
			eventName: trackParams.event_name,
		});
	}

	return result;
};
