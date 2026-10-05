import type {
	FullCustomer,
	MultiAttachProductContext,
	ResolvedCreateSchedulePhaseV0,
	ScheduledPhaseContext,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { setupCustomerLicenseQuantityContext } from "@/internal/billing/v2/setup/setupCustomerLicenseQuantityContext";
import { setupFeatureQuantitiesContext } from "@/internal/billing/v2/setup/setupFeatureQuantitiesContext";
import { setupAttachProductContext } from "../../attach/setup/setupAttachProductContext";
import { validateSetPlansPhasePlans } from "../errors/validateSetPlansPhasePlans";
import { computeScopeForScheduledProduct } from "../utils/computeScopeForScheduledProduct";

/** Resolve product + feature quantity context for each plan in each scheduled phase. */
export const setupScheduledProductsContext = async ({
	ctx,
	phases,
	fullCustomer,
	currentEpochMs,
	immediatePhaseProductContexts,
	endsAt,
}: {
	ctx: AutumnContext;
	phases: ResolvedCreateSchedulePhaseV0[];
	fullCustomer: FullCustomer;
	currentEpochMs: number;
	immediatePhaseProductContexts: MultiAttachProductContext[];
	endsAt?: number;
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
						insertPlanLicenses,
					} = await setupAttachProductContext({
						ctx,
						params: plan,
						fullCustomer,
						currentEpochMs,
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
						// Omitted grants only the included seats later, so it must stay distinct from [].
						customerLicenseQuantities:
							plan.license_quantities === undefined
								? undefined
								: setupCustomerLicenseQuantityContext({ params: plan }),
						insertPlanLicenses,
						externalId: plan.subscription_id,
						entity: computeScopeForScheduledProduct({
							fullProduct,
							entityId: plan.entity_id,
							fullCustomer,
							immediatePhaseProductContexts,
							fallbackEntity: fullCustomer.entity,
						}),
					};
				}),
			);

			validateSetPlansPhasePlans({
				plans: productContexts.map((productContext) => ({
					fullProduct: productContext.fullProduct,
					scopeId: productContext.entity?.internal_id,
				})),
			});

			return {
				startsAt: phase.starts_at,
				endsAt: nextPhaseStartsAt ?? endsAt,
				billingCycleAnchor: phase.billing_cycle_anchor,
				prorationBehavior: phase.proration_behavior,
				productContexts,
			};
		}),
	);
