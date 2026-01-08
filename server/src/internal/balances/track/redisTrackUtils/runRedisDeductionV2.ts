import type {
	ApiBalance,
	FullCustomer,
	TrackParams,
	TrackResponseV2,
} from "@autumn/shared";
import { RecaseError } from "@autumn/shared";
import { currentRegion } from "@/external/redis/initRedis.js";
import type { AutumnContext } from "../../../../honoUtils/HonoEnv.js";
import { getApiCustomerBase } from "../../../customers/cusUtils/apiCusUtils/getApiCustomerBase.js";
import { deductFromRedisCusEnts } from "../../utils/redis/deductFromRedisCusEnts.js";
import { globalSyncBatchingManagerV2 } from "../../utils/sync/SyncBatchingManagerV2.js";
import { globalEventBatchingManager } from "../eventUtils/EventBatchingManager.js";
import { constructEvent, type EventInfo } from "../trackUtils/eventUtils.js";
import { executePostgresTracking } from "../trackUtils/executePostgresTracking.js";
import type { FeatureDeduction } from "../trackUtils/getFeatureDeductions.js";
import { getTrackBalancesResponse } from "../trackUtils/getTrackBalancesResponse.js";

type RunRedisDeductionParams = {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	featureDeductions: FeatureDeduction[];
	overageBehavior: "cap" | "reject";
	body: TrackParams;
};

type RedisDeductionResult = Awaited<ReturnType<typeof deductFromRedisCusEnts>>;

const isRedisResult = (
	result:
		| RedisDeductionResult
		| Awaited<ReturnType<typeof executePostgresTracking>>
		| undefined,
): result is RedisDeductionResult => {
	return !!result && "fullCus" in result && !!result.fullCus;
};

const queueSyncItem = ({
	ctx,
	body,
	modifiedCusEntIds,
}: {
	ctx: AutumnContext;
	body: TrackParams;
	modifiedCusEntIds: string[];
}): void => {
	if (modifiedCusEntIds.length === 0) return;

	globalSyncBatchingManagerV2.addSyncItem({
		customerId: body.customer_id,
		orgId: ctx.org.id,
		env: ctx.env,
		cusEntIds: modifiedCusEntIds,
		region: currentRegion,
	});
};

const queueEvent = ({
	ctx,
	body,
	fullCustomer,
}: {
	ctx: AutumnContext;
	body: TrackParams;
	fullCustomer: FullCustomer;
}): void => {
	if (body.skip_event || body.idempotency_key) return;

	const eventInfo: EventInfo = {
		event_name: body.feature_id || body.event_name || "",
		value: body.value ?? 1,
		properties: body.properties,
		timestamp: body.timestamp,
	};

	globalEventBatchingManager.addEvent(
		constructEvent({
			ctx,
			eventInfo,
			internalCustomerId: fullCustomer.internal_id,
			internalEntityId: fullCustomer.entity?.internal_id,
			customerId: body.customer_id,
			entityId: body.entity_id,
		}),
	);
};

const buildBalancesResponse = ({
	result,
	apiCustomer,
	featureDeductions,
	features,
}: {
	result: RedisDeductionResult;
	apiCustomer: { balances: Record<string, ApiBalance> };
	featureDeductions: FeatureDeduction[];
	features: AutumnContext["features"];
}) => {
	const balancesRes: Record<string, ApiBalance> = {};

	// Add primary features (always - they were requested to be tracked)
	for (const deduction of featureDeductions) {
		const balance = apiCustomer.balances[deduction.feature.id];
		if (balance) {
			balancesRes[deduction.feature.id] = balance;
		}
	}

	// Add credit systems only if they were actually used
	for (const featureId of Object.keys(result.actualDeductions)) {
		if (!balancesRes[featureId]) {
			const balance = apiCustomer.balances[featureId];
			if (balance) {
				balancesRes[featureId] = balance;
			}
		}
	}

	return getTrackBalancesResponse({
		featureDeductions,
		features,
		balances: balancesRes,
	});
};

/**
 * Executes deductions against cached customer data in Redis.
 * Queues sync to Postgres and event insertion after successful deduction.
 */
export const runRedisDeductionV2 = async ({
	ctx,
	fullCustomer,
	featureDeductions,
	overageBehavior,
	body,
}: RunRedisDeductionParams): Promise<TrackResponseV2> => {
	let result:
		| RedisDeductionResult
		| Awaited<ReturnType<typeof executePostgresTracking>>
		| undefined;

	try {
		result = await deductFromRedisCusEnts({
			ctx,
			fullCus: fullCustomer,
			deductions: featureDeductions,
			overageBehaviour: overageBehavior || "cap",
			entityId: fullCustomer.entity?.id,
		});
	} catch (error) {
		// Pass through RecaseError (user-facing errors like insufficient_balance)
		if (error instanceof RecaseError) {
			throw error;
		}

		// For InternalError and other errors, check if we should fallback to Postgres
		const errorStr = JSON.stringify(error);
		const shouldFallback =
			errorStr.includes("PAID_ALLOCATED") ||
			errorStr.includes("CUSTOMER_NOT_FOUND") ||
			errorStr.includes("customer_not_in_cache");

		if (shouldFallback) {
			ctx.logger.warn(`Falling back to Postgres for track operation.`);
			result = await executePostgresTracking({
				ctx,
				body,
				featureDeductions,
			});
		} else {
			throw error;
		}
	}

	if (isRedisResult(result)) {
		queueSyncItem({
			ctx,
			body,
			modifiedCusEntIds: result.modifiedCusEntIds,
		});

		queueEvent({ ctx, body, fullCustomer });

		const { apiCustomer } = await getApiCustomerBase({
			ctx,
			fullCus: result.fullCus!,
		});

		const finalBalances = buildBalancesResponse({
			result,
			apiCustomer,
			featureDeductions,
			features: ctx.features,
		});

		return {
			customer_id: body.customer_id,
			entity_id: body.entity_id,
			event_name: body.event_name,
			value: body.value ?? 1,
			balance: finalBalances.balance,
			balances: finalBalances.balances,
		};
	}

	// Fallback: result is from executePostgresTracking (already returns TrackResponseV2)
	return result as TrackResponseV2;
};
