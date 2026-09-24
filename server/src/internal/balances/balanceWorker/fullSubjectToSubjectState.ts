import {
	type CatalogRow,
	customerRowsToSubjectState,
	type SubjectState,
} from "@autumn/balance-engine";
import {
	CusProductStatus,
	customerEntitlementFundsFeature,
	type FullCusEntWithFullCusProduct,
	type FullCusProduct,
	type FullSubject,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { BalanceWorkerUnsupportedError } from "./balanceWorkerErrors.js";
import { validateMeteringEntitlement } from "./validateMeteringEntitlement.js";

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
		const selected = candidates.filter((entitlement) =>
			customerEntitlementFundsFeature({
				customerEntitlement: entitlement,
				featureId,
			}),
		);
		if (selected.length === 0)
			throw new BalanceWorkerUnsupportedError({ reason: "feature_not_found" });
		for (const entitlement of selected)
			validateMeteringEntitlement({
				ctx,
				fullSubject,
				customerEntitlement: entitlement,
			});
		customerEntitlements.push(...selected);
	}
	return { customerProducts, customerEntitlements };
}

export function fullSubjectToSubjectState({
	ctx,
	fullSubject,
	featureIds,
}: {
	ctx: AutumnContext;
	fullSubject: FullSubject;
	featureIds: readonly string[];
}): SubjectState {
	const rows = selectMeteringRows({ ctx, fullSubject, featureIds });
	return customerRowsToSubjectState({
		identity: {
			orgId: ctx.org.id,
			env: ctx.env,
			customerId: fullSubject.customerId,
			entityId: null,
		},
		customer: fullSubject.customer,
		customerProducts: rows.customerProducts,
		customerPrices: rows.customerProducts.flatMap(
			(customerProduct) => customerProduct.customer_prices,
		),
		customerEntitlements: rows.customerEntitlements,
		rollovers: rows.customerEntitlements.flatMap(
			(customerEntitlement) => customerEntitlement.rollovers,
		),
		usageWindows: (fullSubject.usage_windows ?? []).filter(
			(usageWindow) => usageWindow.internal_entity_id == null,
		),
		entity: null,
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
	const priceRows = rows.customerProducts.flatMap((customerProduct) =>
		customerProduct.customer_prices.map(
			(customerPrice): CatalogRow => ({
				table: "prices",
				row: customerPrice.price,
			}),
		),
	);
	// The trial carries no org or env of its own; its product scopes it for invalidation.
	const freeTrialRows = rows.customerProducts.flatMap(
		(customerProduct): CatalogRow[] =>
			customerProduct.free_trial
				? [
						{
							table: "freeTrials",
							row: {
								...customerProduct.free_trial,
								org_id: customerProduct.product.org_id,
								env: customerProduct.product.env,
							},
						},
					]
				: [],
	);
	return [
		...entitlementRows,
		...featureRows,
		...productRows,
		...priceRows,
		...freeTrialRows,
	];
}
