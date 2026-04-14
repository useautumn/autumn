import type { FullSubject, TrackParams, TrackResponseV3 } from "@autumn/shared";
import { tryCatch } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { globalEventBatchingManager } from "@/internal/balances/events/EventBatchingManager.js";
import {
	buildEventInfo,
	initEvent,
} from "@/internal/balances/events/initEvent.js";
import {
	deductionToTrackResponseV2,
	executePostgresDeductionV2,
} from "@/internal/balances/utils/deductionV2/index.js";
import type { FeatureDeduction } from "../../utils/types/featureDeduction.js";
import { handlePostgresTrackError } from "../utils/handlePostgresTrackError.js";

export const runPostgresTrackV3 = async ({
	ctx,
	fullSubject,
	body,
	featureDeductions,
}: {
	ctx: AutumnContext;
	fullSubject: FullSubject;
	body: TrackParams;
	featureDeductions: FeatureDeduction[];
}): Promise<TrackResponseV3> => {
	const { data: result, error } = await tryCatch(
		executePostgresDeductionV2({
			ctx,
			fullSubject,
			customerId: body.customer_id,
			entityId: body.entity_id,
			deductions: featureDeductions,
			options: {
				overageBehaviour: body.overage_behavior || "cap",
				triggerAutoTopUp: true,
			},
		}),
	);

	if (error || !result) {
		return handlePostgresTrackError({
			error: error ?? new Error("Unknown error"),
			body,
		});
	}

	const { fullSubject: updatedFullSubject, updates } = result;

	if (!body.skip_event && !body.idempotency_key) {
		const eventInfo = buildEventInfo(body);
		const event = initEvent({
			ctx,
			eventInfo,
			internalCustomerId: updatedFullSubject.internalCustomerId,
			internalEntityId: updatedFullSubject.internalEntityId,
			customerId: body.customer_id,
			entityId: body.entity_id,
		});

		globalEventBatchingManager.addEvent(event);
	}

	const { balance, balances } = await deductionToTrackResponseV2({
		ctx,
		fullSubject: updatedFullSubject,
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
