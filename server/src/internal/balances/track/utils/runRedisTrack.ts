import type {
	FullCustomer,
	TrackParams,
	TrackResponseV2,
} from "@autumn/shared";
import { tryCatch } from "@autumn/shared";
import { currentRegion } from "@/external/redis/initRedis.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { globalEventBatchingManager } from "../../events/EventBatchingManager.js";
import { buildEventInfo, initEvent } from "../../events/initEvent.js";
import { deductionToTrackResponse } from "../../utils/deduction/deductionToTrackResponse.js";
import { executeRedisDeduction } from "../../utils/deduction/executeRedisDeduction.js";
import { deductionUpdatesToModifiedIds } from "../../utils/sync/deductionUpdatesToModifiedIds.js";
import { globalSyncBatchingManagerV2 } from "../../utils/sync/SyncBatchingManagerV2.js";
import type { DeductionUpdate } from "../../utils/types/deductionUpdate.js";
import type { FeatureDeduction } from "../../utils/types/featureDeduction.js";
import { handleRedisTrackError } from "./handleRedisTrackError.js";

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

	ctx.logger.info(`[QUEUE SYNC] (${body.customer_id})`);
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

	const eventInfo = buildEventInfo(body);

	globalEventBatchingManager.addEvent(
		initEvent({
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
export const runRedisTrack = async ({
	ctx,
	fullCustomer,
	featureDeductions,
	overageBehavior,
	body,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	featureDeductions: FeatureDeduction[];
	overageBehavior: "cap" | "reject";
	body: TrackParams;
}): Promise<TrackResponseV2> => {
	const { data: result, error } = await tryCatch(
		executeRedisDeduction({
			ctx,
			fullCustomer,
			entityId: fullCustomer.entity?.id,
			deductions: featureDeductions,
			deductionOptions: {
				overageBehaviour: overageBehavior || "cap",
			},
		}),
	);

	// Handle error (fallback to Postgres or rethrow)
	if (error) {
		return handleRedisTrackError({
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
