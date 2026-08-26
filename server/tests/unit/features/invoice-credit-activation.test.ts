import { describe, expect, test } from "bun:test";
import {
	type Feature,
	FeatureType,
	type FeatureUpdateBlocker,
} from "@autumn/shared";
import { features } from "@tests/utils/fixtures/db/features.js";
import { detectFeatureUpdateBlockers as detectCatalogV2FeatureUpdateBlockers } from "@/internal/catalogV2/actions/updateCatalog/errors/handleUpdateFeatureErrors/detectFeatureUpdateBlockers.js";
import type { FeatureState } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext/index.js";
import type { UpdateFeaturePlan } from "@/internal/catalogV2/actions/updateCatalog/types/updateFeaturePlan.js";
import {
	detectFeatureUpdateBlockers,
	isBlockableFeatureChange,
} from "@/internal/features/utils/updateFeatureUtils/detectFeatureUpdateBlockers.js";
import type { ObjectsUsingFeature } from "@/internal/features/utils/updateFeatureUtils/getObjectsUsingFeature.js";

const current = features.create({
	id: "enterprise_credits",
	name: "Enterprise credits",
	type: FeatureType.CreditSystem,
	config: { invoice_credit: false, schema: [] },
}) as Feature;
const next = {
	...current,
	config: { ...current.config, invoice_credit: true },
} as Feature;

const objectsUsingFeature = ({
	hasCustomers,
}: {
	hasCustomers: boolean;
}): ObjectsUsingFeature => ({
	entitlements: [],
	prices: [],
	creditSystems: [],
	linkedEntitlements: [],
	cusEnts: hasCustomers ? ([{ id: "customer_entitlement" }] as never[]) : [],
});

const featureState = ({
	hasCustomers,
}: {
	hasCustomers: boolean;
}): FeatureState => ({
	has_customers: hasCustomers,
	has_entitlements: true,
	has_pooled_entitlements: false,
	has_non_consumable_entitlements: false,
	has_loose_entitlements: false,
	has_entity_feature_entitlements: false,
	has_loose_entity_feature_entitlements: false,
	has_prices: true,
	credit_system_feature_ids: [],
	creditSystems: [],
	entitlementsOverflow: false,
	entityFeatureIdEntitlementsOverflow: false,
	pricesOverflow: false,
});

const updateFeaturePlan = {
	current,
	next,
	previousAttributes: { invoice_credit: false },
	hasCustomerEntitlements: true,
	regenerateDisplay: false,
	clearCreditSystemCache: true,
	rewrites: {
		typeChange: null,
		idChange: null,
		usageTypeChange: null,
		updateCreditSystemSchemas: [],
	},
} satisfies UpdateFeaturePlan;

describe("invoice-credit activation", () => {
	test("treats enabling invoice credits as a dependency-sensitive update", () => {
		expect(isBlockableFeatureChange({ feature: current, updates: next })).toBe(
			true,
		);
	});

	test("allows activation before the first customer attachment", () => {
		expect(
			detectFeatureUpdateBlockers({
				feature: current,
				updates: next,
				objectsUsingFeature: objectsUsingFeature({ hasCustomers: false }),
				allFeatures: [current],
			}),
		).toEqual([]);
	});

	test("blocks activation after a customer has been attached in both update paths", () => {
		const expectedBlocker = {
			field: "invoice_credit",
			code: "attached_to_customer",
			message:
				"Cannot enable invoice credits for feature enterprise_credits because it has been attached to a customer before",
		} satisfies FeatureUpdateBlocker;

		expect(
			detectFeatureUpdateBlockers({
				feature: current,
				updates: next,
				objectsUsingFeature: objectsUsingFeature({ hasCustomers: true }),
				allFeatures: [current],
			}),
		).toContainEqual(expectedBlocker);
		expect(
			detectCatalogV2FeatureUpdateBlockers({
				updateFeaturePlan,
				takenFeatureIds: new Set(),
				featureState: featureState({ hasCustomers: true }),
				projectedCreditSystemFeatureIds: [],
			}),
		).toContainEqual(expectedBlocker);
	});

	test("allows invoice credits to be disabled after customer attachment", () => {
		expect(
			detectFeatureUpdateBlockers({
				feature: next,
				updates: current,
				objectsUsingFeature: objectsUsingFeature({ hasCustomers: true }),
				allFeatures: [next],
			}),
		).toEqual([]);
		expect(
			detectCatalogV2FeatureUpdateBlockers({
				updateFeaturePlan: {
					...updateFeaturePlan,
					current: next,
					next: current,
					previousAttributes: { invoice_credit: true },
				},
				takenFeatureIds: new Set(),
				featureState: featureState({ hasCustomers: true }),
				projectedCreditSystemFeatureIds: [],
			}),
		).toEqual([]);
	});
});
