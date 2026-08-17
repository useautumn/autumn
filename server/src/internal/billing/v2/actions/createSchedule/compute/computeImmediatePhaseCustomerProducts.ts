import type {
	AutumnBillingPlan,
	CreateScheduleBillingContext,
	FullCusProduct,
} from "@autumn/shared";
import { CusProductStatus, isCusProductOnEntity } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { computeAttachNewCustomerProduct } from "@/internal/billing/v2/actions/attach/compute/computeAttachNewCustomerProduct";
import { productContextToAttachBillingContext } from "@/internal/billing/v2/utils/billingContext/productContextToAttachBillingContext";
import { applyScheduleTimingToCustomerProductPlan } from "@/internal/billing/v2/utils/billingPlan/customerProductPlanMutations";

type CustomerProductUpdate = NonNullable<
	AutumnBillingPlan["updateCustomerProducts"]
>[number];

const expireCurrentRecurringCustomerProducts = ({
	customerProducts,
	currentEpochMs,
}: {
	customerProducts: FullCusProduct[];
	currentEpochMs: number;
}): CustomerProductUpdate[] =>
	customerProducts.map((customerProduct) => ({
		customerProduct,
		updates: {
			status: CusProductStatus.Expired,
			ended_at: currentEpochMs,
			canceled: true,
			canceled_at: currentEpochMs,
			scheduled_ids: [],
		},
	}));

const insertImmediateCustomerProducts = ({
	ctx,
	billingContext,
	expiredCustomerProducts,
	nextPhaseStartsAt,
}: {
	ctx: AutumnContext;
	billingContext: CreateScheduleBillingContext;
	expiredCustomerProducts: FullCusProduct[];
	nextPhaseStartsAt: number | undefined;
}) =>
	billingContext.productContexts.map((productContext) => {
		const expiredSameProduct = expiredCustomerProducts.find(
			(customerProduct) =>
				customerProduct.product.id === productContext.fullProduct.id &&
				isCusProductOnEntity({
					cusProduct: customerProduct,
					internalEntityId: productContext.fullCustomer.entity?.internal_id,
				}),
		);

		const attachBillingContext = productContextToAttachBillingContext({
			billingContext,
			productContext,
			currentCustomerProductOverride: expiredSameProduct,
		});

		const newCustomerProduct = computeAttachNewCustomerProduct({
			ctx,
			attachBillingContext,
			params: { no_billing_changes: billingContext.skipBillingChanges },
		});

		if (expiredSameProduct) {
			newCustomerProduct.starts_at = expiredSameProduct.starts_at;
		}

		applyScheduleTimingToCustomerProductPlan({
			result: { insertCustomerProduct: newCustomerProduct },
			// An unscheduled plan outlives the schedule, so it never takes the phase
			// boundary as its end date.
			endedAt: productContext.unscheduled ? null : (nextPhaseStartsAt ?? null),
		});
		if (billingContext.skipBillingChanges) {
			newCustomerProduct.scheduled_ids =
				attachBillingContext.currentCustomerProduct?.scheduled_ids;
		}

		return {
			customerProduct: newCustomerProduct,
			unscheduled: productContext.unscheduled === true,
		};
	});

/** Compute the immediate-phase customer product expirations and insertions. */
export const computeImmediatePhaseCustomerProducts = ({
	ctx,
	billingContext,
	currentRecurringCustomerProducts,
	nextPhaseStartsAt,
}: {
	ctx: AutumnContext;
	billingContext: CreateScheduleBillingContext;
	currentRecurringCustomerProducts: FullCusProduct[];
	nextPhaseStartsAt: number | undefined;
}) => {
	const updateCustomerProducts = expireCurrentRecurringCustomerProducts({
		customerProducts: currentRecurringCustomerProducts,
		currentEpochMs: billingContext.currentEpochMs,
	});

	const inserted = insertImmediateCustomerProducts({
		ctx,
		billingContext,
		expiredCustomerProducts: currentRecurringCustomerProducts,
		nextPhaseStartsAt,
	});

	return {
		// Unscheduled plans still bill now, so they belong to the inserts...
		insertCustomerProducts: inserted.map(
			({ customerProduct }) => customerProduct,
		),
		updateCustomerProducts,
		// ...but not to the phase: the schedule must never expire them.
		phaseCustomerProductIds: inserted
			.filter(({ unscheduled }) => !unscheduled)
			.map(({ customerProduct }) => customerProduct.id),
	};
};
