import { describe, expect, test } from "bun:test";
import { transformApiBillingControls } from "../../src/lib/transforms/apiToSdk/billingControls.js";
import { transformBillingControlsToApi } from "../../src/lib/transforms/sdkToApi/billingControls.js";
import { transformApiPlan } from "../../src/lib/transforms/apiToSdk/plan.js";
import { transformPlanToApi } from "../../src/lib/transforms/sdkToApi/plan.js";
import type { ApiPlan } from "../../src/lib/api/types/index.js";

const sampleApiBillingControls = {
	spend_limits: [
		{
			feature_id: "messages",
			enabled: true,
			limit_type: "usage_percentage" as const,
			overage_limit: 120,
		},
	],
	usage_limits: [
		{
			feature_id: "messages",
			enabled: true,
			limit: 5000,
			interval: "month" as const,
		},
	],
	auto_topups: [
		{
			feature_id: "messages",
			enabled: true,
			threshold: 20,
			quantity: 100,
			purchase_limit: { interval: "day" as const, interval_count: 1, limit: 3 },
			invoice_mode: false,
		},
	],
	usage_alerts: [
		{
			feature_id: "messages",
			enabled: true,
			threshold: 80,
			threshold_type: "usage_percentage" as const,
			name: "80% warning",
		},
	],
	overage_allowed: [{ feature_id: "messages", enabled: true }],
};

const sampleSdkBillingControls = {
	spendLimits: [
		{
			featureId: "messages",
			enabled: true,
			limitType: "usage_percentage" as const,
			overageLimit: 120,
		},
	],
	usageLimits: [
		{
			featureId: "messages",
			enabled: true,
			limit: 5000,
			interval: "month" as const,
		},
	],
	autoTopups: [
		{
			featureId: "messages",
			enabled: true,
			threshold: 20,
			quantity: 100,
			purchaseLimit: { interval: "day" as const, intervalCount: 1, limit: 3 },
			invoiceMode: false,
		},
	],
	usageAlerts: [
		{
			featureId: "messages",
			enabled: true,
			threshold: 80,
			thresholdType: "usage_percentage" as const,
			name: "80% warning",
		},
	],
	overageAllowed: [{ featureId: "messages", enabled: true }],
};

describe("billing control transforms", () => {
	test("transformApiBillingControls maps snake_case API to camelCase SDK", () => {
		expect(transformApiBillingControls(sampleApiBillingControls)).toEqual(
			sampleSdkBillingControls,
		);
	});

	test("transformApiBillingControls returns undefined for empty controls", () => {
		expect(transformApiBillingControls({})).toBeUndefined();
		expect(transformApiBillingControls(undefined)).toBeUndefined();
	});

	test("transformBillingControlsToApi maps camelCase SDK to snake_case API", () => {
		expect(transformBillingControlsToApi(sampleSdkBillingControls)).toEqual(
			sampleApiBillingControls,
		);
	});

	test("plan transforms round-trip billing controls", () => {
		const apiPlan = {
			id: "pro",
			name: "Pro",
			description: null,
			group: null,
			version: 1,
			add_on: false,
			auto_enable: false,
			price: null,
			items: [],
			created_at: 0,
			env: "sandbox",
			archived: false,
			base_variant_id: null,
			config: { ignore_past_due: false },
			billing_controls: sampleApiBillingControls,
			metadata: {},
		} as ApiPlan;

		const sdkPlan = transformApiPlan(apiPlan);
		expect(sdkPlan.billingControls).toEqual(sampleSdkBillingControls);

		const apiParams = transformPlanToApi({ ...sdkPlan });
		expect(apiParams.billing_controls).toEqual(sampleApiBillingControls);
	});
});
