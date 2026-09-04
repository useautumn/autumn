/**
 * A persisted customer-level license customization must seed the update editor.
 *
 * Red: details showed 600 messages, but reopening Update Subscription showed
 * the catalog's 400. Green: the initial upsert patch carries 600.
 */
import { expect, test } from "bun:test";
import {
	AllowanceType,
	AppEnv,
	EntInterval,
	type Feature,
	FeatureType,
	FeatureUsageType,
	type FullCustomerLicense,
	type ProductV2,
} from "@autumn/shared";
import { customerLicensesToCustomizePlanLicenses } from "@/components/forms/update-subscription-v2/utils/subscriptionCustomization";

const messagesFeature = {
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
} as Feature;

const licenseProduct = ({ included }: { included: number }): ProductV2 => ({
	id: "seat",
	name: "Seat",
	description: null,
	is_add_on: false,
	is_default: false,
	version: 1,
	group: "seats",
	env: AppEnv.Sandbox,
	free_trial: null,
	items: [
		{
			feature_id: "messages",
			included_usage: included,
			interval: EntInterval.Month,
			pooled: true,
		},
	],
	created_at: 1,
});

test("hydrates the update editor from the customer's effective license", () => {
	const catalogLicense = licenseProduct({ included: 400 });
	const effectiveLicense = licenseProduct({ included: 600 });
	const customerLicense = {
		planLicense: {
			is_custom: true,
			included: 3,
			prepaid_only: true,
			product: {
				internal_id: "prod_effective",
				id: effectiveLicense.id,
				name: effectiveLicense.name,
				description: effectiveLicense.description,
				is_add_on: false,
				is_default: false,
				version: effectiveLicense.version,
				version_slug: null,
				active: true,
				group: effectiveLicense.group,
				free_trial: null,
				created_at: 1,
				env: AppEnv.Sandbox,
				archived: false,
				config: {},
				processor: null,
				prices: [],
				entitlements: [
					{
						id: "ent_effective",
						internal_product_id: "prod_effective",
						internal_feature_id: messagesFeature.internal_id,
						feature_id: messagesFeature.id,
						allowance_type: AllowanceType.Fixed,
						allowance: 600,
						interval: EntInterval.Month,
						interval_count: 1,
						pooled: true,
						is_custom: true,
						feature: messagesFeature,
					},
				],
			},
		},
	} as FullCustomerLicense;

	const [patch] = customerLicensesToCustomizePlanLicenses({
		customerLicenses: [customerLicense],
		licenseProducts: [catalogLicense],
		features: [messagesFeature],
	});

	expect(patch?.license_plan_id).toBe("seat");
	expect(patch?.customize?.add_items?.[0]?.included).toBe(600);
});
