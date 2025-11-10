import type {
	CreditSchemaItem,
	Feature,
	FullCusEntWithFullCusProduct,
	FullCusProduct,
	FullCustomerEntitlement,
} from "@autumn/shared";
import { FeatureType } from "@autumn/shared";
import type { FullCusEntWithSubRows } from "./customerFeatureUsageTypes";

/**
 * Flattens customer products to get all entitlements
 */
export function flattenCustomerEntitlements({
	customerProducts,
}: {
	customerProducts: FullCusProduct[];
}): FullCusEntWithFullCusProduct[] {
	return customerProducts.flatMap((cp: FullCusProduct) =>
		cp.customer_entitlements.map((e: FullCustomerEntitlement) => ({
			...e,
			customer_product: cp,
		})),
	);
}

/**
 * Creates a features lookup map
 */
export function createFeaturesMap({
	features,
}: {
	features: Feature[];
}): Map<string, Feature> {
	return new Map(features.map((f) => [f.id, f]));
}

/**
 * Deduplicates entitlements by combining multiple entitlements for the same feature
 */
export function deduplicateEntitlements({
	entitlements,
}: {
	entitlements: FullCusEntWithFullCusProduct[];
}): FullCusEntWithFullCusProduct[] {
	const featureMap = new Map<string, FullCusEntWithFullCusProduct[]>();

	for (const ent of entitlements) {
		const featureId = ent.entitlement.feature.id;
		if (!featureMap.has(featureId)) {
			featureMap.set(featureId, []);
		}
		featureMap.get(featureId)?.push(ent);
	}

	const combined: FullCusEntWithFullCusProduct[] = [];

	for (const ents of featureMap.values()) {
		if (ents.length === 1) {
			// No duplicates, use as-is
			combined.push(ents[0]);
		} else {
			// Combine multiple entitlements
			const first = ents[0];
			const summedBalance = ents.reduce((sum, e) => sum + (e.balance ?? 0), 0);
			const summedAllowance = ents.reduce(
				(sum, e) => sum + (e.entitlement.allowance ?? 0),
				0,
			);
			const summedQuantity = ents.reduce(
				(sum, e) => sum + (e.customer_product.quantity ?? 1),
				0,
			);
			const earliestReset = ents.reduce(
				(earliest, e) => {
					if (!e.next_reset_at) return earliest;
					if (!earliest) return e.next_reset_at;
					return Math.min(earliest, e.next_reset_at);
				},
				null as number | null,
			);

			combined.push({
				...first,
				balance: summedBalance,
				entitlement: {
					...first.entitlement,
					allowance: summedAllowance,
				},
				customer_product: {
					...first.customer_product,
					quantity: summedQuantity,
				},
				next_reset_at: earliestReset ?? first.next_reset_at,
			});
		}
	}

	return combined;
}

/**
 * Processes non-boolean entitlements and adds subRows for credit systems
 */
export function processNonBooleanEntitlements({
	entitlements,
	cusEnts,
	featuresMap,
}: {
	entitlements: FullCusEntWithFullCusProduct[];
	cusEnts: FullCusEntWithFullCusProduct[];
	featuresMap: Map<string, Feature>;
}): FullCusEntWithSubRows[] {
	// Create a map of feature id to customer entitlements for quick lookup
	const featureIdToCusEnt = new Map(
		cusEnts.map((ent: FullCusEntWithFullCusProduct) => [
			ent.entitlement.feature.id,
			ent,
		]),
	);

	return entitlements
		.filter(
			(ent: FullCusEntWithFullCusProduct) =>
				ent.entitlement.feature.type !== FeatureType.Boolean,
		)
		.map((ent: FullCusEntWithFullCusProduct): FullCusEntWithSubRows => {
			if (ent.entitlement.feature.type === FeatureType.CreditSystem) {
				const creditSchema = ent.entitlement.feature.config?.schema || [];
				const subRows = creditSchema.map((schemaItem: CreditSchemaItem) => {
					const meteredFeature = featuresMap.get(schemaItem.metered_feature_id);
					const meteredCusEnt = featureIdToCusEnt.get(
						schemaItem.metered_feature_id,
					);

					return {
						metered_feature_id: schemaItem.metered_feature_id,
						credit_amount: schemaItem.credit_amount,
						feature_amount: schemaItem.feature_amount,
						feature: meteredFeature,
						meteredCusEnt,
						isSubRow: true,
						entitlement: ent.entitlement,
						customer_product: ent.customer_product,
						next_reset_at: ent.next_reset_at,
					};
				});
				return { ...ent, subRows };
			}
			return ent;
		});
}

/**
 * Filters entitlements to only boolean features
 */
export function filterBooleanEntitlements({
	entitlements,
}: {
	entitlements: FullCusEntWithFullCusProduct[];
}): FullCusEntWithFullCusProduct[] {
	return entitlements.filter(
		(ent: FullCusEntWithFullCusProduct) =>
			ent.entitlement.feature.type === FeatureType.Boolean,
	);
}
