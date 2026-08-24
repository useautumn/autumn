import type {
	Feature,
	FullCusEntWithFullCusProduct,
	FullCustomerEntitlement,
} from "@autumn/shared";
import { customerEntitlementStore } from "../../../sqlite/customerEntitlements/store/customerEntitlementStore.js";
import { customerProductStore } from "../../../sqlite/customerProducts/store/customerProductStore.js";
import type { SqliteContext } from "../../../sqlite/common/types/sqliteContext.js";
import type { Subject } from "../types/subject.js";

// Neither is mirrored yet, so every row shares one empty list.
const NO_REPLACEABLES: FullCustomerEntitlement["replaceables"] = [];
const NO_ROLLOVERS: FullCustomerEntitlement["rollovers"] = [];

// One named read of the customer's resident state for these features: the stores
// project the models, this stitches the product and the feature back onto them.
export const loadSubject = ({
	ctx,
	internalCustomerId,
	features,
}: {
	ctx: SqliteContext;
	internalCustomerId: string;
	features: Feature[];
}): Subject => {
	const customerProducts = customerProductStore.listActiveByInternalCustomerId({
		ctx,
		internalCustomerId,
	});
	const customerProductById = new Map(
		customerProducts.map((customerProduct) => [
			customerProduct.id,
			customerProduct,
		]),
	);
	const featureByInternalId = new Map(
		features.map((feature) => [feature.internal_id, feature]),
	);

	const customerEntitlements: FullCusEntWithFullCusProduct[] = [];
	for (const row of customerEntitlementStore.listByInternalCustomerIdForFeatures(
		{ ctx, internalCustomerId, features },
	)) {
		const feature = featureByInternalId.get(row.internal_feature_id);
		if (!feature) continue;

		customerEntitlements.push({
			...row,
			entitlement: { ...row.entitlement, feature },
			replaceables: NO_REPLACEABLES,
			rollovers: NO_ROLLOVERS,
			customer_product: row.customer_product_id
				? (customerProductById.get(row.customer_product_id) ?? null)
				: null,
		});
	}

	return {
		customer: { internal_id: internalCustomerId },
		customerProducts,
		customerEntitlements,
	};
};
