/**
 * Unit tests for registerRevenuecatWebhook — idempotent, one webhook per env, matched
 * by URL, secret as the Authorization header.
 */

import { expect, mock, test } from "bun:test";
import { getAutumnEnv } from "@autumn/env";
import { AppEnv } from "@autumn/shared";
import chalk from "chalk";
import {
	getRevenuecatWebhookUrl,
	registerRevenuecatWebhook,
} from "@/external/revenueCat/misc/registerRevenuecatWebhook.js";
import type { RevenueCatWebhookIntegration } from "@/external/revenueCat/revenuecatTypes.js";

const publicApiUrl = getAutumnEnv().AUTUMN_PUBLIC_API_URL;

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

test(`${chalk.yellowBright("webhook url uses public API origin + AppEnv segment")}`, () => {
	expect(getRevenuecatWebhookUrl({ orgId: "org_1", env: AppEnv.Sandbox })).toBe(
		`${publicApiUrl}/webhooks/revenuecat/org_1/sandbox`,
	);
});

test(`${chalk.yellowBright("webhook url includes the live AppEnv segment")}`, () => {
	expect(getRevenuecatWebhookUrl({ orgId: "org_1", env: AppEnv.Live })).toBe(
		`${publicApiUrl}/webhooks/revenuecat/org_1/live`,
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
		url: `${publicApiUrl}/webhooks/revenuecat/org_1/sandbox`,
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
			url: `${publicApiUrl}/webhooks/revenuecat/org_1/sandbox`,
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
