import type { FullCustomer, FullSubject } from "../../index.js";

/** Converts a FullSubject back to a FullCustomer for legacy helper compatibility. */
export const fullSubjectToFullCustomer = ({
	fullSubject,
}: {
	fullSubject: FullSubject;
}): FullCustomer => ({
	...fullSubject.customer,
	customer_products: fullSubject.customer_products,
	// FullSubject does not carry license pools; consumers needing them load fresh.
	entities: fullSubject.entity ? [fullSubject.entity] : [],
	entity: fullSubject.entity,
	extra_customer_entitlements: fullSubject.extra_customer_entitlements,
	subscriptions: fullSubject.subscriptions,
	invoices: fullSubject.invoices,
	migration_item_runs: fullSubject.migration_item_runs,
});
