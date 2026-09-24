/**
 * Caps on one subject's read, 1:1 with the legacy full-subject query's
 * (CUSTOMER_PRODUCT_LIMIT and EXTRA_CUSTOMER_ENTITLEMENT_LIMIT in getFullSubjectRowsQuery):
 * a pathological customer is bounded, not served whole. Dependent rows
 * (prices, grants, rollovers, licenses) follow whatever survives the cap.
 */
export const SUBJECT_ROW_LIMITS = {
	/** Live products per subject: priced before free, main before add-on, newest first. */
	customerProducts: 200,
	/** Loose grants per subject, newest first. */
	looseCustomerEntitlements: 200,
	/** Pools per subject, newest first. */
	pooledCustomerEntitlements: 200,
} as const;
