import type {
	CreateScheduleBillingContext,
	FullCusProduct,
	ScheduledProductContext,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { initScheduledCustomerProduct } from "@/internal/billing/v2/utils/initFullCustomerProduct/initScheduledCustomerProduct";
import { isUnchangedCustomerProduct } from "../utils/isUnchangedCustomerProduct";

type ScheduledPhaseContext =
	CreateScheduleBillingContext["scheduledPhaseContexts"][number];

/** An already-scheduled row that is exactly this requested phase plan, so it stays instead of being recreated. */
const findUnchangedScheduledCustomerProduct = ({
	ctx,
	candidates,
	phaseContext,
	productContext,
	billingCycleAnchorResetsAt,
}: {
	ctx: AutumnContext;
	candidates: FullCusProduct[];
	phaseContext: ScheduledPhaseContext;
	productContext: ScheduledProductContext;
	billingCycleAnchorResetsAt: number | null;
}) =>
	candidates.find(
		(customerProduct) =>
			customerProduct.starts_at === phaseContext.startsAt &&
			(customerProduct.ended_at ?? null) === (phaseContext.endsAt ?? null) &&
			(customerProduct.billing_cycle_anchor_resets_at ?? null) ===
				billingCycleAnchorResetsAt &&
			isUnchangedCustomerProduct({
				ctx,
				customerProduct,
				productContext,
				internalEntityId: productContext.entity?.internal_id,
			}),
	);

/** Build scheduled customer products to insert and existing ones to delete. */
export const computeScheduledCustomerProducts = ({
	ctx,
	billingContext,
	existingScheduledCustomerProducts,
}: {
	ctx: AutumnContext;
	billingContext: CreateScheduleBillingContext;
	existingScheduledCustomerProducts: FullCusProduct[];
}) => {
	const insertCustomerProducts: FullCusProduct[] = [];
	const customPrices = [];
	const customEntitlements = [];
	const scheduledPhases: { startsAt: number; customerProductIds: string[] }[] =
		[];
	const unkeptScheduledCustomerProducts = [
		...existingScheduledCustomerProducts,
	];

	for (const phaseContext of billingContext.scheduledPhaseContexts) {
		const phaseCustomerProductIds: string[] = [];

		for (const productContext of phaseContext.productContexts) {
			const billingCycleAnchorResetsAt =
				phaseContext.billingCycleAnchor === "phase_start"
					? phaseContext.startsAt
					: null;
			const unchangedCustomerProduct = findUnchangedScheduledCustomerProduct({
				ctx,
				candidates: unkeptScheduledCustomerProducts,
				phaseContext,
				productContext,
				billingCycleAnchorResetsAt,
			});
			if (unchangedCustomerProduct) {
				unkeptScheduledCustomerProducts.splice(
					unkeptScheduledCustomerProducts.indexOf(unchangedCustomerProduct),
					1,
				);
				phaseCustomerProductIds.push(unchangedCustomerProduct.id);
				continue;
			}

			// Scope comes from the inherited entity, never the request entity, so a
			// customer-level plan stays customer-level in later phases.
			const customerProduct = initScheduledCustomerProduct({
				ctx,
				fullCustomer: {
					...billingContext.fullCustomer,
					entity: productContext.entity,
				},
				entity: productContext.entity,
				fullProduct: productContext.fullProduct,
				featureQuantities: productContext.featureQuantities,
				customerLicenseQuantities: productContext.customerLicenseQuantities,
				startsAt: phaseContext.startsAt,
				endsAt: phaseContext.endsAt,
				currentEpochMs: billingContext.currentEpochMs,
				externalId: productContext.externalId,
				billingCycleAnchorResetsAt,
			});
			insertCustomerProducts.push(customerProduct);
			phaseCustomerProductIds.push(customerProduct.id);
			customPrices.push(...productContext.customPrices);
			customEntitlements.push(...productContext.customEntitlements);
		}

		scheduledPhases.push({
			startsAt: phaseContext.startsAt,
			customerProductIds: phaseCustomerProductIds,
		});
	}

	return {
		insertCustomerProducts,
		deleteCustomerProducts: unkeptScheduledCustomerProducts,
		customPrices,
		customEntitlements,
		scheduledPhases,
	};
};
