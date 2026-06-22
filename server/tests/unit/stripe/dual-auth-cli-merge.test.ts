/**
 * TDD test for Stripe dual-auth: handleCliStripe must MERGE stripe_config rather
 * than overwrite it, so that connecting secret keys via the CLI does not wipe out
 * an existing OAuth connect webhook secret.
 *
 * Contract under test:
 *   buildCliStripeConfig (pure merge helper extracted from handleCliStripe):
 *     - preserves existing *_connect_webhook_secret while setting api keys + direct webhook secrets
 *
 * Pre-impl red: buildCliStripeConfig does not exist; handleCliStripe overwrites the whole
 * stripe_config object.
 * Post-impl green: the helper spreads the existing config and the connect secrets survive.
 */

import { describe, expect, test } from "bun:test";
import type { StripeConfig } from "@autumn/shared";
import { buildCliStripeConfig } from "@/internal/dev/handlers/handleCliStripe.js";

describe("dual-auth: handleCliStripe merges stripe_config", () => {
	test("preserves existing connect webhook secrets when adding api keys", () => {
		const existing: StripeConfig = {
			test_connect_webhook_secret: "whsec_connect_test",
			live_connect_webhook_secret: "whsec_connect_live",
		};

		const merged = buildCliStripeConfig({
			existing,
			testApiKey: "enc_test_key",
			liveApiKey: "enc_live_key",
			testWebhookSecret: "enc_test_wh",
			liveWebhookSecret: "enc_live_wh",
		});

		expect(merged.test_connect_webhook_secret).toBe("whsec_connect_test");
		expect(merged.live_connect_webhook_secret).toBe("whsec_connect_live");
		expect(merged.test_api_key).toBe("enc_test_key");
		expect(merged.live_api_key).toBe("enc_live_key");
		expect(merged.test_webhook_secret).toBe("enc_test_wh");
		expect(merged.live_webhook_secret).toBe("enc_live_wh");
	});

	test("works when existing config is null/empty", () => {
		const merged = buildCliStripeConfig({
			existing: null,
			testApiKey: "enc_test_key",
			liveApiKey: "enc_live_key",
			testWebhookSecret: "enc_test_wh",
			liveWebhookSecret: "enc_live_wh",
		});

		expect(merged.test_api_key).toBe("enc_test_key");
		expect(merged.test_connect_webhook_secret ?? null).toBeNull();
	});
});
