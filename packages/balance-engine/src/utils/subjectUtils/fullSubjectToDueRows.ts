import {
	CusProductStatus,
	cusEntToCusPrice,
	type EntInterval,
	isCustomerEntitlementPrepaidWithSeparateResetInterval,
	isResettingEntitlement,
	PooledBalanceResetMode,
	resetNeedsBillingCycleAnchor,
} from "@autumn/shared";
import type { WorkerPooledBalance } from "../../models/subject/rows/workerPooledBalance.js";
import type {
	WorkerFullCustomerEntitlementWithProduct,
	WorkerFullSubject,
} from "../../models/subject/workerFullSubject.js";
import { fullSubjectToHeldRows } from "./convertSubjectUtils.js";

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

const poolRefills = ({
	row,
}: {
	row: WorkerFullCustomerEntitlementWithProduct;
}): boolean =>
	row.pooled_balance?.reset_mode !== PooledBalanceResetMode.Lifetime;

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

const poolGrantIsSumOfShares = ({
	pool,
}: {
	pool: WorkerPooledBalance;
}): boolean => !pool.unlimited && pool.customer_license_link_id === null;

export const fullSubjectToPoolsSummingContributions = ({
	fullSubject,
	asOf,
}: {
	fullSubject: WorkerFullSubject;
	asOf: number;
}): string[] => [
	...new Set(
		fullSubjectToDueRows({ fullSubject, asOf }).flatMap((row) =>
			row.pooled_balance && poolGrantIsSumOfShares({ pool: row.pooled_balance })
				? [row.pooled_balance.id]
				: [],
		),
	),
];
