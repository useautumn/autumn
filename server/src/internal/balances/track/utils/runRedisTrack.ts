import type {
	FullCustomer,
	TrackParams,
	TrackResponseV3,
} from "@autumn/shared";
import { tryCatch } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { globalEventBatchingManager } from "../../events/EventBatchingManager.js";
import { buildEventInfo, initEvent } from "../../events/initEvent.js";
import { deductionToTrackResponse } from "../../utils/deduction/deductionToTrackResponse.js";
import { executeLegacyRedisDeductionWithBalanceSync } from "../../utils/deduction/executeLegacyRedisDeductionWithBalanceSync.js";
import type { DeductionUpdate } from "../../utils/types/deductionUpdate.js";
import type { FeatureDeduction } from "../../utils/types/featureDeduction.js";
import { buildAiCreditCostProperty } from "./buildAiCreditCostProperty.js";
import { handleRedisTrackError } from "./handleRedisTrackError.js";

const aiCreditCostEntries = ({
	updates,
	fullCustomer,
}: {
	updates: Record<string, DeductionUpdate>;
	fullCustomer: FullCustomer;
}): Array<{ featureId: string; amount: number }> => {
	const cusEntIdToFeatureId = new Map<string, string>();
	for (const cp of fullCustomer.customer_products) {
		for (const ce of cp.customer_entitlements ?? []) {
			cusEntIdToFeatureId.set(ce.id, ce.entitlement.feature.id);
		}
	}

	const entries: Array<{ featureId: string; amount: number }> = [];
	for (const [cusEntId, update] of Object.entries(updates)) {
		const featureId = cusEntIdToFeatureId.get(cusEntId);
		if (!featureId) continue;
		entries.push({ featureId, amount: update.deducted });
	}
	return entries;
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
	if (body.skip_event) return;

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
	overageBehavior: "cap" | "reject" | "overflow";
	body: TrackParams;
}): Promise<TrackResponseV3> => {
	const { data: result, error } = await tryCatch(
		executeLegacyRedisDeductionWithBalanceSync({
			ctx,
			fullCustomer,
			featureDeductions,
			overageBehavior,
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

	const aiCreditCost = buildAiCreditCostProperty({
		featureDeductions,
		entries: aiCreditCostEntries({ updates, fullCustomer }),
	});
	if (aiCreditCost) {
		body.properties = { ...(body.properties ?? {}), credit_cost: aiCreditCost };
	}

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
