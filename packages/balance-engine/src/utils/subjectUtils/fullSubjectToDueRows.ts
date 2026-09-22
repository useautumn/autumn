import {
	CusProductStatus,
	cusEntToCusPrice,
	type EntInterval,
	isCustomerEntitlementPrepaidWithSeparateResetInterval,
	isResettingEntitlement,
	PooledBalanceResetMode,
	resetNeedsBillingCycleAnchor,
} from "@autumn/shared";
import type {
	WorkerFullCustomerEntitlementWithProduct,
	WorkerFullSubject,
} from "../../models/subject/workerFullSubject.js";
import { fullSubjectToHeldRows } from "./convertSubjectUtils.js";

/** A row a reset refills: selection proved it has a cycle end and an interval, so the shared reset helpers accept it as is. */
export type DueRow = WorkerFullCustomerEntitlementWithProduct & {
	next_reset_at: number;
	entitlement: WorkerFullCustomerEntitlementWithProduct["entitlement"] & {
		interval: EntInterval;
	};
};

const isOverdue = ({
	row,
	asOf,
}: {
	row: WorkerFullCustomerEntitlementWithProduct;
	asOf: number;
}): boolean => row.next_reset_at !== null && row.next_reset_at < asOf;

/** A loose grant refills on its own; a plan's row refills while the plan is active, or past due when the product allows it. */
const planRefills = ({
	row,
}: {
	row: WorkerFullCustomerEntitlementWithProduct;
}): boolean => {
	const customerProduct = row.customer_product;
	if (!customerProduct) return true;
	if (customerProduct.status === CusProductStatus.Active) return true;
	return (
		customerProduct.status === CusProductStatus.PastDue &&
		customerProduct.product.config.ignore_past_due === true
	);
};

/** A billed row is refilled by its invoice, unless it is prepaid on a reset interval of its own. */
const invoiceRefills = ({
	row,
}: {
	row: WorkerFullCustomerEntitlementWithProduct;
}): boolean => {
	const customerPrice = cusEntToCusPrice({ cusEnt: row });
	if (!customerPrice) return false;
	return !isCustomerEntitlementPrepaidWithSeparateResetInterval({
		customerEntitlement: row,
		customerPrice,
	});
};

/** A lifetime pool is granted once and never refills, whatever its row's cycle says. */
const poolRefills = ({
	row,
}: {
	row: WorkerFullCustomerEntitlementWithProduct;
}): boolean =>
	row.pooled_balance?.reset_mode !== PooledBalanceResetMode.Lifetime;

/** The rows a reset at `asOf` refills: overdue, on a refilling cycle, held by a plan that refills, not a lifetime pool, and not left to an invoice. */
export const fullSubjectToDueRows = ({
	fullSubject,
	asOf,
}: {
	fullSubject: WorkerFullSubject;
	asOf: number;
}): DueRow[] =>
	fullSubjectToHeldRows({ fullSubject }).filter(
		(row): row is DueRow =>
			isOverdue({ row, asOf }) &&
			isResettingEntitlement({ entitlement: row.entitlement }) &&
			planRefills({ row }) &&
			poolRefills({ row }) &&
			!invoiceRefills({ row }),
	);

/** The plans whose subscription anchor can move a reset due at `asOf`: what the sender reads anchors for. */
export const fullSubjectToPlansNeedingBillingCycleAnchor = ({
	fullSubject,
	asOf,
}: {
	fullSubject: WorkerFullSubject;
	asOf: number;
}): string[] => [
	...new Set(
		fullSubjectToDueRows({ fullSubject, asOf }).flatMap((row) =>
			row.customer_product &&
			resetNeedsBillingCycleAnchor({
				customerEntitlement: row,
				now: asOf,
			})
				? [row.customer_product.id]
				: [],
		),
	),
];

/** The pools a reset at `asOf` refills from contributions: what the sender promotes and sums before deciding. Unlimited pools have no grant to recompute. */
export const fullSubjectToPoolsNeedingPromotion = ({
	fullSubject,
	asOf,
}: {
	fullSubject: WorkerFullSubject;
	asOf: number;
}): string[] => [
	...new Set(
		fullSubjectToDueRows({ fullSubject, asOf }).flatMap((row) =>
			row.pooled_balance && !row.pooled_balance.unlimited
				? [row.pooled_balance.id]
				: [],
		),
	),
];
