import { describe, expect, test } from "bun:test";
import {
	AllowanceType,
	EntInterval,
	type EntitlementWithFeature,
	type Feature,
	FeatureType,
	type FullProductWithoutLicenses,
} from "@autumn/shared";
import { computeLicenseProductTransitions } from "@/internal/migrations/v2/batchOperations/compute/transitions/computeLicenseProductTransitions.js";

const messagesFeature = {
	internal_id: "feat_messages",
	id: "messages",
	type: FeatureType.Metered,
} as unknown as Feature;

const dashboardFeature = {
	internal_id: "feat_dashboard",
	id: "dashboard",
	type: FeatureType.Boolean,
} as unknown as Feature;

const messagesEnt = ({
	id,
	allowance,
	interval,
}: {
	id: string;
	allowance: number;
	interval: EntInterval | null;
}): EntitlementWithFeature =>
	({
		id,
		created_at: 0,
		internal_product_id: "prod_seat",
		internal_feature_id: messagesFeature.internal_id,
		feature_id: messagesFeature.id,
		allowance_type: AllowanceType.Fixed,
		allowance,
		interval,
		interval_count: 1,
		feature: messagesFeature,
	}) as unknown as EntitlementWithFeature;

const dashboardEnt = ({ id }: { id: string }): EntitlementWithFeature =>
	({
		id,
		created_at: 0,
		internal_product_id: "prod_seat",
		internal_feature_id: dashboardFeature.internal_id,
		feature_id: dashboardFeature.id,
		allowance_type: null,
		allowance: null,
		interval: null,
		feature: dashboardFeature,
	}) as unknown as EntitlementWithFeature;

const licenseProduct = ({
	entitlements,
}: {
	entitlements: EntitlementWithFeature[];
}): FullProductWithoutLicenses =>
	({
		id: "dev-seat",
		internal_id: "prod_seat",
		entitlements,
		prices: [],
	}) as unknown as FullProductWithoutLicenses;

describe("computeLicenseProductTransitions", () => {
	test("same-feature same-interval allowance edit is a transition", () => {
		const from = messagesEnt({
			id: "ent_from",
			allowance: 100,
			interval: EntInterval.Month,
		});
		const to = messagesEnt({
			id: "ent_to",
			allowance: 200,
			interval: EntInterval.Month,
		});

		const result = computeLicenseProductTransitions({
			fromLicenseProduct: licenseProduct({ entitlements: [from] }),
			mintedEntitlements: [to],
		});

		expect(result.transitions).toHaveLength(1);
		expect(result.transitions[0]?.fromEntitlementPrice.entitlement.id).toBe(
			"ent_from",
		);
		expect(result.transitions[0]?.toEntitlementPrice.entitlement.id).toBe(
			"ent_to",
		);
		expect(result.added).toHaveLength(0);
		expect(result.deleted).toHaveLength(0);
	});

	test("lifetime → monthly is a transition, not delete+add", () => {
		const from = messagesEnt({
			id: "ent_lifetime",
			allowance: 100,
			interval: null,
		});
		const to = messagesEnt({
			id: "ent_monthly",
			allowance: 200,
			interval: EntInterval.Month,
		});

		const result = computeLicenseProductTransitions({
			fromLicenseProduct: licenseProduct({ entitlements: [from] }),
			mintedEntitlements: [to],
		});

		expect(result.transitions).toHaveLength(1);
		expect(result.added).toHaveLength(0);
		expect(result.deleted).toHaveLength(0);
		expect(result.transitions[0]?.fromEntitlementPrice.entitlement.id).toBe(
			"ent_lifetime",
		);
		expect(result.transitions[0]?.toEntitlementPrice.entitlement.id).toBe(
			"ent_monthly",
		);
	});

	test("a brand-new feature is added", () => {
		const messages = messagesEnt({
			id: "ent_messages",
			allowance: 100,
			interval: EntInterval.Month,
		});
		const dashboard = dashboardEnt({ id: "ent_dashboard" });

		const result = computeLicenseProductTransitions({
			fromLicenseProduct: licenseProduct({ entitlements: [messages] }),
			mintedEntitlements: [dashboard],
		});

		expect(result.added).toHaveLength(1);
		expect(result.added[0]?.entitlement.id).toBe("ent_dashboard");
		expect(result.transitions).toHaveLength(0);
		expect(result.deleted).toHaveLength(0);
	});

	test("a dropped feature is deleted", () => {
		const messages = messagesEnt({
			id: "ent_messages",
			allowance: 100,
			interval: EntInterval.Month,
		});
		const dashboard = dashboardEnt({ id: "ent_dashboard" });

		const result = computeLicenseProductTransitions({
			fromLicenseProduct: licenseProduct({
				entitlements: [messages, dashboard],
			}),
			mintedEntitlements: [],
			removedInternalFeatureIds: [messagesFeature.internal_id],
		});

		expect(result.deleted).toHaveLength(1);
		expect(result.deleted[0]?.entitlement.id).toBe("ent_messages");
		expect(result.added).toHaveLength(0);
		expect(result.transitions).toHaveLength(0);
	});
});
