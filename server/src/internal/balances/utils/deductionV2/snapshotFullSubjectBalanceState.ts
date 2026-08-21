import type { FullCustomerEntitlement, FullSubject } from "@autumn/shared";

const snapshotCustomerEntitlement = ({
	customerEntitlement,
}: {
	customerEntitlement: FullCustomerEntitlement;
}): FullCustomerEntitlement => ({
	...customerEntitlement,
	replaceables: [...(customerEntitlement.replaceables ?? [])],
	rollovers: (customerEntitlement.rollovers ?? []).map((rollover) => ({
		...rollover,
	})),
});

export const snapshotFullSubjectBalanceState = ({
	fullSubject,
}: {
	fullSubject: FullSubject;
}): FullSubject => ({
	...fullSubject,
	customer_products: fullSubject.customer_products.map((customerProduct) => ({
		...customerProduct,
		customer_entitlements: customerProduct.customer_entitlements.map(
			(customerEntitlement) =>
				snapshotCustomerEntitlement({ customerEntitlement }),
		),
	})),
	extra_customer_entitlements: fullSubject.extra_customer_entitlements.map(
		(customerEntitlement) =>
			snapshotCustomerEntitlement({ customerEntitlement }),
	),
	pooled_customer_entitlements: (
		fullSubject.pooled_customer_entitlements ?? []
	).map((customerEntitlement) =>
		snapshotCustomerEntitlement({ customerEntitlement }),
	),
	usage_windows: fullSubject.usage_windows?.map((usageWindow) => ({
		...usageWindow,
	})),
});
