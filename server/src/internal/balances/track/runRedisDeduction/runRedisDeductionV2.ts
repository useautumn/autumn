import type {
	FullCustomer,
	TrackParams,
	TrackResponseV2,
} from "@autumn/shared";
import { tryCatch } from "@autumn/shared";
import { currentRegion } from "@/external/redis/initRedis.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { deductionToTrackResponse } from "../../utils/deduction/deductionToTrackResponse.js";
import { deductFromRedisCusEnts } from "../../utils/redis/deductFromRedisCusEnts.js";
import { globalSyncBatchingManagerV2 } from "../../utils/sync/SyncBatchingManagerV2.js";
import type { DeductionUpdate } from "../../utils/types/deductionUpdate";
import { globalEventBatchingManager } from "../eventUtils/EventBatchingManager.js";
import { constructEvent, type EventInfo } from "../trackUtils/eventUtils.js";
import type { FeatureDeduction } from "../trackUtils/getFeatureDeductions.js";
import { deductionUpdatesToModifiedIds } from "./deductionUpdatesToModifiedIds.js";
import { handleRedisDeductionError } from "./handleRedisDeductionError.js";

type RunRedisDeductionParams = {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	featureDeductions: FeatureDeduction[];
	overageBehavior: "cap" | "reject";
	body: TrackParams;
};

const queueSyncItem = ({
	ctx,
	body,
	updates,
}: {
	ctx: AutumnContext;
	body: TrackParams;
	updates: Record<string, DeductionUpdate>;
}): void => {
	const modifiedCusEntIds = deductionUpdatesToModifiedIds({ updates });
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
	const { data: result, error } = await tryCatch(
		deductFromRedisCusEnts({
			ctx,
			fullCustomer,
			entityId: fullCustomer.entity?.id,
			deductions: featureDeductions,
			overageBehaviour: overageBehavior || "cap",
		}),
	);

	// Handle error (fallback to Postgres or rethrow)
	if (error) {
		return handleRedisDeductionError({
			ctx,
			error,
			body,
			featureDeductions,
		});
	}

	const { updates, fullCus } = result;

	// Queue sync and event
	queueSyncItem({
		ctx,
		body,
		updates,
	});

	queueEvent({ ctx, body, fullCustomer });

	const { balance, balances } = await deductionToTrackResponse({
		ctx,
		fullCus: fullCus!,
		featureDeductions,
		updates,
	});

	return {
		customer_id: body.customer_id,
		entity_id: body.entity_id,
		event_name: body.event_name,
		value: body.value ?? 1,
		balance,
		balances,
	};
};
