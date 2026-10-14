import {
	EntInterval,
	type EntitlementWithFeature,
	isBooleanEntitlement,
} from "@autumn/shared";
import { type SQL, sql } from "drizzle-orm";

export const featureGrantAbsentSql = ({
	entitlement,
	customerProductId,
}: {
	entitlement: EntitlementWithFeature;
	customerProductId: SQL;
}): SQL => {
	const targetInterval = String(entitlement.interval ?? EntInterval.Lifetime);
	const dedupIntervalCondition = isBooleanEntitlement({ entitlement })
		? sql``
		: sql`AND COALESCE(existing_definition.interval, ${EntInterval.Lifetime}) = ${targetInterval}`;
	return sql`NOT EXISTS (
		SELECT 1
		FROM customer_entitlements AS existing
		INNER JOIN entitlements AS existing_definition
			ON existing_definition.id = existing.entitlement_id
		WHERE existing.customer_product_id = ${customerProductId}
			AND existing.internal_feature_id = ${entitlement.internal_feature_id}
			${dedupIntervalCondition}
	)`;
};
