/**
 * A catalog-version change lowers the full product transition: entitlement
 * definitions move to the target version, then the customer product repoints.
 */

import { describe, expect, test } from "bun:test";
import {
	AllowanceType,
	EntInterval,
	type EntitlementWithFeature,
	type Feature,
	FeatureType,
	type FullProductWithoutLicenses,
} from "@autumn/shared";
import { computeProductTransitions } from "@/internal/billing/v2/actions/batchTransition/compute/transitions/computeProductTransitions.js";
import { computeBatchMigrationOperations } from "@/internal/migrations/v2/batchOperations/compute/operations/computeBatchMigrationOperations.js";

const messagesFeature = {
	internal_id: "feat_messages",
	id: "messages",
	type: FeatureType.Metered,
} as unknown as Feature;

const versionedMessagesEntitlement = ({
	id,
	internalProductId,
}: {
	id: string;
	internalProductId: string;
}): EntitlementWithFeature =>
	({
		id,
		created_at: 0,
		internal_product_id: internalProductId,
		internal_feature_id: messagesFeature.internal_id,
		feature_id: messagesFeature.id,
		allowance_type: AllowanceType.Fixed,
		allowance: 100,
		interval: EntInterval.Month,
		interval_count: 1,
		rollover: null,
		entity_feature_id: null,
		pooled: false,
		feature: messagesFeature,
	}) as unknown as EntitlementWithFeature;

const versionedProduct = ({
	internalId,
	version,
	entitlementId,
}: {
	internalId: string;
	version: number;
	entitlementId: string;
}): FullProductWithoutLicenses =>
	({
		id: "pro",
		internal_id: internalId,
		version,
		entitlements: [
			versionedMessagesEntitlement({
				id: entitlementId,
				internalProductId: internalId,
			}),
		],
		prices: [],
	}) as unknown as FullProductWithoutLicenses;

describe("catalog version transition lowering", () => {
	test("identical free versions replace the entitlement definition and repoint the customer product", () => {
		const fromProduct = versionedProduct({
			internalId: "prod_pro_v1",
			version: 1,
			entitlementId: "ent_messages_v1",
		});
		const toProduct = versionedProduct({
			internalId: "prod_pro_v2",
			version: 2,
			entitlementId: "ent_messages_v2",
		});

		const productTransitions = computeProductTransitions({
			fromProduct,
			toProduct,
		});
		const operations = computeBatchMigrationOperations({
			productTransitions,
			licenseLinks: [],
		});

		expect(operations.replaceEntitlements).toHaveLength(1);
		expect(
			operations.replaceEntitlements[0]?.by === "definition"
				? operations.replaceEntitlements[0].fromEntitlementPrice.entitlement.id
				: undefined,
		).toBe("ent_messages_v1");
		expect(
			operations.replaceEntitlements[0]?.entitlementPrice.entitlement.id,
		).toBe("ent_messages_v2");
		expect(operations).toMatchObject({
			repointCustomerProduct: {
				fromInternalProductId: "prod_pro_v1",
				toInternalProductId: "prod_pro_v2",
			},
		});
	});
});
