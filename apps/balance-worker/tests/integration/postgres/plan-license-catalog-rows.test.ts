import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { getCatalogRows, type PostgresClient } from "@autumn/postgres";
import { schemas } from "@autumn/shared";
import { sql } from "drizzle-orm";
import {
	openFixturePostgres,
	readWorktreeDatabaseUrl,
} from "./postgresCustomerFixture.js";

const databaseUrl = readWorktreeDatabaseUrl();

/**
 * One org's license catalog, plus one plan license in another env and one in another org.
 * Ids sort in the order the lookup must return them.
 */
const seedLicenseCatalog = async ({
	postgres,
}: {
	postgres: PostgresClient;
}) => {
	const { db } = postgres;
	const suffix = crypto.randomUUID().slice(0, 8);
	const id = (name: string) => `${name}_${suffix}`;
	const orgId = id("org_license");
	const otherOrgId = id("org_other");
	const ids = {
		orgId,
		otherOrgId,
		parentProduct: id("prod_parent"),
		licenseProduct: id("prod_license"),
		liveLicenseProduct: id("prod_license_live"),
		otherOrgLicenseProduct: id("prod_license_other_org"),
		emptyLicenseProduct: id("prod_license_empty"),
		featureA: id("feat_a"),
		featureB: id("feat_b"),
		basePrice1: id("price_1_base"),
		basePrice2: id("price_2_base"),
		customPrice: id("price_3_custom"),
		livePrice: id("price_4_live"),
		baseEntitlement1: id("ent_1_base"),
		baseEntitlement2: id("ent_2_base"),
		baseEntitlement3: id("ent_3_base"),
		customEntitlement: id("ent_4_custom"),
		// Named so the returned order (by id) is base, customized, empty-overlay, no-items.
		basePlanLicense: id("pl_1_base"),
		customizedPlanLicense: id("pl_2_customized"),
		emptyOverlayPlanLicense: id("pl_3_empty_overlay"),
		noItemsPlanLicense: id("pl_4_no_items"),
		livePlanLicense: id("pl_5_live"),
		otherOrgPlanLicense: id("pl_6_other_org"),
	};

	for (const org of [orgId, otherOrgId]) {
		await db.insert(schemas.organizations).values({
			id: org,
			slug: org,
			name: org,
			createdAt: new Date(),
		});
	}
	for (const [internalId, featureId, org] of [
		[ids.featureA, "messages", orgId],
		[ids.featureB, "seats", orgId],
	] as const) {
		await db.execute(sql`INSERT INTO features (internal_id, id, org_id, env, name, type, created_at)
			VALUES (${internalId}, ${featureId}, ${org}, 'sandbox', ${featureId}, 'metered', 0)`);
	}
	for (const [internalId, org, env] of [
		[ids.parentProduct, orgId, "sandbox"],
		[ids.licenseProduct, orgId, "sandbox"],
		[ids.emptyLicenseProduct, orgId, "sandbox"],
		[ids.liveLicenseProduct, orgId, "live"],
		[ids.otherOrgLicenseProduct, otherOrgId, "sandbox"],
	] as const) {
		await db.execute(sql`INSERT INTO products (internal_id, id, org_id, env, name, created_at)
			VALUES (${internalId}, ${internalId}, ${org}, ${env}, ${internalId}, 0)`);
	}

	const price = ({
		priceId,
		productId,
		isCustom,
	}: {
		priceId: string;
		productId: string;
		isCustom: boolean;
	}) =>
		db.execute(sql`INSERT INTO prices (id, org_id, internal_product_id, config, created_at, is_custom)
			VALUES (${priceId}, ${orgId}, ${productId}, ${JSON.stringify({ type: "fixed", amount: 10, interval: "month" })}::jsonb, 0, ${isCustom})`);
	await price({
		priceId: ids.basePrice1,
		productId: ids.licenseProduct,
		isCustom: false,
	});
	await price({
		priceId: ids.basePrice2,
		productId: ids.licenseProduct,
		isCustom: false,
	});
	await price({
		priceId: ids.customPrice,
		productId: ids.licenseProduct,
		isCustom: true,
	});
	await price({
		priceId: ids.livePrice,
		productId: ids.liveLicenseProduct,
		isCustom: false,
	});

	const entitlement = ({
		entitlementId,
		featureInternalId,
		isCustom,
	}: {
		entitlementId: string;
		featureInternalId: string;
		isCustom: boolean;
	}) =>
		db.execute(sql`INSERT INTO entitlements (id, org_id, internal_feature_id, internal_product_id, feature_id, created_at, allowance_type, allowance, interval, is_custom)
			VALUES (${entitlementId}, ${orgId}, ${featureInternalId}, ${ids.licenseProduct}, 'messages', 0, 'fixed', 5, 'month', ${isCustom})`);
	// Two base entitlements share feature A: its id is named once.
	await entitlement({
		entitlementId: ids.baseEntitlement1,
		featureInternalId: ids.featureA,
		isCustom: false,
	});
	await entitlement({
		entitlementId: ids.baseEntitlement2,
		featureInternalId: ids.featureA,
		isCustom: false,
	});
	await entitlement({
		entitlementId: ids.baseEntitlement3,
		featureInternalId: ids.featureB,
		isCustom: false,
	});
	await entitlement({
		entitlementId: ids.customEntitlement,
		featureInternalId: ids.featureB,
		isCustom: true,
	});

	const planLicense = ({
		planLicenseId,
		licenseProductId,
		isCustom,
		customized,
	}: {
		planLicenseId: string;
		licenseProductId: string;
		isCustom: boolean;
		customized: boolean;
	}) =>
		db.execute(sql`INSERT INTO plan_license (id, parent_internal_product_id, license_internal_product_id, is_custom, included, prepaid_only, customized, metadata, created_at, updated_at)
			VALUES (${planLicenseId}, ${ids.parentProduct}, ${licenseProductId}, ${isCustom}, 3, false, ${customized}, '{"note":"kept"}'::jsonb, 1700000000000, 1700000000001)`);
	await planLicense({
		planLicenseId: ids.basePlanLicense,
		licenseProductId: ids.licenseProduct,
		isCustom: false,
		customized: false,
	});
	await planLicense({
		planLicenseId: ids.customizedPlanLicense,
		licenseProductId: ids.licenseProduct,
		isCustom: true,
		customized: true,
	});
	await planLicense({
		planLicenseId: ids.emptyOverlayPlanLicense,
		licenseProductId: ids.licenseProduct,
		isCustom: true,
		customized: true,
	});
	await planLicense({
		planLicenseId: ids.noItemsPlanLicense,
		licenseProductId: ids.emptyLicenseProduct,
		isCustom: false,
		customized: false,
	});
	await planLicense({
		planLicenseId: ids.livePlanLicense,
		licenseProductId: ids.liveLicenseProduct,
		isCustom: false,
		customized: false,
	});
	await planLicense({
		planLicenseId: ids.otherOrgPlanLicense,
		licenseProductId: ids.otherOrgLicenseProduct,
		isCustom: false,
		customized: false,
	});

	const overlay = async ({
		planLicenseId,
		priceIds,
		entitlementIds,
	}: {
		planLicenseId: string;
		priceIds: string[];
		entitlementIds: string[];
	}) => {
		for (const priceId of priceIds) {
			await db.execute(sql`INSERT INTO license_prices (id, plan_license_id, price_id)
				VALUES (${`lp_${planLicenseId}_${priceId}`}, ${planLicenseId}, ${priceId})`);
		}
		for (const entitlementId of entitlementIds) {
			await db.execute(sql`INSERT INTO license_entitlements (id, plan_license_id, entitlement_id)
				VALUES (${`le_${planLicenseId}_${entitlementId}`}, ${planLicenseId}, ${entitlementId})`);
		}
	};
	await overlay({
		planLicenseId: ids.customizedPlanLicense,
		priceIds: [ids.customPrice],
		entitlementIds: [ids.customEntitlement, ids.baseEntitlement1],
	});
	// Leftover overlay rows on a link that is not customized: the base items win.
	await overlay({
		planLicenseId: ids.basePlanLicense,
		priceIds: [ids.customPrice],
		entitlementIds: [ids.customEntitlement],
	});

	const cleanup = async () => {
		await db.execute(
			sql`DELETE FROM plan_license WHERE parent_internal_product_id = ${ids.parentProduct}`,
		);
		for (const org of [orgId, otherOrgId]) {
			await db.execute(sql`DELETE FROM prices WHERE org_id = ${org}`);
			await db.execute(sql`DELETE FROM entitlements WHERE org_id = ${org}`);
			await db.execute(sql`DELETE FROM products WHERE org_id = ${org}`);
			await db.execute(sql`DELETE FROM features WHERE org_id = ${org}`);
			await db.execute(sql`DELETE FROM organizations WHERE id = ${org}`);
		}
	};
	return { ids, cleanup };
};

