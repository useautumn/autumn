/**
 * Unit tests for registerRevenuecatWebhook — idempotent, one webhook per env, matched
 * by URL, secret as the Authorization header. Base URL follows the NODE_ENV rule.
 */

import { AppEnv } from "@autumn/shared";
import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import chalk from "chalk";
import {
	getRevenuecatWebhookUrl,
	registerRevenuecatWebhook,
} from "@/external/revenueCat/misc/registerRevenuecatWebhook.js";
import type { RevenueCatWebhookIntegration } from "@/external/revenueCat/revenuecatTypes.js";

const env = {
	NODE_ENV: process.env.NODE_ENV,
	NGROK_URL: process.env.NGROK_URL,
	BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
};

beforeEach(() => {
	process.env.NODE_ENV = "development";
	process.env.NGROK_URL = "https://ngrok.test";
	process.env.BETTER_AUTH_URL = "https://api.useautumn.com";
});

afterEach(() => {
	process.env.NODE_ENV = env.NODE_ENV;
	process.env.NGROK_URL = env.NGROK_URL;
	process.env.BETTER_AUTH_URL = env.BETTER_AUTH_URL;
});

const makeCli = (existing: RevenueCatWebhookIntegration[] = []) => {
	const createWebhookIntegration = mock(
		async (body: Record<string, unknown>) =>
			({ id: "wh_1", ...body }) as RevenueCatWebhookIntegration,
	);
	const listWebhookIntegrations = mock(async () => existing);
	return {
		cli: { listWebhookIntegrations, createWebhookIntegration } as never,
		listWebhookIntegrations,
		createWebhookIntegration,
	};
};

test(`${chalk.yellowBright("webhook url: dev uses NGROK_URL + AppEnv segment")}`, () => {
	expect(getRevenuecatWebhookUrl({ orgId: "org_1", env: AppEnv.Sandbox })).toBe(
		"https://ngrok.test/webhooks/revenuecat/org_1/sandbox",
	);
});

test(`${chalk.yellowBright("webhook url: prod uses BETTER_AUTH_URL")}`, () => {
	process.env.NODE_ENV = "production";
	expect(getRevenuecatWebhookUrl({ orgId: "org_1", env: AppEnv.Live })).toBe(
		"https://api.useautumn.com/webhooks/revenuecat/org_1/live",
	);
});

test(`${chalk.yellowBright("register: no existing webhook → creates with secret + environment, no event/app scoping")}`, async () => {
	const { cli, createWebhookIntegration } = makeCli([]);
	const status = await registerRevenuecatWebhook({
		rcCli: cli,
		orgId: "org_1",
		env: AppEnv.Sandbox,
		secret: "whsec_abc",
	});

	expect(status).toBe("created");
	const body = createWebhookIntegration.mock.calls[0]?.[0] as Record<
		string,
		unknown
	>;
	expect(body).toMatchObject({
		url: "https://ngrok.test/webhooks/revenuecat/org_1/sandbox",
		authorization_header: "whsec_abc",
		environment: "sandbox",
	});
	expect(body.event_types).toBeUndefined();
	expect(body.app_id).toBeUndefined();
});

test(`${chalk.yellowBright("register: live env maps to environment=production")}`, async () => {
	const { cli, createWebhookIntegration } = makeCli([]);
	await registerRevenuecatWebhook({
		rcCli: cli,
		orgId: "org_1",
		env: AppEnv.Live,
		secret: "whsec_live",
	});
	expect(
		(createWebhookIntegration.mock.calls[0]?.[0] as { environment: string })
			.environment,
	).toBe("production");
});

test(`${chalk.yellowBright("register: existing webhook with same url → exists, no create")}`, async () => {
	const { cli, createWebhookIntegration } = makeCli([
		{
			id: "wh_existing",
			name: "Autumn (sandbox)",
			url: "https://ngrok.test/webhooks/revenuecat/org_1/sandbox",
		},
	]);
	const status = await registerRevenuecatWebhook({
		rcCli: cli,
		orgId: "org_1",
		env: AppEnv.Sandbox,
		secret: "whsec_abc",
	});
	expect(status).toBe("exists");
	expect(createWebhookIntegration).not.toHaveBeenCalled();
});

test(`${chalk.yellowBright("register: no base url → skipped, no list/create")}`, async () => {
	delete process.env.NGROK_URL;
	const { cli, listWebhookIntegrations, createWebhookIntegration } = makeCli([]);
	const status = await registerRevenuecatWebhook({
		rcCli: cli,
		orgId: "org_1",
		env: AppEnv.Sandbox,
		secret: "whsec_abc",
	});
	expect(status).toBe("skipped");
	expect(listWebhookIntegrations).not.toHaveBeenCalled();
	expect(createWebhookIntegration).not.toHaveBeenCalled();
});
