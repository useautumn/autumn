import type { FullSubject, TrackParams, TrackResponseV3 } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	deductionToTrackResponseV2,
	executeRedisDeductionV2,
} from "@/internal/balances/utils/deductionV2/index.js";
import type { FeatureDeduction } from "../../utils/types/featureDeduction.js";

export const runRedisTrackV3 = async ({
	ctx,
	fullSubject,
	featureDeductions,
	overageBehavior,
	body,
}: {
	ctx: AutumnContext;
	fullSubject: FullSubject;
	featureDeductions: FeatureDeduction[];
	overageBehavior: "cap" | "reject";
	body: TrackParams;
}): Promise<TrackResponseV3> => {
	const { fullSubject: updatedFullSubject, updates } =
		await executeRedisDeductionV2({
			ctx,
			fullSubject,
			entityId: fullSubject.entity?.id ?? undefined,
			deductions: featureDeductions,
			deductionOptions: {
				overageBehaviour: overageBehavior,
				triggerAutoTopUp: true,
			},
		});

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
