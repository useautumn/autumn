/**
 * TDD test for anchor scoping of loose (product-less) entitlements.
 *
 * Red-failure mode (current behavior):
 *  - toAnchorCandidate uses `customer_product?.internal_entity_id !== null`,
 *    which is `undefined !== null` → true for loose entitlements, so they are
 *    misclassified as entity-scoped and customer-scope anchoring returns null.
 *
 * Green-success criteria (after fix):
 *  - A customer-level loose entitlement anchors a customer-scope window.
 *  - Genuinely entity-owned grants still never anchor customer-scope windows.
 */

import { describe, expect, test } from "bun:test";
import {
	type Feature,
	FeatureType,
	findUsageWindowAnchor,
	type FullSubject,
} from "@autumn/shared";

const meteredFeature = {
	id: "action1",
	internal_id: "iaction1",
	type: FeatureType.Metered,
} as Feature;

const looseEntitlement = ({
	id,
	internalEntityId = null,
}: {
	id: string;
	internalEntityId?: string | null;
}) =>
	({
		id,
		feature_id: "action1",
		internal_entity_id: internalEntityId,
		internal_feature_id: "iaction1",
		customer_product_id: null,
		entitlement_id: `ent_${id}`,
		created_at: 1000,
		balance: 0,
		expires_at: null,
		entitlement: {
			id: `ent_${id}`,
			feature_id: "action1",
			interval: "month",
			feature: { id: "action1", internal_id: "iaction1" },
		},
		rollovers: [],
		replaceables: [],
	}) as unknown as FullSubject["extra_customer_entitlements"][number];

const buildSubject = (
	looseEntitlements: FullSubject["extra_customer_entitlements"],
): FullSubject =>
	({
		customer: {},
		customer_products: [],
		extra_customer_entitlements: looseEntitlements,
	}) as unknown as FullSubject;

describe("findUsageWindowAnchor", () => {
	test("customer scope anchors on a customer-level loose entitlement", () => {
		const { anchorCustomerEntitlementId } = findUsageWindowAnchor({
			fullSubject: buildSubject([looseEntitlement({ id: "ce_loose" })]),
			featureId: "action1",
			features: [meteredFeature],
			isCreditSystem: false,
			scopeType: "customer",
		});

		expect(anchorCustomerEntitlementId).toBe("ce_loose");
	});

	test("customer scope still fails closed for entity-owned loose grants", () => {
		const { anchorCustomerEntitlementId } = findUsageWindowAnchor({
			fullSubject: buildSubject([
				looseEntitlement({ id: "ce_entity", internalEntityId: "ie_1" }),
			]),
			featureId: "action1",
			features: [meteredFeature],
			isCreditSystem: false,
			scopeType: "customer",
		});

		expect(anchorCustomerEntitlementId).toBeNull();
	});
});
