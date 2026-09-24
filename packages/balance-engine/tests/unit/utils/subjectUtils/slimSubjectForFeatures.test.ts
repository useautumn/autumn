import { describe, expect, test } from "bun:test";
import { AppEnv, FeatureType } from "@autumn/shared";
import {
	type CatalogRow,
	catalogRowsToCatalog,
	createSubjectState,
	slimSubjectForFeatures,
	subjectStateToFullSubject,
} from "../../../../src/balanceEngine.js";
import {
	createCatalogRowsFor,
	createCustomerEntitlement,
	createCustomerProduct,
	identity,
	occurredAt,
} from "../../engineFixtures.js";

/** A credit system whose schema funds `messages`; every other fixture feature is metered. */
const creditsFeatureRow: CatalogRow = {
	table: "features",
	row: {
		internal_id: "feat_credits",
		org_id: identity.orgId,
		created_at: occurredAt,
		env: AppEnv.Sandbox,
		id: "credits",
		name: "credits",
		type: FeatureType.CreditSystem,
		config: {
			schema: [
				{ metered_feature_id: "messages", feature_amount: 1, credit_amount: 2 },
			],
		},
		archived: false,
		event_names: [],
	},
};

function createFixture() {
	const messages = createCustomerEntitlement({
		id: "messages_monthly",
		featureId: "messages",
	});
	const credits = createCustomerEntitlement({
		id: "credits_monthly",
		featureId: "credits",
	});
	const seats = createCustomerEntitlement({
		id: "seats_monthly",
		featureId: "seats",
	});
	const storage = createCustomerEntitlement({
		id: "storage_monthly",
		featureId: "storage",
	});
	const state = createSubjectState({
		identity,
		customerProducts: [createCustomerProduct()],
		customerEntitlements: [messages, credits, seats, storage],
		replaceables: [
			{
				id: "rp_seats",
				cus_ent_id: seats.id,
				created_at: occurredAt,
				from_entity_id: null,
				delete_next_cycle: false,
			},
			{
				id: "rp_messages",
				cus_ent_id: messages.id,
				created_at: occurredAt,
				from_entity_id: "ent_1",
				delete_next_cycle: true,
			},
		],
		rollovers: [
			{
				id: "ro_messages",
				cus_ent_id: messages.id,
				balance: 5,
				usage: 0,
				expires_at: occurredAt + 1,
				entities: {},
			},
			{
				id: "ro_seats",
				cus_ent_id: seats.id,
				balance: 5,
				usage: 0,
				expires_at: occurredAt + 1,
				entities: {},
			},
		],
	});
	// The fixture's feature rows are metered; the credit system's row replaces its generated one.
	const rows = createCatalogRowsFor({ state }).filter(
		(row) =>
			!(row.table === "features" && row.row.internal_id === "feat_credits"),
	);
	const catalog = catalogRowsToCatalog({ rows: [...rows, creditsFeatureRow] });
	return { state, catalog, messages, credits, seats, storage };
}

describe("slimSubjectForFeatures", () => {
	test("keeps the feature's rows and the credit system funding it, drops the rest", () => {
		const { state, catalog, messages, credits } = createFixture();
		const slim = slimSubjectForFeatures({
			state,
			catalog,
			featureIds: ["messages"],
		});

		expect(slim.state.customerEntitlements.map((row) => row.id)).toEqual([
			messages.id,
			credits.id,
		]);
		expect(slim.state.rollovers.map((row) => row.id)).toEqual(["ro_messages"]);
		// Replaceables belong to a row too; a dropped row's seats go with it.
		expect(slim.state.replaceables.map((row) => row.id)).toEqual([
			"rp_messages",
		]);
		expect(Object.keys(slim.catalog.entitlements).sort()).toEqual(
			[messages.entitlement_id, credits.entitlement_id].sort(),
		);
		expect(Object.keys(slim.catalog.features).sort()).toEqual([
			"feat_credits",
			"feat_messages",
		]);
		// The customer's own row and its products are what the server still needs untouched.
		expect(slim.state.customer).toBe(state.customer);
		expect(slim.state.customerProducts).toEqual(state.customerProducts);
		expect(slim.catalog.products).toEqual(catalog.products);
		expect(slim.state.revision).toBe(state.revision);
	});

	test("a slimmed reply still joins into the same view of the kept feature", () => {
		const { state, catalog } = createFixture();
		const slim = slimSubjectForFeatures({
			state,
			catalog,
			featureIds: ["seats"],
		});
		const full = subjectStateToFullSubject({ state, catalog });
		const view = subjectStateToFullSubject(slim);

		const seatsOf = (subject: typeof full) =>
			subject.customer_products[0]?.customer_entitlements.find(
				(row) => row.entitlement.feature.id === "seats",
			);
		expect(seatsOf(view)).toEqual(seatsOf(full));
		expect(view.customer_products[0]?.customer_entitlements).toHaveLength(1);
	});

	test("several features keep the union of their rows", () => {
		const { state, catalog } = createFixture();
		const slim = slimSubjectForFeatures({
			state,
			catalog,
			featureIds: ["seats", "storage"],
		});
		expect(slim.state.customerEntitlements.map((row) => row.id)).toEqual([
			"seats_monthly",
			"storage_monthly",
		]);
	});

	test("an unknown feature keeps no entitlement rows but the customer itself", () => {
		const { state, catalog } = createFixture();
		const slim = slimSubjectForFeatures({
			state,
			catalog,
			featureIds: ["nope"],
		});
		expect(slim.state.customerEntitlements).toEqual([]);
		expect(slim.state.customer).toBe(state.customer);
		expect(Object.keys(slim.catalog.products)).toHaveLength(1);
	});

	test("a row whose catalog rows are missing is kept rather than guessed about", () => {
		const { state, catalog } = createFixture();
		const { feat_storage: _dropped, ...features } = catalog.features;
		const slim = slimSubjectForFeatures({
			state,
			catalog: { ...catalog, features },
			featureIds: ["seats"],
		});
		expect(slim.state.customerEntitlements.map((row) => row.id)).toEqual([
			"seats_monthly",
			"storage_monthly",
		]);
	});
});
