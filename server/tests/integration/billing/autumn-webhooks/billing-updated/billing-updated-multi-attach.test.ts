/**
 * Integration test: `billing.updated` webhook fires for multi-attach,
 * containing one `activated` plan_change per product attached in the call.
 */

import { afterAll, beforeAll, expect, test } from "bun:test";
import type {
	BillingChangeResponse,
	CustomerPlanChange,
	PlanChangeAction,
} from "@autumn/shared";
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
	`${chalk.yellowBright("billing.updated: multi-attach two plans → activated for each")}`,
	async () => {
		const customerId = "billing-updated-multi-attach";
		const planA = products.pro({
			id: "plan-a",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const planB = products.base({
			id: "plan-b",
			items: [items.monthlyUsers({ includedUsage: 10 }), items.monthlyPrice({ price: 30 })],
			group: "group-b",
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", skipWebhooks: true }),
				s.products({ list: [planA, planB] }),
			],
			actions: [],
		});

		await autumnV1.billing.multiAttach({
			customer_id: customerId,
			plans: [{ plan_id: planA.id }, { plan_id: planB.id }],
		});

		const result = await waitForWebhook<BillingUpdatedPayload>({
			token: playToken,
			predicate: (payload) =>
				payload.type === "billing.updated" &&
				payload.data?.customer_id === customerId &&
				findChange(payload.data.plan_changes, {
					action: "activated",
					planId: planA.id,
				}) !== undefined &&
				findChange(payload.data.plan_changes, {
					action: "activated",
					planId: planB.id,
				}) !== undefined,
			timeoutMs: 15000,
		});

		expect(result).not.toBeNull();
		const { data } = result!.payload;

		const activatedA = findChange(data.plan_changes, {
			action: "activated",
			planId: planA.id,
		});
		expect(activatedA?.previous_attributes).toBeNull();
		expect(activatedA?.subscription?.status).toBe("active");

		const activatedB = findChange(data.plan_changes, {
			action: "activated",
			planId: planB.id,
		});
		expect(activatedB?.previous_attributes).toBeNull();
		expect(activatedB?.subscription?.status).toBe("active");
	},
);
