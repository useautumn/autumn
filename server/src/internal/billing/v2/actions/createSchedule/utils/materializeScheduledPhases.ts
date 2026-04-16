import {
	addDuration,
	BillingVersion,
	type CreateScheduleParamsV0,
	CusProductStatus,
	type FullCustomer,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { setupFeatureQuantitiesContext } from "@/internal/billing/v2/setup/setupFeatureQuantitiesContext";
import { initFullCustomerProduct } from "@/internal/billing/v2/utils/initFullCustomerProduct/initFullCustomerProduct";
import { setupAttachProductContext } from "../../attach/setup/setupAttachProductContext";
import { validateCreateSchedulePhasePlans } from "../errors/validateCreateSchedulePhasePlans";

export type MaterializedScheduledPhase = {
	starts_at: number;
	customerProducts: Awaited<ReturnType<typeof initFullCustomerProduct>>[];
	customPrices: NonNullable<
		Awaited<ReturnType<typeof setupAttachProductContext>>["customPrices"]
	>;
	customEntitlements: NonNullable<
		Awaited<ReturnType<typeof setupAttachProductContext>>["customEnts"]
	>;
};

/** Build scheduled customer products for future phases. */
export const materializeScheduledPhases = async ({
	ctx,
	currentEpochMs,
	fullCustomer,
	phases,
}: {
	ctx: AutumnContext;
	currentEpochMs: number;
	fullCustomer: FullCustomer;
	phases: CreateScheduleParamsV0["phases"];
}): Promise<MaterializedScheduledPhase[]> => {
	return await Promise.all(
		phases.map(async (phase, index) => {
			const nextPhaseStartsAt = phases[index + 1]?.starts_at;
			const materializedProducts = await Promise.all(
				phase.plans.map(async (plan) => {
					const {
						fullProduct,
						customPrices = [],
						customEnts: customEntitlements = [],
					} = await setupAttachProductContext({
						ctx,
						params: plan,
					});
					const trialEndsAt = fullProduct.free_trial
						? addDuration({
								now: phase.starts_at,
								durationType: fullProduct.free_trial.duration,
								durationLength: fullProduct.free_trial.length,
							})
						: undefined;
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
						customerProduct: initFullCustomerProduct({
							ctx,
							initContext: {
								fullCustomer,
								fullProduct,
								featureQuantities,
								resetCycleAnchor: phase.starts_at,
								freeTrial: fullProduct.free_trial ?? null,
								trialEndsAt,
								now: currentEpochMs,
								billingVersion: BillingVersion.V2,
							},
							initOptions: {
								startsAt: phase.starts_at,
								endedAt: nextPhaseStartsAt,
								status: CusProductStatus.Scheduled,
								isCustom: customPrices.length > 0 || customEntitlements.length > 0,
							},
						}),
						customPrices,
						customEntitlements,
					};
				}),
			);
			validateCreateSchedulePhasePlans({
				fullProducts: materializedProducts.map(
					({ fullProduct }) => fullProduct,
				),
			});

			return {
				starts_at: phase.starts_at,
				customerProducts: materializedProducts.map(
					({ customerProduct }) => customerProduct,
				),
				customPrices: materializedProducts.flatMap(
					({ customPrices }) => customPrices,
				),
				customEntitlements: materializedProducts.flatMap(
					({ customEntitlements }) => customEntitlements,
				),
			};
		}),
	);
};
