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

/** Saved scheduled rows the request keeps or deletes; rows it never touches behave alike in both timelines. */
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

/** The saved schedule cut at the request's phase starts: each phase starts the saved rows due since the previous one. */
export const savedSchedulePhases = ({
	fullCustomer,
	phases,
	autumnBillingPlan,
}: {
	fullCustomer: FullCustomer;
	phases: SchedulePhasePlan[];
	autumnBillingPlan: AutumnBillingPlan;
}): SchedulePhasePlan[] => {
	const savedScheduled = savedScheduledCustomerProducts({
		fullCustomer,
		phases,
		autumnBillingPlan,
	});

	return phases.map((phase, phaseIndex) => {
		const previousStartsAt = phases[phaseIndex - 1]?.startsAt;
		return {
			startsAt: phase.startsAt,
			customerProductIds: savedScheduled
				.filter(
					(customerProduct) =>
						startsBy({ customerProduct, at: phase.startsAt }) &&
						(previousStartsAt === undefined ||
							!startsBy({ customerProduct, at: previousStartsAt })),
				)
				.map((customerProduct) => customerProduct.id),
		};
	});
};
