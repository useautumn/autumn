import { describe, expect, test } from "bun:test";
import {
	AllowanceType,
	AppEnv,
	CusProductStatus,
	EntInterval,
	FeatureType,
} from "@autumn/shared";
import type { CatalogRow } from "../../../../src/models/catalog/catalogRow.js";
import {
	catalogKeyToString,
	catalogRowsToCatalog,
	catalogRowToCatalogKey,
	customerStateToCatalogKeys,
} from "../../../../src/utils/catalogUtils/convertCatalogUtils.js";
import { filterCatalogKeysMissingFrom } from "../../../../src/utils/catalogUtils/filterCatalogUtils.js";
import { findFeatureById } from "../../../../src/utils/catalogUtils/findCatalogUtils.js";
import { createCustomerState } from "../../../../src/utils/customerStateUtils/createCustomerState.js";

const identity = {
	orgId: "org_1",
	env: "sandbox",
	customerId: "cus_1",
	entityId: null,
};

const customerProduct = {
	id: "cp_1",
	internal_customer_id: "cus_internal_1",
	internal_product_id: "prod_internal_1",
	internal_entity_id: null,
	status: CusProductStatus.Active,
	options: [],
	quantity: 1,
	created_at: 1_700_000_000_000,
};

const customerEntitlement = ({
	id,
	entitlementId,
}: {
	id: string;
	entitlementId: string;
}) => ({
	id,
	customer_product_id: "cp_1",
	entitlement_id: entitlementId,
	internal_customer_id: "cus_internal_1",
	internal_entity_id: null,
	internal_feature_id: "feat_internal_1",
	balance: 10,
	adjustment: 0,
	additional_balance: 0,
	unlimited: false,
	usage_allowed: false,
	next_reset_at: null,
	reset_cycle_anchor: null,
	expires_at: null,
	external_id: null,
	created_at: 1_700_000_000_000,
});

const entitlementRow = (id: string): CatalogRow => ({
	table: "entitlements",
	row: {
		id,
		created_at: 1_700_000_000_000,
		internal_feature_id: "feat_internal_1",
		internal_product_id: "prod_internal_1",
		is_custom: false,
		allowance_type: AllowanceType.Fixed,
		allowance: 1000,
		interval: EntInterval.Month,
		interval_count: 1,
		org_id: "org_1",
		usage_limit: null,
	},
});

const featureRow: CatalogRow = {
	table: "features",
	row: {
		internal_id: "feat_internal_1",
		org_id: "org_1",
		created_at: 1_700_000_000_000,
		env: AppEnv.Sandbox,
		id: "api_calls",
		name: "API calls",
		type: FeatureType.Metered,
		config: {},
		archived: false,
		event_names: [],
	},
};

const productRow: CatalogRow = {
	table: "products",
	row: {
		id: "pro",
		name: "Pro",
		description: null,
		is_add_on: false,
		is_default: false,
		version: 1,
		version_slug: "v1",
		active: true,
		deleted_at: null,
		previous_version_slug: null,
		group: "",
		env: AppEnv.Sandbox,
		internal_id: "prod_internal_1",
		org_id: "org_1",
		created_at: 1_700_000_000_000,
		base_variant_id: null,
		archived: false,
		config: { ignore_past_due: false },
		metadata: {},
	},
};

const state = createCustomerState({
	identity,
	customerProducts: [customerProduct],
	customerEntitlements: [
		customerEntitlement({ id: "ce_2", entitlementId: "ent_2" }),
		customerEntitlement({ id: "ce_1", entitlementId: "ent_1" }),
	],
});

describe("catalog keys", () => {
	test("a state references every row once, sorted by table then id", () => {
		expect(customerStateToCatalogKeys({ state })).toEqual([
			{ table: "entitlements", id: "ent_1" },
			{ table: "entitlements", id: "ent_2" },
			{ table: "features", id: "feat_internal_1" },
			{ table: "products", id: "prod_internal_1" },
		]);
		expect(
			customerStateToCatalogKeys({ state: createCustomerState({ identity }) }),
		).toEqual([]);
	});

	test("a row is keyed by id for entitlements and internal_id otherwise", () => {
		expect(catalogRowToCatalogKey({ row: entitlementRow("ent_1") })).toEqual({
			table: "entitlements",
			id: "ent_1",
		});
		expect(catalogRowToCatalogKey({ row: featureRow })).toEqual({
			table: "features",
			id: "feat_internal_1",
		});
		expect(
			catalogKeyToString({ key: catalogRowToCatalogKey({ row: productRow }) }),
		).toBe("products:prod_internal_1");
	});
});

describe("catalog from rows", () => {
	const catalog = catalogRowsToCatalog({
		rows: [entitlementRow("ent_1"), featureRow],
	});

	test("keys each table for lookup and round-trips through JSON", () => {
		expect(Object.keys(catalog.entitlements)).toEqual(["ent_1"]);
		expect(Object.keys(catalog.features)).toEqual(["feat_internal_1"]);
		expect(catalog.products).toEqual({});
		expect(
			catalogRowsToCatalog({
				rows: JSON.parse(JSON.stringify([entitlementRow("ent_1"), featureRow])),
			}),
		).toEqual(catalog);
	});

	test("names only the referenced rows the catalog lacks", () => {
		expect(
			filterCatalogKeysMissingFrom({
				keys: customerStateToCatalogKeys({ state }),
				catalog,
			}),
		).toEqual([
			{ table: "entitlements", id: "ent_2" },
			{ table: "products", id: "prod_internal_1" },
		]);
		expect(
			filterCatalogKeysMissingFrom({
				keys: customerStateToCatalogKeys({ state }),
				catalog: catalogRowsToCatalog({
					rows: [
						entitlementRow("ent_1"),
						entitlementRow("ent_2"),
						featureRow,
						productRow,
					],
				}),
			}),
		).toEqual([]);
	});

	test("finds a feature by its public id", () => {
		expect(
			findFeatureById({ catalog, featureId: "api_calls" })?.internal_id,
		).toBe("feat_internal_1");
		expect(
			findFeatureById({ catalog, featureId: "constructor" }),
		).toBeUndefined();
	});
});
