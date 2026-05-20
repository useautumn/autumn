/**
 * Integration test: `billing.updated` webhook fires for create-schedule.
 * Immediate-phase plans show up as `activated`, future-phase plans as
 * `scheduled`.
 */

import { afterAll, beforeAll, expect, test } from "bun:test";
import type {
	BillingChangeResponse,
	CreateScheduleParamsV0Input,
	CustomerPlanChange,
	PlanChangeAction,
} from "@autumn/shared";
import { ms } from "@autumn/shared";
import {
	getTestSvixAppId,
	setupWebhookTest,
	type WebhookTestSetup,
	waitForWebhook,
} from "@tests/integration/utils/svixWebhookTestUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

type BillingUpdatedPayload = {
	type: string;
	data: BillingChangeResponse & { tags?: string[] };
};

const findChange = (
	plan_changes: CustomerPlanChange[] | undefined,
	{ action, planId }: { action: PlanChangeAction; planId: string },
): CustomerPlanChange | undefined =>
	plan_changes?.find(
		(change) =>
			change.action === action &&
			(change.subscription?.plan_id ?? change.purchase?.plan_id) === planId,
	);

let webhook: WebhookTestSetup;
let playToken: string;

beforeAll(async () => {
	const appId = getTestSvixAppId({ svixConfig: ctx.org.svix_config });
	webhook = await setupWebhookTest({
		appId,
		filterTypes: ["billing.updated"],
	});
	playToken = webhook.playToken;
});

afterAll(async () => {
	await webhook?.cleanup();
});

test(
	`${chalk.yellowBright("billing.updated: create-schedule with multi-plan phases → activated × 2 + scheduled × 2")}`,
	async () => {
		const customerId = "billing-updated-create-schedule";
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const addonNow = products.recurringAddOn({
			id: "addon-now",
			items: [items.monthlyWords({ includedUsage: 25 })],
		});
		const premium = products.premium({
			id: "premium",
			items: [items.monthlyMessages({ includedUsage: 200 })],
		});
		const addonLater = products.recurringAddOn({
			id: "addon-later",
			items: [items.monthlyWords({ includedUsage: 50 })],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", skipWebhooks: true }),
				s.products({ list: [pro, addonNow, premium, addonLater] }),
			],
			actions: [],
		});

		const now = Date.now();
		const params: CreateScheduleParamsV0Input = {
			customer_id: customerId,
			phases: [
				{
					starts_at: now,
					plans: [{ plan_id: pro.id }, { plan_id: addonNow.id }],
				},
				{
					starts_at: now + ms.days(30),
					plans: [{ plan_id: premium.id }, { plan_id: addonLater.id }],
				},
			],
		};
		await autumnV1.billing.createSchedule(params);

		const result = await waitForWebhook<BillingUpdatedPayload>({
			token: playToken,
			predicate: (payload) =>
				payload.type === "billing.updated" &&
				payload.data?.customer_id === customerId &&
				findChange(payload.data.plan_changes, {
					action: "activated",
					planId: pro.id,
				}) !== undefined &&
				findChange(payload.data.plan_changes, {
					action: "activated",
					planId: addonNow.id,
				}) !== undefined &&
				findChange(payload.data.plan_changes, {
					action: "scheduled",
					planId: premium.id,
				}) !== undefined &&
				findChange(payload.data.plan_changes, {
					action: "scheduled",
					planId: addonLater.id,
				}) !== undefined,
			timeoutMs: 15000,
		});

		expect(result).not.toBeNull();
		const { data } = result!.payload;

		// Immediate phase (now): both plans activated
		for (const planId of [pro.id, addonNow.id]) {
			const change = findChange(data.plan_changes, {
				action: "activated",
				planId,
			});
			expect(change?.subscription?.status).toBe("active");
		}

		// Future phase (+30 days): both plans scheduled
		for (const planId of [premium.id, addonLater.id]) {
			const change = findChange(data.plan_changes, {
				action: "scheduled",
				planId,
			});
			expect(change?.subscription?.status).toBe("scheduled");
		}
	},
);
