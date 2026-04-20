import type {
	CreateScheduleParamsV0,
	ScheduledPhaseContext,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { setupFeatureQuantitiesContext } from "@/internal/billing/v2/setup/setupFeatureQuantitiesContext";
import { setupAttachProductContext } from "../../attach/setup/setupAttachProductContext";
import { validateCreateSchedulePhasePlans } from "../errors/validateCreateSchedulePhasePlans";

/** Resolve product + feature quantity context for each plan in each scheduled phase. */
export const setupScheduledProductsContext = async ({
	ctx,
	phases,
}: {
	ctx: AutumnContext;
	phases: CreateScheduleParamsV0["phases"][number][];
}): Promise<ScheduledPhaseContext[]> =>
	Promise.all(
		phases.map(async (phase, index) => {
			const nextPhaseStartsAt = phases[index + 1]?.starts_at;

			const productContexts = await Promise.all(
				phase.plans.map(async (plan) => {
					const {
						fullProduct,
						customPrices = [],
						customEnts: customEntitlements = [],
					} = await setupAttachProductContext({
						ctx,
						params: plan,
					});

					const featureQuantities = setupFeatureQuantitiesContext({
						ctx,
						featureQuantitiesParams: {
							feature_quantities: plan.feature_quantities,
						},
						fullProduct,
						initializeUndefinedQuantities: true,
					});

					return {
						fullProduct,
						customPrices,
						customEntitlements,
						featureQuantities,
					};
				}),
			);

			validateCreateSchedulePhasePlans({
				fullProducts: productContexts.map(
					(productContext) => productContext.fullProduct,
				),
			});

			return {
				startsAt: phase.starts_at,
				endsAt: nextPhaseStartsAt,
				productContexts,
			};
		}),
	);
