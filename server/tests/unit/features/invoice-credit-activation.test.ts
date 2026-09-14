/**
 * The invoice_credit flag no longer gates anything: itemization is stamped
 * per customer entitlement from the plan item's price, so flipping the flag
 * is not a blockable feature change and never trips a customer blocker.
 */

import { describe, expect, test } from "bun:test";
import { type Feature, FeatureType } from "@autumn/shared";
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

const objectsUsingFeatureWithCustomers: ObjectsUsingFeature = {
	entitlements: [],
	prices: [],
	creditSystems: [],
	linkedEntitlements: [],
	cusEnts: [{ id: "customer_entitlement" }] as never[],
};

const featureStateWithCustomers: FeatureState = {
	has_customers: true,
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
};

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

describe("invoice_credit flag is inert", () => {
	test("flipping the flag is not a dependency-sensitive change", () => {
		expect(isBlockableFeatureChange({ feature: current, updates: next })).toBe(
			false,
		);
	});

	test("enabling it after customers attached is not blocked in either update path", () => {
		expect(
			detectFeatureUpdateBlockers({
				feature: current,
				updates: next,
				objectsUsingFeature: objectsUsingFeatureWithCustomers,
				allFeatures: [current],
			}),
		).toEqual([]);
		expect(
			detectCatalogV2FeatureUpdateBlockers({
				updateFeaturePlan,
				takenFeatureIds: new Set(),
				featureState: featureStateWithCustomers,
				projectedCreditSystemFeatureIds: [],
			}),
		).toEqual([]);
	});
});
