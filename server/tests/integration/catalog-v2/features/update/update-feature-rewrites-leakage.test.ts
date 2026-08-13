/**
 * catalogV2.execute — feature reference batch UPDATEs must not leak across
 * org/env. Same public feature.id in a decoy org or env must stay untouched
 * (entitlements via features join; prices via org_id + internal_feature_id).
 */

import { afterAll, describe, expect, it } from "bun:test";
import {
	AllowanceType,
	AppEnv,
	BillWhen,
	BillingInterval,
	EntInterval,
	entitlements,
	FeatureType,
	FeatureUsageType,
	features,
	organizations,
	prices,
	products,
} from "@autumn/shared";
import { eq, inArray, sql } from "drizzle-orm";
import { initDrizzle } from "@/db/initDrizzle.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { UpdateFeaturePlan } from "@/internal/catalogV2/actions/updateCatalog/types/updateFeaturePlan.js";
import { executeFeatureReferenceRewrites } from "@/internal/catalogV2/execute/executeFeatureReferenceRewrites.js";

const { db, client } = initDrizzle();

const runId = `cv2_rw_${Date.now()}`;
const publicFeatureId = `${runId}_feat`;
const renamedFeatureId = `${runId}_feat_renamed`;

const targetOrgId = `${runId}_org_a`;
const decoyOrgId = `${runId}_org_b`;

type ScopeKey = "target" | "decoyOrg" | "decoyEnv";

type FixtureScope = {
	key: ScopeKey;
	orgId: string;
	env: AppEnv;
	internalFeatureId: string;
	internalProductId: string;
	grantingEntId: string;
	entityEntId: string;
	priceId: string;
	carrierFeatureInternalId: string;
};

const scopes: Record<ScopeKey, FixtureScope> = {
	target: {
		key: "target",
		orgId: targetOrgId,
		env: AppEnv.Sandbox,
		internalFeatureId: `${runId}_fe_target`,
		internalProductId: `${runId}_prod_target`,
		grantingEntId: `${runId}_ent_g_target`,
		entityEntId: `${runId}_ent_e_target`,
		priceId: `${runId}_pr_target`,
		carrierFeatureInternalId: `${runId}_fe_carrier_target`,
	},
	decoyOrg: {
		key: "decoyOrg",
		orgId: decoyOrgId,
		env: AppEnv.Sandbox,
		internalFeatureId: `${runId}_fe_decoy_org`,
		internalProductId: `${runId}_prod_decoy_org`,
		grantingEntId: `${runId}_ent_g_decoy_org`,
		entityEntId: `${runId}_ent_e_decoy_org`,
		priceId: `${runId}_pr_decoy_org`,
		carrierFeatureInternalId: `${runId}_fe_carrier_decoy_org`,
	},
	decoyEnv: {
		key: "decoyEnv",
		orgId: targetOrgId,
		env: AppEnv.Live,
		internalFeatureId: `${runId}_fe_decoy_env`,
		internalProductId: `${runId}_prod_decoy_env`,
		grantingEntId: `${runId}_ent_g_decoy_env`,
		entityEntId: `${runId}_ent_e_decoy_env`,
		priceId: `${runId}_pr_decoy_env`,
		carrierFeatureInternalId: `${runId}_fe_carrier_decoy_env`,
	},
};

const meteredFeature = ({
	internalId,
	orgId,
	env,
}: {
	internalId: string;
	orgId: string;
	env: AppEnv;
}) => ({
	internal_id: internalId,
	org_id: orgId,
	env,
	created_at: Date.now(),
	id: publicFeatureId,
	name: "Rewrite Leak Fixture",
	type: FeatureType.Metered,
	config: {
		filters: [],
		aggregate: { type: "sum", property: "value" },
		usage_type: FeatureUsageType.Single,
	},
	archived: false,
	event_names: [] as string[],
	model_markups: null,
	display: null,
	stripe_meter: null,
});

