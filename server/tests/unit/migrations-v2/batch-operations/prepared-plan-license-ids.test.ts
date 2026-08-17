import { describe, expect, test } from "bun:test";
import {
	licenseEntitlementIdFor,
	planLicenseIdFor,
} from "@/internal/migrations/v2/prepare/modules/ensurePlanLicenses/preparedPlanLicenseIds.js";

const planLicenseArgs = {
	scopeId: "mig_internal_1",
	opIndex: 0,
	licensePlanId: "dev-seat",
	parentInternalProductId: "prod_internal_pro",
	hash: "hash_1",
};

const entitlementArgs = {
	scopeId: "mig_internal_1",
	opIndex: 0,
	licensePlanId: "dev-seat",
	itemIndex: 0,
	internalFeatureId: "feat_internal_dashboard",
	licenseInternalProductId: "prod_internal_seat",
	hash: "hash_1",
};

describe("preparedPlanLicenseIds", () => {
	test("ids are stable across calls so a re-run converges on ON CONFLICT", () => {
		expect(planLicenseIdFor(planLicenseArgs)).toBe(
			planLicenseIdFor(planLicenseArgs),
		);
		expect(licenseEntitlementIdFor(entitlementArgs)).toBe(
			licenseEntitlementIdFor(entitlementArgs),
		);
	});

	test("ids carry their row-kind prefix", () => {
		expect(planLicenseIdFor(planLicenseArgs)).toStartWith("plan_lic_");
		expect(licenseEntitlementIdFor(entitlementArgs)).toStartWith("ent_");
	});

	test("every input participates in the plan license id", () => {
		const base = planLicenseIdFor(planLicenseArgs);
		const variants = [
			{ ...planLicenseArgs, scopeId: "mig_internal_2" },
			{ ...planLicenseArgs, opIndex: 1 },
			{ ...planLicenseArgs, licensePlanId: "other-seat" },
			{ ...planLicenseArgs, parentInternalProductId: "prod_internal_premium" },
			{ ...planLicenseArgs, hash: "hash_2" },
		];
		for (const variant of variants) {
			expect(planLicenseIdFor(variant)).not.toBe(base);
		}
	});

	test("every input participates in the entitlement id", () => {
		const base = licenseEntitlementIdFor(entitlementArgs);
		const variants = [
			{ ...entitlementArgs, scopeId: "mig_internal_2" },
			{ ...entitlementArgs, opIndex: 1 },
			{ ...entitlementArgs, licensePlanId: "other-seat" },
			{ ...entitlementArgs, itemIndex: 1 },
			{ ...entitlementArgs, internalFeatureId: "feat_internal_messages" },
			{ ...entitlementArgs, licenseInternalProductId: "prod_internal_other" },
			{ ...entitlementArgs, hash: "hash_2" },
		];
		for (const variant of variants) {
			expect(licenseEntitlementIdFor(variant)).not.toBe(base);
		}
	});

	test("the two kinds never collide on identical inputs", () => {
		const shared = {
			scopeId: "s",
			opIndex: 0,
			licensePlanId: "p",
			hash: "h",
		};
		expect(
			planLicenseIdFor({
				...shared,
				parentInternalProductId: "x",
			}).replace("plan_lic_", ""),
		).not.toBe(
			licenseEntitlementIdFor({
				...shared,
				itemIndex: 0,
				internalFeatureId: "x",
				licenseInternalProductId: "x",
			}).replace("ent_", ""),
		);
	});
});
