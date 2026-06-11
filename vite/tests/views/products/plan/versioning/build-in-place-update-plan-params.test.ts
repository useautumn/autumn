import { describe, expect, test } from "bun:test";
import {
	AppEnv,
	FeatureType,
	FeatureUsageType,
	ProductItemInterval,
	UpdatePlanParamsV2Schema,
	type Feature,
	type FrontendProduct,
} from "@autumn/shared";
import { buildInPlaceUpdatePlanParams } from "@/views/products/plan/versioning/buildMigrationDraft";

const features: Feature[] = [
	{
		internal_id: "fe_messages",
		org_id: "org_1",
		created_at: 1,
		env: AppEnv.Sandbox,
		id: "messages",
		name: "Messages",
		type: FeatureType.Metered,
		config: { usage_type: FeatureUsageType.Single },
		display: null,
		archived: false,
		event_names: [],
	},
	{
		internal_id: "fe_admin",
		org_id: "org_1",
		created_at: 1,
		env: AppEnv.Sandbox,
		id: "admin",
		name: "Admin",
		type: FeatureType.Metered,
		config: { usage_type: FeatureUsageType.Continuous },
		display: null,
		archived: false,
		event_names: [],
	},
];

const baseProduct: FrontendProduct = {
	id: "pro",
	name: "Pro",
	description: "Old description",
	is_add_on: false,
	is_default: false,
	version: 3,
	group: "core",
	env: AppEnv.Sandbox,
	free_trial: {
		duration: "day",
		length: 14,
		card_required: false,
	},
	items: [
		{
			price: 10,
			interval: "month",
			interval_count: 1,
			isPrice: true,
		},
	],
	created_at: 1,
	archived: false,
	planType: "paid",
	basePriceType: "recurring",
};

describe("buildInPlaceUpdatePlanParams", () => {
	test("builds a no-version update body for the current plan", () => {
		const editedProduct: FrontendProduct = {
			...baseProduct,
			name: "Pro Plus",
			description: null,
			free_trial: null,
			items: [
				{
					price: 20,
					interval: "month",
					interval_count: 1,
					isPrice: true,
				},
				{
					feature_id: "messages",
					included_usage: 500,
					interval: ProductItemInterval.Month,
					interval_count: 1,
					isPrice: false,
				},
				{
					feature_id: "admin",
					included_usage: 1,
					isPrice: false,
				},
			],
		};

		const params = buildInPlaceUpdatePlanParams({
			baseProduct,
			editedProduct,
			features,
		});
		const body = JSON.parse(JSON.stringify(params));

		expect(body).toMatchObject({
			plan_id: "pro",
			version: 3,
			name: "Pro Plus",
			description: "",
			group: "core",
			add_on: false,
			auto_enable: false,
			price: {
				amount: 20,
				interval: "month",
			},
			items: [
				{
					feature_id: "admin",
					included: 1,
					unlimited: false,
				},
				{
					feature_id: "messages",
					included: 500,
					unlimited: false,
					reset: { interval: "month" },
				},
			],
			free_trial: null,
			disable_version: true,
		});
		expect(body.items[0]).not.toHaveProperty("reset");
		expect(body.items[0]).not.toHaveProperty("price");
		expect(body.items[1]).not.toHaveProperty("price");
		expect(() => UpdatePlanParamsV2Schema.parse(body)).not.toThrow();
	});
});
