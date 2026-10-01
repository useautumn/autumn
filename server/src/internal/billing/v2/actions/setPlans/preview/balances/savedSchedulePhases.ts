import {
	type AutumnBillingPlan,
	CusProductStatus,
	type FullCusProduct,
	type FullCustomer,
} from "@autumn/shared";
import type { SchedulePhasePlan } from "@/internal/billing/v2/actions/setPlans/types/schedulePhasePlan";
import { getDeleteCustomerProducts } from "@/internal/billing/v2/utils/billingPlan/customerProductPlanMutations";
import { phaseStartsMatch } from "@/internal/billing/v2/utils/phaseStartsMatch";

const startsBy = ({
	customerProduct,
	at,
}: {
	customerProduct: FullCusProduct;
	at: number;
}) =>
	customerProduct.starts_at < at ||
	phaseStartsMatch({ startsAt: customerProduct.starts_at, otherStartsAt: at });

/** Saved scheduled rows the request keeps or deletes; rows it never touches behave alike either way. */
const savedScheduledCustomerProducts = ({
	fullCustomer,
	phases,
	autumnBillingPlan,
}: {
	fullCustomer: FullCustomer;
	phases: SchedulePhasePlan[];
	autumnBillingPlan: AutumnBillingPlan;
}) => {
	const touchedIds = new Set([
		...phases.flatMap((phase) => phase.customerProductIds),
		...getDeleteCustomerProducts({ autumnBillingPlan }).map(
			(customerProduct) => customerProduct.id,
		),
	]);
	return fullCustomer.customer_products.filter(
		(customerProduct) =>
			customerProduct.status === CusProductStatus.Scheduled &&
			touchedIds.has(customerProduct.id),
	);
};

/** The saved schedule cut at the given dates: each starts the saved rows due since the previous one. */
export const savedSchedulePhases = ({
	fullCustomer,
	phases,
	autumnBillingPlan,
	dates,
}: {
	fullCustomer: FullCustomer;
	phases: SchedulePhasePlan[];
	autumnBillingPlan: AutumnBillingPlan;
	dates: number[];
}): SchedulePhasePlan[] => {
	const savedScheduled = savedScheduledCustomerProducts({
		fullCustomer,
		phases,
		autumnBillingPlan,
	});

	return dates.map((at, dateIndex) => {
		const previousAt = dates[dateIndex - 1];
		return {
			startsAt: at,
			customerProductIds: savedScheduled
				.filter(
					(customerProduct) =>
						startsBy({ customerProduct, at }) &&
						(previousAt === undefined ||
							!startsBy({ customerProduct, at: previousAt })),
				)
				.map((customerProduct) => customerProduct.id),
		};
	});
};
