import type { TrackParams, TrackResponseV3 } from "@autumn/shared";
import { tryCatch } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { globalEventBatchingManager } from "@/internal/balances/events/EventBatchingManager.js";
import { getOrCreateCustomer } from "@/internal/customers/cusUtils/getOrCreateCustomer.js";
import { buildEventInfo, initEvent } from "../../events/initEvent.js";
import { deductionToTrackResponse } from "../../utils/deduction/deductionToTrackResponse.js";
import { executePostgresDeduction } from "../../utils/deduction/executePostgresDeduction.js";
import type { FeatureDeduction } from "../../utils/types/featureDeduction.js";
import { handlePostgresTrackError } from "./handlePostgresTrackError.js";

/**
 * Execute PostgreSQL-based tracking with full transaction support
 */
export const runPostgresTrack = async ({
	ctx,
	body,
	featureDeductions,
}: {
	ctx: AutumnContext;
	body: TrackParams;
	featureDeductions: FeatureDeduction[];
}): Promise<TrackResponseV3> => {
	const fullCustomer = await getOrCreateCustomer({
		ctx,
		customerId: body.customer_id,
		customerData: body.customer_data,
		entityId: body.entity_id,
		entityData: body.entity_data,
		withEntities: true,
	});

	const { data: result, error } = await tryCatch(
		executePostgresDeduction({
			ctx,
			fullCustomer,
			customerId: body.customer_id,
			entityId: body.entity_id,
			deductions: featureDeductions,
			options: {
				overageBehaviour: body.overage_behavior || "cap",
			},
		}),
	);

	if (error || !result) {
		return handlePostgresTrackError({
			error: error ?? new Error("Unknown error"),
			body,
		});
	}

	const { fullCus, updates } = result;

	// Insert event directly into database
	if (!body.skip_event && !body.idempotency_key && fullCus) {
		const eventInfo = buildEventInfo(body);
		const event = initEvent({
			ctx,
			eventInfo,
			internalCustomerId: fullCus.internal_id,
			internalEntityId: fullCus.entity?.internal_id,
			customerId: body.customer_id,
			entityId: body.entity_id,
		});

		// await EventService.insert({ db: ctx.db, event });
		globalEventBatchingManager.addEvent(event);
	}

	// Build response using unified deductionToTrackResponse
	if (!fullCus) {
		return {
			customer_id: body.customer_id,
			entity_id: body.entity_id,
			event_name: body.event_name,
			value: body.value ?? 1,
			balance: null,
		};
	}

	const { balance, balances } = await deductionToTrackResponse({
		ctx,
		fullCus,
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
