import type {
	CreateScheduleBillingContext,
	CreateScheduleParamsV0,
	MultiAttachParamsV0,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { setupImmediateMultiProductBillingContext } from "../../common/immediateMultiProduct/setupImmediateMultiProductBillingContext";
import { normalizeCreateSchedulePhases } from "../errors/normalizeCreateSchedulePhases";
import { validateCreateSchedulePhasePlans } from "../errors/validateCreateSchedulePhasePlans";
import { setupScheduledProductsContext } from "./setupScheduledProductsContext";

/** Build billing context for the immediate phase. */
export const setupCreateScheduleBillingContext = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: CreateScheduleParamsV0;
}): Promise<CreateScheduleBillingContext> => {
	const normalizedPhases = normalizeCreateSchedulePhases({
		phases: params.phases,
	});
	const [immediatePhase, ...futurePhases] = normalizedPhases;

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

	const scheduledPhaseContexts = await setupScheduledProductsContext({
		ctx,
		phases: futurePhases,
	});

	const scheduledCustomPrices = scheduledPhaseContexts.flatMap((phase) =>
		phase.productContexts.flatMap(
			(productContext) => productContext.customPrices,
		),
	);
	const scheduledCustomEntitlements = scheduledPhaseContexts.flatMap((phase) =>
		phase.productContexts.flatMap(
			(productContext) => productContext.customEntitlements,
		),
	);

	return {
		...billingContext,
		customPrices: [
			...(billingContext.customPrices ?? []),
			...scheduledCustomPrices,
		], // combine custom prices from immediate and scheduled phases
		customEnts: [
			...(billingContext.customEnts ?? []),
			...scheduledCustomEntitlements,
		], // combine custom prices and entitlements from immediate and scheduled phases
		isCustom:
			billingContext.isCustom ||
			scheduledCustomPrices.length > 0 ||
			scheduledCustomEntitlements.length > 0,
		immediatePhase,
		futurePhases,
		scheduledPhaseContexts,
	};
};
