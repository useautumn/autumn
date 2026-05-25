/**
 * Vercel org config display
 *
 * Asserts that `getVercelConfigDisplay` no longer surfaces the legacy
 * `custom_payment_method` field. The frontend `ConfigureVercel.tsx` consumes
 * this object; the field has been removed from the UI but the schema is kept
 * for backwards compat with stored data.
 */

import { describe, expect, test } from "bun:test";
import {
	AppEnv,
	type Organization,
	VercelMarketplaceMode,
} from "@autumn/shared";
import chalk from "chalk";
import { getVercelConfigDisplay } from "@/internal/orgs/handlers/handleVercelConfig";

const baseOrg = (): Organization =>
	({
		id: "org_test",
		slug: "org-test",
		name: "Org Test",
		default_currency: "usd",
		processor_configs: {
			vercel: {
				client_integration_id: "oac_test_live_id_value",
				client_secret: "live_secret_value_abc",
				webhook_url: "https://api.example.com/webhooks/vercel/org_test/live",
				sandbox_client_id: "oac_test_sandbox_id_value",
				sandbox_client_secret: "sandbox_secret_value_abc",
				sandbox_webhook_url:
					"https://api.example.com/webhooks/vercel/org_test/sandbox",
				custom_payment_method: {
					live: "cpmt_live_legacy_value",
					sandbox: "cpmt_sandbox_legacy_value",
				},
				marketplace_mode: VercelMarketplaceMode.Installation,
				allowed_product_ids_live: ["prod_live_a"],
				allowed_product_ids_sandbox: ["prod_sandbox_a"],
			},
		},
		// minimum required Organization shape — anything not relevant for the
		// display function is filled in with sane stubs.
		config: {} as Organization["config"],
		createdAt: new Date(),
	}) as unknown as Organization;

describe(chalk.yellowBright("vercel-config-display"), () => {
	test("hides custom_payment_method while preserving other Vercel fields (sandbox)", () => {
		const display = getVercelConfigDisplay({
			org: baseOrg(),
			env: AppEnv.Sandbox,
		});

		expect(display.custom_payment_method).toBeUndefined();
		expect(display.connected).toBe(true);
		expect(display.client_integration_id).toBeDefined();
		expect(display.client_secret).toBeDefined();
		expect(display.webhook_url).toBeDefined();
		expect(display.marketplace_mode).toBe(VercelMarketplaceMode.Installation);
		expect(display.allowed_product_ids_sandbox).toEqual(["prod_sandbox_a"]);
	});

	test("hides custom_payment_method while preserving other Vercel fields (live)", () => {
		const display = getVercelConfigDisplay({
			org: baseOrg(),
			env: AppEnv.Live,
		});

		expect(display.custom_payment_method).toBeUndefined();
		expect(display.connected).toBe(true);
		expect(display.client_integration_id).toBeDefined();
		expect(display.allowed_product_ids_live).toEqual(["prod_live_a"]);
	});

	test("returns all-undefined display when org has no vercel config", () => {
		const org = baseOrg();
		org.processor_configs = {};

		const display = getVercelConfigDisplay({
			org,
			env: AppEnv.Sandbox,
		});

		expect(display.connected).toBe(false);
		expect(display.custom_payment_method).toBeUndefined();
		expect(display.client_integration_id).toBeUndefined();
		expect(display.client_secret).toBeUndefined();
		expect(display.webhook_url).toBeUndefined();
		expect(display.marketplace_mode).toBeUndefined();
		expect(display.allowed_product_ids_live).toBeUndefined();
		expect(display.allowed_product_ids_sandbox).toBeUndefined();
	});

	test("hides custom_payment_method even when stored value is non-empty", () => {
		const org = baseOrg();
		const display = getVercelConfigDisplay({
			org,
			env: AppEnv.Sandbox,
		});

		// Even though org.processor_configs.vercel.custom_payment_method.sandbox
		// has a value, the display payload deliberately strips it. Asserts the
		// frontend has no opportunity to render it.
		expect(display.custom_payment_method).toBeUndefined();
		expect(
			org.processor_configs!.vercel!.custom_payment_method!.sandbox,
		).toBeDefined();
	});
});
