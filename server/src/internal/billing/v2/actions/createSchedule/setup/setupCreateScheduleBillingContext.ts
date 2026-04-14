import type {
	CreateScheduleParamsV0,
	MultiAttachBillingContext,
	MultiAttachParamsV0,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { setupImmediateMultiProductBillingContext } from "../../common/immediateMultiProduct/setupImmediateMultiProductBillingContext";
import { validateCreateSchedulePhasePlans } from "../errors/validateCreateSchedulePhasePlans";

/** Build billing context for the immediate phase. */
export const setupCreateScheduleBillingContext = async ({
	ctx,
	params,
	immediatePhase,
}: {
	ctx: AutumnContext;
	params: CreateScheduleParamsV0;
	immediatePhase: CreateScheduleParamsV0["phases"][number];
}): Promise<MultiAttachBillingContext> => {
	const immediateParams = {
		customer_id: params.customer_id,
		entity_id: params.entity_id,
		plans: immediatePhase.plans.map((plan) => ({
			plan_id: plan.plan_id,
			customize: plan.customize,
			feature_quantities: plan.feature_quantities,
			version: plan.version,
		})),
		redirect_mode: "if_required",
	} satisfies MultiAttachParamsV0;

	const billingContext = await setupImmediateMultiProductBillingContext({
		ctx,
		params: immediateParams,
	});

	validateCreateSchedulePhasePlans({
		fullProducts: billingContext.fullProducts,
	});

	return billingContext;
};
