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

/** A saved row starting between two dates is a cut of its own, so one that also ends before the later date ends there. */
const withSavedStartsBetween = ({
	dates,
	savedScheduled,
}: {
	dates: number[];
	savedScheduled: FullCusProduct[];
}) => {
	const [firstAt] = dates;
	const lastAt = dates[dates.length - 1];
	if (firstAt === undefined || lastAt === undefined) return dates;

	const startsBetween = savedScheduled
		.map((customerProduct) => customerProduct.starts_at)
		.filter(
			(startsAt) =>
				startsAt > firstAt &&
				startsAt < lastAt &&
				!dates.some((at) => phaseStartsMatch({ startsAt, otherStartsAt: at })),
		);
	return [...new Set([...dates, ...startsBetween])].sort(
		(first, second) => first - second,
	);
};

/** The saved schedule cut at the given dates and at its own starts between them: each cut starts the saved rows due since the previous one. */
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
	const cutDates = withSavedStartsBetween({ dates, savedScheduled });

	return cutDates.map((at, dateIndex) => {
		const previousAt = cutDates[dateIndex - 1];
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