const seedScope = async (scope: FixtureScope) => {
	await db.insert(products).values({
		internal_id: scope.internalProductId,
		id: `${scope.key}_prod`,
		org_id: scope.orgId,
		env: scope.env,
		name: `Rewrite ${scope.key}`,
		created_at: Date.now(),
		version: 1,
	});

	await db.insert(features).values([
		meteredFeature({
			internalId: scope.internalFeatureId,
			orgId: scope.orgId,
			env: scope.env,
		}),
		{
			...meteredFeature({
				internalId: scope.carrierFeatureInternalId,
				orgId: scope.orgId,
				env: scope.env,
			}),
			id: `${publicFeatureId}_carrier`,
			name: "Carrier",
		},
	]);

	await db.insert(entitlements).values([
		{
			id: scope.grantingEntId,
			created_at: Date.now(),
			org_id: scope.orgId,
			internal_product_id: scope.internalProductId,
			internal_feature_id: scope.internalFeatureId,
			feature_id: publicFeatureId,
			allowance_type: AllowanceType.Fixed,
			allowance: 10,
			interval: EntInterval.Month,
			interval_count: 1,
			entity_feature_id: null,
		},
		{
			id: scope.entityEntId,
			created_at: Date.now(),
			org_id: scope.orgId,
			internal_product_id: scope.internalProductId,
			internal_feature_id: scope.carrierFeatureInternalId,
			feature_id: `${publicFeatureId}_carrier`,
			allowance_type: AllowanceType.Fixed,
			allowance: 1,
			interval: EntInterval.Month,
			interval_count: 1,
			entity_feature_id: publicFeatureId,
		},
	]);

	await db.insert(prices).values({
		id: scope.priceId,
		org_id: scope.orgId,
		internal_product_id: scope.internalProductId,
		created_at: Date.now(),
		config: {
			type: "usage",
			bill_when: BillWhen.EndOfPeriod,
			billing_units: 1,
			internal_feature_id: scope.internalFeatureId,
			feature_id: publicFeatureId,
			usage_tiers: [{ to: "inf", amount: 1 }],
			interval: BillingInterval.Month,
			interval_count: 1,
			should_prorate: false,
			stripe_price_id: `price_stub_${scope.key}`,
		},
	});
};

const cleanup = async () => {
	const orgIds = [targetOrgId, decoyOrgId];
	await db.execute(sql`
		DELETE FROM prices WHERE org_id IN (${sql.join(
			orgIds.map((id) => sql`${id}`),
			sql`, `,
		)})
	`);
	await db.execute(sql`
		DELETE FROM entitlements WHERE org_id IN (${sql.join(
			orgIds.map((id) => sql`${id}`),
			sql`, `,
		)})
	`);
	await db
		.delete(features)
		.where(inArray(features.org_id, orgIds));
	await db
		.delete(products)
		.where(inArray(products.org_id, orgIds));
	await db
		.delete(organizations)
		.where(inArray(organizations.id, orgIds));
};

const targetCtx = (): AutumnContext =>
	({
		db,
		org: { id: targetOrgId },
		env: AppEnv.Sandbox,
	}) as AutumnContext;

const idRenamePlan = (): UpdateFeaturePlan => {
	const current = meteredFeature({
		internalId: scopes.target.internalFeatureId,
		orgId: targetOrgId,
		env: AppEnv.Sandbox,
	});
	return {
		current,
		next: { ...current, id: renamedFeatureId },
		previousAttributes: { id: publicFeatureId },
		hasCustomerEntitlements: false,
		regenerateDisplay: false,
		clearCreditSystemCache: false,
		rewrites: {
			typeChange: null,
			idChange: { fromId: publicFeatureId, toId: renamedFeatureId },
			usageTypeChange: null,
			updateCreditSystemSchemas: [],
		},
	};
};

const fetchEnt = async (id: string) => {
	const [row] = await db
		.select()
		.from(entitlements)
		.where(eq(entitlements.id, id))
		.limit(1);
	return row;
};

const fetchPrice = async (id: string) => {
	const [row] = await db
		.select()
		.from(prices)
		.where(eq(prices.id, id))
		.limit(1);
	return row;
};

afterAll(async () => {
	if (!process.env.DATABASE_URL) return;
	await cleanup();
	await client.end();
});

