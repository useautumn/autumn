/**
 * Requesting the plan a customer already has leaves its row untouched: same id, usage and cycle.
 *
 * Red (before):  the row was expired and re-inserted, crediting unused time and resetting usage.
 * Green (after): the preview keeps it at $0; a cancelled subscription is rebuilt on its old period end.
 */

import { expect, test } from "bun:test";
import {
	findActiveCustomerProductById,
	type SetPlansParamsV0Input,
	type SetPlansPreviewResponse,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService";
import {
	cancelSubscriptionMissingWebhook,
	expectPlanKept,
	expectResyncedSubscriptionCorrect,
} from "../utils/resyncUtils";
import {
	expectPreviewWarning,
	findStripeSubscriptionByStatus,
} from "../utils/subscriptionStateUtils";

const TRACKED_MESSAGES = 40;
const INCLUDED_MESSAGES = 100;

const getActiveCustomerProduct = async ({
	ctx,
	customerId,
	productId,
}: {
	ctx: TestContext;
	customerId: string;
	productId: string;
}) => {
	const customerProduct = findActiveCustomerProductById({
		fullCus: await CusService.getFull({ ctx, idOrInternalId: customerId }),
		productId,
	});
	if (!customerProduct) throw new Error(`No active ${productId}`);
	return customerProduct;
};

/** The only immediate plan is kept with no credit, nothing is charged, and usage is not reset. */
const expectPreviewKeepsPlan = ({
	preview,
	planId,
}: {
	preview: SetPlansPreviewResponse;
	planId: string;
}) => {
	expect(preview.total).toBe(0);
	expect(
		preview.phases[0]?.plans.map((plan) => [
			plan.plan_id,
			plan.status,
			plan.credit,
		]),
	).toEqual([[planId, "kept", null]]);
	expect(preview.warnings.map((warning) => warning.type)).not.toContain(
		"usage_reset",
	);
};

test.concurrent(
	`${chalk.yellowBright("set-plans resync unchanged: pro on a cancelled subscription keeps its row, usage and cycle")}`,
	async () => {
		const pro = products.pro({
			items: [items.monthlyMessages({ includedUsage: INCLUDED_MESSAGES })],
		});

		const { customerId, autumnV2_4, ctx } = await initScenario({
			customerId: "set-plans-resync-unchanged",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.track({
					featureId: TestFeature.Messages,
					value: TRACKED_MESSAGES,
					timeout: 2000,
				}),
				s.advanceTestClock({ days: 10 }),
			],
		});
		const customerProduct = await getActiveCustomerProduct({
			ctx,
			customerId,
			productId: pro.id,
		});
		const { oldSubscriptionId, oldPeriodEndMs } =
			await cancelSubscriptionMissingWebhook({ ctx, customerId });

		const params: SetPlansParamsV0Input = {
			customer_id: customerId,
			phases: [{ starts_at: "now", plans: [{ plan_id: pro.id }] }],
		};
		const preview = await autumnV2_4.billing.previewSetPlans(params);
		expectPreviewKeepsPlan({ preview, planId: pro.id });
		expectPreviewWarning({ preview, type: "new_stripe_subscription" });

		await autumnV2_4.billing.setPlans(params);

		const newSubscription = await expectResyncedSubscriptionCorrect({
			ctx,
			customerId,
			oldSubscriptionId,
			anchorMs: oldPeriodEndMs,
		});
		await expectPlanKept({
			ctx,
			customerId,
			productId: pro.id,
			customerProductId: customerProduct.id,
			subscriptionId: newSubscription.id,
		});
		await expectBalanceCorrect({
			customerId,
			featureId: TestFeature.Messages,
			remaining: INCLUDED_MESSAGES - TRACKED_MESSAGES,
			usage: TRACKED_MESSAGES,
			nextResetAt: oldPeriodEndMs,
		});
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 1,
			latestTotal: 20,
		});
		await expectStripeSubscriptionCorrect({ ctx, customerId });
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans resync unchanged: pro on a live subscription is a no-op")}`,
	async () => {
		const pro = products.pro({
			items: [items.monthlyMessages({ includedUsage: INCLUDED_MESSAGES })],
		});

		const { customerId, autumnV2_4, ctx } = await initScenario({
			customerId: "set-plans-resync-unchanged-live",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.track({
					featureId: TestFeature.Messages,
					value: TRACKED_MESSAGES,
					timeout: 2000,
				}),
				s.advanceTestClock({ days: 10 }),
			],
		});
		const customerProduct = await getActiveCustomerProduct({
			ctx,
			customerId,
			productId: pro.id,
		});
		const liveSubscription = await findStripeSubscriptionByStatus({
			ctx,
			customerId,
			status: "active",
		});

		const params: SetPlansParamsV0Input = {
			customer_id: customerId,
			phases: [{ starts_at: "now", plans: [{ plan_id: pro.id }] }],
		};
		expectPreviewKeepsPlan({
			preview: await autumnV2_4.billing.previewSetPlans(params),
			planId: pro.id,
		});

		await autumnV2_4.billing.setPlans(params);

		await expectPlanKept({
			ctx,
			customerId,
			productId: pro.id,
			customerProductId: customerProduct.id,
			subscriptionId: liveSubscription.id,
		});
		await expectBalanceCorrect({
			customerId,
			featureId: TestFeature.Messages,
			remaining: INCLUDED_MESSAGES - TRACKED_MESSAGES,
			usage: TRACKED_MESSAGES,
		});
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 1,
			latestTotal: 20,
		});
		await expectStripeSubscriptionCorrect({ ctx, customerId });
	},
);
