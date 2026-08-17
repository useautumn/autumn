import { afterAll, describe, expect, test } from "bun:test";
import {
	AppEnv,
	BillingInterval,
	BillWhen,
	type Organization,
	organizations,
	PriceType,
	ProcessorType,
	prices as pricesTable,
	products as productsTable,
} from "@autumn/shared";
import defaultCtx from "@tests/utils/testInitUtils/createTestContext.js";
import type { User } from "better-auth";
import { and, eq } from "drizzle-orm";
import { initDrizzle } from "@/db/initDrizzle.js";
import { logger } from "@/external/logtail/logtailUtils.js";
import { deletePlatformSubOrg } from "@/internal/orgs/deleteOrg/deletePlatformSubOrg.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { createSandboxForOrg } from "@/internal/sandboxes/createSandbox.js";
import { encryptData } from "@/utils/encryptUtils.js";

// Disconnecting the last Stripe channel clears every catalog mapping in that org/environment.
// Active, archived, versioned, variant, auxiliary, and currency-specific mappings are covered.

const { db } = initDrizzle();
const apiBase = `${(process.env.AUTUMN_TEST_BASE_URL ?? "http://localhost:8080").replace(/\/$/, "")}/v1`;
const createdOrgs: Organization[] = [];

const stripeResourceFields = [
	"stripe_product_id",
	"stripe_price_id",
	"stripe_empty_price_id",
	"stripe_placeholder_price_id",
	"stripe_prepaid_price_v2_id",
	"stripe_meter_id",
	"stripe_event_name",
] as const;

const priceResourceFields = [
	"stripe_price_id",
	"stripe_empty_price_id",
	"stripe_placeholder_price_id",
	"stripe_prepaid_price_v2_id",
] as const;

const mappedUsageConfig = (suffix: string) => ({
	type: PriceType.Usage,
	bill_when: BillWhen.EndOfPeriod,
	billing_units: 1,
	internal_feature_id: `feature_internal_${suffix}`,
	feature_id: `feature_${suffix}`,
	usage_tiers: [{ to: "inf" as const, amount: 1 }],
	interval: BillingInterval.Month,
	stripe_product_id: `prod_${suffix}`,
	stripe_price_id: `price_${suffix}`,
	stripe_empty_price_id: `price_empty_${suffix}`,
	stripe_placeholder_price_id: `price_placeholder_${suffix}`,
	stripe_prepaid_price_v2_id: `price_prepaid_v2_${suffix}`,
	stripe_meter_id: `mtr_${suffix}`,
	stripe_event_name: `event_${suffix}`,
	currencies: {
		eur: {
			amount: 2,
			stripe_price_id: `price_eur_${suffix}`,
			stripe_empty_price_id: `price_empty_eur_${suffix}`,
			stripe_placeholder_price_id: `price_placeholder_eur_${suffix}`,
			stripe_prepaid_price_v2_id: `price_prepaid_v2_eur_${suffix}`,
		},
	},
});

const expectStripeResourcesCleared = (config: Record<string, unknown>) => {
	for (const field of stripeResourceFields) {
		expect(config[field] ?? null).toBeNull();
	}

	const currencies = config.currencies as Record<
		string,
		Record<string, unknown>
	>;
	for (const currencyConfig of Object.values(currencies ?? {})) {
		for (const field of priceResourceFields) {
			expect(currencyConfig[field] ?? null).toBeNull();
		}
	}
};

afterAll(async () => {
	for (const org of createdOrgs) {
		await deletePlatformSubOrg({
			db,
			org,
			logger,
			skipLiveCustomerCheck: true,
		});
	}
});

describe("Stripe disconnect catalog cleanup", () => {
	test("clears every sandbox catalog mapping when the secret key is the last channel", async () => {
		const actorUser = (await db.query.user.findFirst()) as unknown as User;
		const { org, secret_key } = await createSandboxForOrg({
			db,
			masterOrg: defaultCtx.org,
			actorUser,
			name: "QA Disconnect Catalog Mappings",
		});
		createdOrgs.push(org);

		await OrgService.update({
			db,
			orgId: org.id,
			updates: {
				stripe_config: {
					...(org.stripe_config ?? {}),
					test_api_key: encryptData("sk_test_disconnect_catalog"),
				},
			},
		});

		const productRows = [
			{
				internal_id: `${org.id}_plan_v1`,
				id: `${org.id}_plan`,
				name: "Mapped plan v1",
				org_id: org.id,
				env: AppEnv.Sandbox,
				version: 1,
				processor: {
					type: ProcessorType.Stripe,
					id: "prod_plan_v1",
					additional_ids: ["prod_plan_v1_alias"],
				},
			},
			{
				internal_id: `${org.id}_plan_v2`,
				id: `${org.id}_plan`,
				name: "Mapped plan v2",
				org_id: org.id,
				env: AppEnv.Sandbox,
				version: 2,
				processor: {
					type: ProcessorType.Stripe,
					id: "prod_plan_v2",
				},
			},
			{
				internal_id: `${org.id}_variant`,
				id: `${org.id}_variant`,
				name: "Archived mapped variant",
				org_id: org.id,
				env: AppEnv.Sandbox,
				archived: true,
				base_internal_product_id: `${org.id}_plan_v2`,
				processor: {
					type: ProcessorType.Stripe,
					id: "prod_variant",
				},
			},
			{
				internal_id: `${org.id}_live_plan`,
				id: `${org.id}_live_plan`,
				name: "Live mapped plan",
				org_id: org.id,
				env: AppEnv.Live,
				processor: {
					type: ProcessorType.Stripe,
					id: "prod_live",
				},
			},
		];
		await db.insert(productsTable).values(productRows);

		await db.insert(pricesTable).values(
			productRows.map((product, index) => ({
				id: `${org.id}_price_${index}`,
				org_id: org.id,
				internal_product_id: product.internal_id,
				created_at: Date.now(),
				billing_type: "usage_in_arrear",
				config: mappedUsageConfig(`${index}`),
			})),
		);

		await ProductService.listFull({
			db,
			orgId: org.id,
			env: AppEnv.Sandbox,
		});

		const response = await fetch(`${apiBase}/organization/stripe`, {
			method: "DELETE",
			headers: {
				Authorization: `Bearer ${secret_key}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ channel: "secret_key" }),
		});
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({});

		const sandboxProducts = await db.query.products.findMany({
			where: and(
				eq(productsTable.org_id, org.id),
				eq(productsTable.env, AppEnv.Sandbox),
			),
			with: { prices: true },
		});
		expect(sandboxProducts).toHaveLength(3);
		for (const product of sandboxProducts) {
			expect(product.processor).toBeNull();
			for (const price of product.prices) {
				expectStripeResourcesCleared(price.config as Record<string, unknown>);
			}
		}

		const cachedProducts = await ProductService.listFull({
			db,
			orgId: org.id,
			env: AppEnv.Sandbox,
		});
		for (const product of cachedProducts) {
			expect(product.processor).toBeNull();
		}

		const [liveProduct] = await db.query.products.findMany({
			where: and(
				eq(productsTable.org_id, org.id),
				eq(productsTable.env, AppEnv.Live),
			),
			with: { prices: true },
		});
		expect(liveProduct?.processor?.id).toBe("prod_live");
		expect(liveProduct?.prices[0]?.config?.stripe_price_id).toBe("price_3");

		const [updatedOrg] = await db
			.select()
			.from(organizations)
			.where(eq(organizations.id, org.id));
		expect(updatedOrg?.stripe_config?.test_api_key ?? null).toBeNull();
	}, 120_000);
});
