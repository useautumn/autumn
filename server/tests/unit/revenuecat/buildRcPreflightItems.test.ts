/**
 * Unit tests for buildRcPreflightItems — the read-only sync preview. Per plan it
 * matches the minted store id (autumn.{env}.{org}.{planId}) to an RC product and
 * reports Autumn's base price vs RC's, so the sheet can show Create/Rename + price
 * mismatch. No network/DB: listPrices is injected.
 */

import {
	AppEnv,
	BillingInterval,
	type FullProduct,
	type Organization,
	type Price,
	PriceType,
} from "@autumn/shared";
import { expect, test } from "bun:test";
import chalk from "chalk";
import { buildRcPreflightItems } from "@/external/revenueCat/handlers/handlePreflightRevenueCatSync.js";
import type { RevenueCatProduct } from "@/external/revenueCat/revenuecatTypes.js";

const org = { id: "org_1", default_currency: "usd" } as unknown as Organization;
const env = AppEnv.Sandbox;
const storeId = (planId: string) => `autumn.${env}.${org.id}.${planId}`;

const fixed = (amount: number): Price =>
	({
		config: {
			type: PriceType.Fixed,
			amount,
			interval: BillingInterval.Month,
			interval_count: 1,
		},
	}) as unknown as Price;

const product = (id: string, name: string, prices: Price[] = [fixed(4.99)]): FullProduct =>
	({ id, name, prices }) as unknown as FullProduct;

const rcProduct = (
	storeIdentifier: string,
	display_name: string,
	id = "prod_x",
): RevenueCatProduct =>
	({ id, store_identifier: storeIdentifier, display_name }) as RevenueCatProduct;

test(`${chalk.yellowBright("preflight: plan with no RC product -> Create (rc_exists false)")}`, async () => {
	const [item] = await buildRcPreflightItems({
		products: [product("pro", "Pro")],
		rcProducts: [],
		org,
		env,
		listPrices: async () => [],
	});

	expect(item.rc_exists).toBe(false);
	expect(item.rc_name).toBeNull();
	expect(item.autumn_price).toEqual({ amount_micros: 4_990_000, currency: "USD" });
});

test(`${chalk.yellowBright("preflight: matching RC product surfaces name + price for rename/mismatch checks")}`, async () => {
	const [item] = await buildRcPreflightItems({
		products: [product("pro", "Pro")],
		rcProducts: [rcProduct(storeId("pro"), "Old Name", "prod_1")],
		org,
		env,
		// RC price differs from Autumn's 4.99 -> a mismatch the sheet flags
		listPrices: async (id) =>
			id === "prod_1" ? [{ id: "prc1", amount_micros: 5_990_000, currency: "USD" }] : [],
	});

	expect(item.rc_exists).toBe(true);
	expect(item.rc_name).toBe("Old Name");
	expect(item.autumn_price).toEqual({ amount_micros: 4_990_000, currency: "USD" });
	expect(item.rc_price).toEqual({ amount_micros: 5_990_000, currency: "USD" });
});

test(`${chalk.yellowBright("preflight: RC product without a price -> rc_price null")}`, async () => {
	const [item] = await buildRcPreflightItems({
		products: [product("pro", "Pro")],
		rcProducts: [rcProduct(storeId("pro"), "Pro", "prod_2")],
		org,
		env,
		listPrices: async () => [],
	});

	expect(item.rc_exists).toBe(true);
	expect(item.rc_name).toBe("Pro");
	expect(item.rc_price).toBeNull();
});

test(`${chalk.yellowBright("preflight: only the first RC product per store id is priced (one price fetch)")}`, async () => {
	let priceCalls = 0;
	const items = await buildRcPreflightItems({
		products: [product("pro", "Pro")],
		// two apps share the same minted store id
		rcProducts: [
			rcProduct(storeId("pro"), "Pro", "prod_ios"),
			rcProduct(storeId("pro"), "Pro", "prod_android"),
		],
		org,
		env,
		listPrices: async () => {
			priceCalls += 1;
			return [{ id: "prc", amount_micros: 4_990_000, currency: "USD" }];
		},
	});

	expect(items).toHaveLength(1);
	expect(priceCalls).toBe(1);
});