describe.skipIf(!process.env.DATABASE_URL)(
	"executeFeatureReferenceRewrites isolation",
	() => {
		it("seeds target + decoy org + decoy env fixtures", async () => {
			await db.insert(organizations).values([
				{
					id: targetOrgId,
					slug: `${runId}-a`,
					name: "Rewrite Target",
					logo: "",
					createdAt: new Date(),
					metadata: "",
				},
				{
					id: decoyOrgId,
					slug: `${runId}-b`,
					name: "Rewrite Decoy",
					logo: "",
					createdAt: new Date(),
					metadata: "",
				},
			]);
			await seedScope(scopes.target);
			await seedScope(scopes.decoyOrg);
			await seedScope(scopes.decoyEnv);
		});

		it("id rename updates only target org+env entitlements and prices", async () => {
			await executeFeatureReferenceRewrites({
				ctx: targetCtx(),
				updateFeaturePlan: idRenamePlan(),
			});

			const targetGranting = await fetchEnt(scopes.target.grantingEntId);
			const targetEntity = await fetchEnt(scopes.target.entityEntId);
			const targetPrice = await fetchPrice(scopes.target.priceId);
			expect(targetGranting?.feature_id).toBe(renamedFeatureId);
			expect(targetEntity?.entity_feature_id).toBe(renamedFeatureId);
			expect(
				(targetPrice?.config as { feature_id?: string } | null)?.feature_id,
			).toBe(renamedFeatureId);

			for (const key of ["decoyOrg", "decoyEnv"] as const) {
				const granting = await fetchEnt(scopes[key].grantingEntId);
				const entity = await fetchEnt(scopes[key].entityEntId);
				const price = await fetchPrice(scopes[key].priceId);
				expect(granting?.feature_id).toBe(publicFeatureId);
				expect(entity?.entity_feature_id).toBe(publicFeatureId);
				expect(
					(price?.config as { feature_id?: string } | null)?.feature_id,
				).toBe(publicFeatureId);
				expect(
					(price?.config as { stripe_price_id?: string } | null)
						?.stripe_price_id,
				).toBe(`price_stub_${key}`);
			}
		});

		it("usage-type rewrite updates only target prices/ents", async () => {
			// Reset target granting interval + price flags after rename test
			await db
				.update(entitlements)
				.set({ interval: EntInterval.Month })
				.where(eq(entitlements.id, scopes.target.grantingEntId));
			await db.execute(sql`
				UPDATE prices
				SET config = jsonb_set(
					jsonb_set(config, '{should_prorate}', 'false'::jsonb, true),
					'{stripe_price_id}',
					to_jsonb(${`price_stub_target`}::text),
					true
				)
				WHERE id = ${scopes.target.priceId}
			`);

			const current = meteredFeature({
				internalId: scopes.target.internalFeatureId,
				orgId: targetOrgId,
				env: AppEnv.Sandbox,
			});
			await executeFeatureReferenceRewrites({
				ctx: targetCtx(),
				updateFeaturePlan: {
					current,
					next: {
						...current,
						config: {
							...current.config,
							usage_type: FeatureUsageType.Continuous,
						},
					},
					previousAttributes: { consumable: true },
					hasCustomerEntitlements: false,
					regenerateDisplay: false,
					clearCreditSystemCache: false,
					rewrites: {
						typeChange: null,
						idChange: null,
						usageTypeChange: {
							nextUsageType: FeatureUsageType.Continuous,
						},
						updateCreditSystemSchemas: [],
					},
				},
			});

			const targetGranting = await fetchEnt(scopes.target.grantingEntId);
			const targetPrice = await fetchPrice(scopes.target.priceId);
			expect(targetGranting?.interval).toBe(EntInterval.Lifetime);
			expect(
				(targetPrice?.config as { should_prorate?: boolean } | null)
					?.should_prorate,
			).toBe(true);
			expect(
				(targetPrice?.config as { stripe_price_id?: string | null } | null)
					?.stripe_price_id,
			).toBeNull();

			for (const key of ["decoyOrg", "decoyEnv"] as const) {
				const granting = await fetchEnt(scopes[key].grantingEntId);
				const price = await fetchPrice(scopes[key].priceId);
				expect(granting?.interval).toBe(EntInterval.Month);
				expect(
					(price?.config as { should_prorate?: boolean } | null)
						?.should_prorate,
				).toBe(false);
				expect(
					(price?.config as { stripe_price_id?: string } | null)
						?.stripe_price_id,
				).toBe(`price_stub_${key}`);
			}
		});

		it("type rewrite (metered→boolean) updates only target granting ents", async () => {
			await db
				.update(entitlements)
				.set({
					allowance_type: AllowanceType.Fixed,
					allowance: 10,
					interval: EntInterval.Month,
					entity_feature_id: null,
				})
				.where(eq(entitlements.id, scopes.target.grantingEntId));

			const current = meteredFeature({
				internalId: scopes.target.internalFeatureId,
				orgId: targetOrgId,
				env: AppEnv.Sandbox,
			});
			await executeFeatureReferenceRewrites({
				ctx: targetCtx(),
				updateFeaturePlan: {
					current,
					next: { ...current, type: FeatureType.Boolean, config: null },
					previousAttributes: { type: FeatureType.Metered },
					hasCustomerEntitlements: false,
					regenerateDisplay: false,
					clearCreditSystemCache: false,
					rewrites: {
						typeChange: "metered_to_boolean",
						idChange: null,
						usageTypeChange: null,
						updateCreditSystemSchemas: [],
					},
				},
			});

			const targetGranting = await fetchEnt(scopes.target.grantingEntId);
			expect(targetGranting?.allowance_type).toBeNull();
			expect(targetGranting?.allowance).toBeNull();
			expect(targetGranting?.interval).toBeNull();

			for (const key of ["decoyOrg", "decoyEnv"] as const) {
				const granting = await fetchEnt(scopes[key].grantingEntId);
				expect(granting?.allowance_type).toBe(AllowanceType.Fixed);
				expect(granting?.allowance).toBe(10);
				expect(granting?.interval).toBe(EntInterval.Month);
			}

			// entity_feature_id on decoys (and target carrier) must stay put —
			// metered→boolean only clears entity_feature_id on *granting* rows.
			expect(
				(await fetchEnt(scopes.decoyOrg.entityEntId))?.entity_feature_id,
			).toBe(publicFeatureId);
			expect(
				(await fetchEnt(scopes.decoyEnv.entityEntId))?.entity_feature_id,
			).toBe(publicFeatureId);
		});
	},
);