type SeededLicenseCatalog = Awaited<ReturnType<typeof seedLicenseCatalog>>;

const noOtherIds = {
	entitlementIds: [],
	productInternalIds: [],
	featureInternalIds: [],
	priceIds: [],
	freeTrialIds: [],
};

describe.skipIf(!databaseUrl)("plan license catalog rows", () => {
	let postgres: PostgresClient;
	let seeded: SeededLicenseCatalog;

	beforeAll(async () => {
		if (!databaseUrl) throw new Error("No worktree DATABASE_URL");
		postgres = openFixturePostgres({ databaseUrl });
		seeded = await seedLicenseCatalog({ postgres });
	});

	afterAll(async () => {
		await seeded?.cleanup();
		await postgres?.close();
	});

	const readPlanLicenses = async ({
		planLicenseIds,
		env = "sandbox",
		orgId = seeded.ids.orgId,
	}: {
		planLicenseIds: string[];
		env?: string;
		orgId?: string;
	}) => {
		const envelope = await getCatalogRows({
			ctx: { db: postgres.db, orgId, env },
			ids: { ...noOtherIds, planLicenseIds },
		});
		return envelope.plan_licenses;
	};

	const itemsOf = ({
		price_ids,
		entitlement_ids,
		internal_feature_ids,
	}: {
		price_ids: string[];
		entitlement_ids: string[];
		internal_feature_ids: string[];
	}) => ({ price_ids, entitlement_ids, internal_feature_ids });

	test("a link that is not customized is made of its license product's base items; leftover overlay rows are ignored", async () => {
		const { ids } = seeded;
		const [row] = await readPlanLicenses({
			planLicenseIds: [ids.basePlanLicense],
		});

		expect(row && itemsOf(row)).toEqual({
			price_ids: [ids.basePrice1, ids.basePrice2],
			entitlement_ids: [
				ids.baseEntitlement1,
				ids.baseEntitlement2,
				ids.baseEntitlement3,
			],
			internal_feature_ids: [ids.featureA, ids.featureB],
		});
	});

	test("a customized link is made of exactly its overlay's items, custom rows included", async () => {
		const { ids } = seeded;
		const [row] = await readPlanLicenses({
			planLicenseIds: [ids.customizedPlanLicense],
		});

		expect(row && itemsOf(row)).toEqual({
			price_ids: [ids.customPrice],
			entitlement_ids: [ids.baseEntitlement1, ids.customEntitlement],
			internal_feature_ids: [ids.featureA, ids.featureB],
		});
	});

	test("a customized link with an empty overlay has no items, never the base ones", async () => {
		const { ids } = seeded;
		const [emptyOverlay] = await readPlanLicenses({
			planLicenseIds: [ids.emptyOverlayPlanLicense],
		});
		const [noItems] = await readPlanLicenses({
			planLicenseIds: [ids.noItemsPlanLicense],
		});

		const none = {
			price_ids: [],
			entitlement_ids: [],
			internal_feature_ids: [],
		};
		expect(emptyOverlay && itemsOf(emptyOverlay)).toEqual(none);
		expect(noItems && itemsOf(noItems)).toEqual(none);
	});

	test("the row carries every plan_license column as stored", async () => {
		const { ids } = seeded;
		const [row] = await readPlanLicenses({
			planLicenseIds: [ids.customizedPlanLicense],
		});

		expect(row).toEqual({
			id: ids.customizedPlanLicense,
			parent_internal_product_id: ids.parentProduct,
			license_internal_product_id: ids.licenseProduct,
			org_id: ids.orgId,
			env: "sandbox",
			is_custom: true,
			included: 3,
			prepaid_only: false,
			customized: true,
			metadata: { note: "kept" },
			created_at: 1_700_000_000_000,
			updated_at: 1_700_000_000_001,
			price_ids: [ids.customPrice],
			entitlement_ids: [ids.baseEntitlement1, ids.customEntitlement],
			internal_feature_ids: [ids.featureA, ids.featureB],
		});
	});

	test("one lookup serves many links in id order, scoped to the org and env of the license product", async () => {
		const { ids } = seeded;
		const everyId = [
			ids.otherOrgPlanLicense,
			ids.livePlanLicense,
			ids.noItemsPlanLicense,
			ids.emptyOverlayPlanLicense,
			ids.customizedPlanLicense,
			ids.basePlanLicense,
			"pl_does_not_exist",
		];

		const sandbox = await readPlanLicenses({ planLicenseIds: everyId });
		const live = await readPlanLicenses({
			planLicenseIds: everyId,
			env: "live",
		});
		const otherOrg = await readPlanLicenses({
			planLicenseIds: everyId,
			orgId: ids.otherOrgId,
		});

		expect(sandbox.map(({ id }) => id)).toEqual([
			ids.basePlanLicense,
			ids.customizedPlanLicense,
			ids.emptyOverlayPlanLicense,
			ids.noItemsPlanLicense,
		]);
		expect(live.map(({ id }) => id)).toEqual([ids.livePlanLicense]);
		expect(live[0]?.price_ids).toEqual([ids.livePrice]);
		expect(otherOrg.map(({ id }) => id)).toEqual([ids.otherOrgPlanLicense]);
	});

	test("plan licenses come back beside the other tables in the same statement", async () => {
		const { ids } = seeded;
		const envelope = await getCatalogRows({
			ctx: { db: postgres.db, orgId: ids.orgId, env: "sandbox" },
			ids: {
				entitlementIds: [ids.customEntitlement],
				productInternalIds: [ids.licenseProduct],
				featureInternalIds: [ids.featureB],
				priceIds: [ids.customPrice],
				planLicenseIds: [ids.customizedPlanLicense],
				freeTrialIds: [],
			},
		});

		expect({
			entitlements: envelope.entitlements.map(({ id }) => id),
			products: envelope.products.map(({ internal_id }) => internal_id),
			features: envelope.features.map(({ internal_id }) => internal_id),
			prices: envelope.prices.map(({ id }) => id),
			planLicenses: envelope.plan_licenses.map(({ id }) => id),
		}).toEqual({
			entitlements: [ids.customEntitlement],
			products: [ids.licenseProduct],
			features: [ids.featureB],
			prices: [ids.customPrice],
			planLicenses: [ids.customizedPlanLicense],
		});
	});
});
