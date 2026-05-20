/**
 * Integration test: `billing.updated` webhook fires from the productCron
 * when a trial expires. Tagged `trial_ended`.
 *
 * Setup: attach a paid product, then attach an enterprise product with a
 * revert trial. Manually backdate `trial_ends_at` and invoke
 * `runProductCron`. The cron picks up the trial row (matched on
 * `on_trial_end = "revert"`), `tryProcessRevertExpiry` expires the trial
 * and unpauses the prior plan, and `processExpiredTrialRow` fires the
 * webhook tagged `trial_ended`.
 */

import { afterAll, beforeAll, expect, test } from "bun:test";
import {
	type AttachParamsV1Input,
	type BillingChangeResponse,
	type CustomerPlanChange,
	customerProducts,
	FreeTrialDuration,
	type PlanChangeAction,
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
import { eq } from "drizzle-orm";
import { runProductCron } from "@/cron/productCron/runProductCron";
import { logger } from "@/external/logtail/logtailUtils";
import { CusService } from "@/internal/customers/CusService";

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
	`${chalk.yellowBright("billing.updated: productCron revert-trial expiry → trial_ended tag")}`,
	async () => {
		const customerId = "billing-updated-product-cron-revert";

		const messagesItem = items.monthlyMessages({ includedUsage: 100 });
		const priceItem = items.monthlyPrice({ price: 20 });
		const pro = products.base({
			id: "pro-cron",
			items: [messagesItem, priceItem],
		});
		const enterprise = products.base({
			id: "enterprise-cron",
			items: [
				items.monthlyMessages({ includedUsage: 1000 }),
				items.monthlyPrice({ price: 50 }),
			],
		});

		const { autumnV2, ctx: scenarioCtx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", skipWebhooks: true }),
				s.products({ list: [pro, enterprise] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		// Attach enterprise with a revert trial — pro gets paused, enterprise
		// is now trialing with on_trial_end="revert".
		const params: AttachParamsV1Input = {
			customer_id: customerId,
			plan_id: enterprise.id,
			redirect_mode: "if_required",
			customize: {
				free_trial: {
					duration_length: 14,
					duration_type: FreeTrialDuration.Day,
					card_required: false,
					on_end: "revert",
				},
			},
		};
		await autumnV2.billing.attach<AttachParamsV1Input>(params);

		// Backdate trial_ends_at so the cron picks the enterprise row up.
		const fullCustomer = await CusService.getFull({
			ctx: scenarioCtx,
			idOrInternalId: customerId,
		});
		const pastTrialEnd = Date.now() - 60_000;
		await scenarioCtx.db
			.update(customerProducts)
			.set({ trial_ends_at: pastTrialEnd })
			.where(
				eq(customerProducts.internal_customer_id, fullCustomer.internal_id),
			);

		await runProductCron({ ctx: { db: scenarioCtx.db, logger } });

		const result = await waitForWebhook<BillingUpdatedPayload>({
			token: playToken,
			predicate: (payload) =>
				payload.type === "billing.updated" &&
				payload.data?.customer_id === customerId &&
				(payload.data?.tags ?? []).includes("trial_ended"),
			timeoutMs: 15000,
		});

		expect(result).not.toBeNull();
		const { data } = result!.payload;
		expect(data.tags).toContain("trial_ended");

		// Enterprise (the trial) expires; pro (was paused) goes back to active.
		const expired = findChange(data.plan_changes, {
			action: "expired",
			planId: enterprise.id,
		});
		expect(expired).toBeDefined();

		const restored = findChange(data.plan_changes, {
			action: "activated",
			planId: pro.id,
		});
		expect(restored).toBeDefined();
	},
);
