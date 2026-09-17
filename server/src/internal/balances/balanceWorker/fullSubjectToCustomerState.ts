import {
	type CatalogRow,
	type CustomerState,
	customerRowsToCustomerState,
} from "@autumn/balance-engine";
import {
	CusProductStatus,
	type FullCusEntWithFullCusProduct,
	type FullCusProduct,
	type FullSubject,
	fullSubjectToFullCustomer,
	getApiBalance,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { BalanceWorkerUnsupportedError } from "./balanceWorkerErrors.js";
import {
	hasMeteringBillingControls,
	validateMeteringEntitlement,
} from "./validateMeteringEntitlement.js";

type MeteringRows = {
	customerProducts: FullCusProduct[];
	customerEntitlements: FullCusEntWithFullCusProduct[];
};

const assertSupportedSubject = ({
	ctx,
	fullSubject,
	featureIds,
}: {
	ctx: AutumnContext;
	fullSubject: FullSubject;
	featureIds: readonly string[];
}): void => {
	const { customer } = fullSubject;
	if (
		customer.org_id !== ctx.org.id ||
		customer.env !== ctx.env ||
		!customer.id ||
		fullSubject.customerId !== customer.id ||
		fullSubject.internalCustomerId !== customer.internal_id
	) {
		throw new BalanceWorkerUnsupportedError({ reason: "subject_mismatch" });
	}
	if (
		fullSubject.subjectType !== "customer" ||
		fullSubject.entity ||
		fullSubject.entityId ||
		fullSubject.internalEntityId
	) {
		throw new BalanceWorkerUnsupportedError({ reason: "entity_not_supported" });
	}
	if (
		featureIds.length === 0 ||
		new Set(featureIds).size !== featureIds.length
	) {
		throw new BalanceWorkerUnsupportedError({
			reason: "invalid_feature_selection",
		});
	}
	if (
		hasMeteringBillingControls({ controls: customer }) ||
		fullSubject.usage_windows?.length
	) {
		throw new BalanceWorkerUnsupportedError({
			reason: "billing_controls_not_supported",
		});
	}
};

/** The worker only meters plain included grants today; a breakdown that says otherwise is refused. */
const assertSupportedBalanceShape = ({
	ctx,
	fullSubject,
	customerEntitlement,
}: {
	ctx: AutumnContext;
	fullSubject: FullSubject;
	customerEntitlement: FullCusEntWithFullCusProduct;
}): void => {
	const { data: balance } = getApiBalance({
		ctx: { ...ctx, expand: [] },
		fullCus: fullSubjectToFullCustomer({ fullSubject }),
		cusEnts: [customerEntitlement],
		feature: customerEntitlement.entitlement.feature,
	});
	const breakdown = balance.breakdown?.[0];
	if (
		!breakdown ||
		breakdown.prepaid_grant !== 0 ||
		breakdown.reset?.interval === "multiple"
	) {
		throw new BalanceWorkerUnsupportedError({
			reason: "balance_shape_not_supported",
		});
	}
};

/** The rows the worker will own for these features, after every shape gate. */
export function selectMeteringRows({
	ctx,
	fullSubject,
	featureIds,
}: {
	ctx: AutumnContext;
	fullSubject: FullSubject;
	featureIds: readonly string[];
}): MeteringRows {
	assertSupportedSubject({ ctx, fullSubject, featureIds });
	const customerProducts = fullSubject.customer_products.filter((product) =>
		[CusProductStatus.Active, CusProductStatus.PastDue].includes(
			product.status,
		),
	);
	const candidates: FullCusEntWithFullCusProduct[] = [
		...customerProducts.flatMap((customerProduct) =>
			customerProduct.customer_entitlements.map((entitlement) => ({
				...entitlement,
				customer_product: customerProduct,
			})),
		),
		...[
			...fullSubject.extra_customer_entitlements,
			...(fullSubject.pooled_customer_entitlements ?? []),
		].map((entitlement) => ({ ...entitlement, customer_product: null })),
	];

	const customerEntitlements: FullCusEntWithFullCusProduct[] = [];
	for (const featureId of featureIds) {
		const selected = candidates.filter(
			(entitlement) => entitlement.entitlement.feature.id === featureId,
		);
		if (selected.length === 0)
			throw new BalanceWorkerUnsupportedError({ reason: "feature_not_found" });
		for (const entitlement of selected)
			validateMeteringEntitlement({
				ctx,
				fullSubject,
				customerEntitlement: entitlement,
			});
		if (selected.length !== 1)
			throw new BalanceWorkerUnsupportedError({
				reason: "multiple_customer_entitlements_not_supported",
			});
		const [customerEntitlement] = selected;
		assertSupportedBalanceShape({ ctx, fullSubject, customerEntitlement });
		customerEntitlements.push(customerEntitlement);
	}
	return { customerProducts, customerEntitlements };
}

export function fullSubjectToCustomerState({
	ctx,
	fullSubject,
	featureIds,
}: {
	ctx: AutumnContext;
	fullSubject: FullSubject;
	featureIds: readonly string[];
}): CustomerState {
	const rows = selectMeteringRows({ ctx, fullSubject, featureIds });
	return customerRowsToCustomerState({
		identity: {
			orgId: ctx.org.id,
			env: ctx.env,
			customerId: fullSubject.customerId,
			entityId: null,
		},
		customerProducts: rows.customerProducts,
		customerEntitlements: rows.customerEntitlements,
		rollovers: rows.customerEntitlements.flatMap(
			(customerEntitlement) => customerEntitlement.rollovers,
		),
		entities: [],
	});
}

/** The catalog rows that state references, taken from the FullSubject the server already holds. */
export function fullSubjectToCatalogRows({
	ctx,
	fullSubject,
	featureIds,
}: {
	ctx: AutumnContext;
	fullSubject: FullSubject;
	featureIds: readonly string[];
}): CatalogRow[] {
	const rows = selectMeteringRows({ ctx, fullSubject, featureIds });
	const entitlementRows = rows.customerEntitlements.map(
		(customerEntitlement): CatalogRow => {
			const { feature: _feature, ...entitlement } =
				customerEntitlement.entitlement;
			return { table: "entitlements", row: entitlement };
		},
	);
	const featureRows = rows.customerEntitlements.map(
		(customerEntitlement): CatalogRow => ({
			table: "features",
			row: customerEntitlement.entitlement.feature,
		}),
	);
	const productRows = rows.customerProducts.map(
		(customerProduct): CatalogRow => ({
			table: "products",
			row: customerProduct.product,
		}),
	);
	return [...entitlementRows, ...featureRows, ...productRows];
}
