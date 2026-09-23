import { expect, test } from "bun:test";
import { AppEnv } from "@autumn/shared";
import {
	buildOAuthConnectWebhookParams,
	MAIN_STRIPE_EVENT_TYPES,
	OAUTH_CONNECT_STRIPE_EVENT_TYPES,
	SYNC_STRIPE_EVENT_TYPES,
} from "@/external/stripe/common/stripeConstants.js";

test("OAuth Connect endpoints subscribe to revocations on top of the handled events", () => {
	const params = buildOAuthConnectWebhookParams({
		publicApiUrl: "https://api.example.com",
		env: AppEnv.Sandbox,
	});
	expect(params).toMatchObject({
		url: "https://api.example.com/webhooks/connect/sandbox",
		connect: true,
	});
	expect(params.enabled_events).toEqual(OAUTH_CONNECT_STRIPE_EVENT_TYPES);
	expect(params.enabled_events).toContain("account.application.deauthorized");
	for (const event of [...MAIN_STRIPE_EVENT_TYPES, ...SYNC_STRIPE_EVENT_TYPES])
		expect(params.enabled_events).toContain(event);
	expect(new Set(params.enabled_events).size).toBe(
		params.enabled_events.length,
	);
});

test("direct secret-key endpoints do not subscribe to OAuth revocations", () => {
	expect([
		...MAIN_STRIPE_EVENT_TYPES,
		...SYNC_STRIPE_EVENT_TYPES,
	]).not.toContain("account.application.deauthorized");
});
