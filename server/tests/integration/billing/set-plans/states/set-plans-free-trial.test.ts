/**
 * An explicit set_plans trial starts on new plans and is patched onto live plans it keeps.
 *
 * Red (before):  a trial recreated every live plan, resetting its balances and usage.
 * Green (after): the same row is kept with its usage, and only its trial end moves.
 */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	FreeTrialDuration,
	ms,
	type SetPlansParamsV0Input,
	secondsToMs,
} from "@autumn/shared";
import { expectTrialInvoicedCorrect } from "@tests/integration/billing/attach/free-trial/no-card/utils/expectInvoicedTrialCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductTrialing } from "@tests/integration/billing/utils/expectCustomerProductTrialing";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService";
import { findStripeSubscriptionByStatus } from "../utils/subscriptionStateUtils";

const INCLUDED_MESSAGES = 100;
const TRACKED_MESSAGES = 40;
const TRIAL_DAYS = 14;
const PRO_PRICE = 20;

const fourteenDayTrial = ({ cardRequired }: { cardRequired: boolean }) => ({
	duration_length: TRIAL_DAYS,
	duration_type: FreeTrialDuration.Day,
	card_required: cardRequired,
});

const liveCustomerProductIds = async ({
	ctx,
	customerId,
	productId,
}: {
	ctx: TestContext;
	customerId: string;
	productId: string;
}) => {
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});
	return fullCustomer.customer_products
		.filter((customerProduct) => customerProduct.product.id === productId)
		.map((customerProduct) => customerProduct.id);
};

test.concurrent(
	`${chalk.yellowBright("set-plans free trial: a new customer starts trialing with nothing charged")}`,
	async () => {
		const pro = products.pro({
			items: [items.monthlyMessages({ includedUsage: INCLUDED_MESSAGES })],
		});
		const { customerId, autumnV1, autumnV2_4, ctx, advancedTo } =
			await initScenario({
				customerId: "set-plans-trial-new",
				setup: [
					s.customer({ paymentMethod: "success" }),
					s.products({ list: [pro] }),
				],
				actions: [],
			});

		const params: SetPlansParamsV0Input = {
			customer_id: customerId,
			free_trial: fourteenDayTrial({ cardRequired: true }),
			phases: [{ starts_at: "now", plans: [{ plan_id: pro.id }] }],
		};
		expect((await autumnV2_4.billing.previewSetPlans(params)).total).toBe(0);
		await autumnV2_4.billing.setPlans(params);

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductTrialing({
			customer,
			productId: pro.id,
			trialEndsAt: advancedTo + ms.days(TRIAL_DAYS),
		});
		await expectCustomerInvoiceCorrect({ customer, count: 1, latestTotal: 0 });
		await expectStripeSubscriptionCorrect({
			ctx,
			customerId,
			options: { status: "trialing" },
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans free trial: a paid live plan keeps its row and usage, and is credited its unused period, while its trial starts")}`,
	async () => {
		const pro = products.pro({
			items: [items.monthlyMessages({ includedUsage: INCLUDED_MESSAGES })],
		});
		const { customerId, autumnV1, autumnV2_4, ctx, advancedTo } =
			await initScenario({
				customerId: "set-plans-trial-live",
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
				],
			});
		const rowsBefore = await liveCustomerProductIds({
			ctx,
			customerId,
			productId: pro.id,
		});

		const params: SetPlansParamsV0Input = {
			customer_id: customerId,
			free_trial: fourteenDayTrial({ cardRequired: true }),
			phases: [{ starts_at: "now", plans: [{ plan_id: pro.id }] }],
		};
		const preview = await autumnV2_4.billing.previewSetPlans(params);
		expect(preview.total).toBe(-PRO_PRICE);
		expect(preview.warnings.map((warning) => warning.type)).not.toContain(
			"usage_reset",
		);
		await autumnV2_4.billing.setPlans(params);

		expect(
			await liveCustomerProductIds({ ctx, customerId, productId: pro.id }),
		).toEqual(rowsBefore);
		const trialEndsAt = advancedTo + ms.days(TRIAL_DAYS);
		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductTrialing({ customer, productId: pro.id, trialEndsAt });
		await expectBalanceCorrect({
			customerId,
			featureId: TestFeature.Messages,
			remaining: INCLUDED_MESSAGES - TRACKED_MESSAGES,
			usage: TRACKED_MESSAGES,
		});
		await expectCustomerInvoiceCorrect({ customer, count: 3, latestTotal: 0 });

		const trialing = await findStripeSubscriptionByStatus({
			ctx,
			customerId,
			status: "trialing",
		});
		expect(
			Math.abs(secondsToMs(trialing.trial_end ?? 0) - trialEndsAt),
		).toBeLessThan(ms.hours(1));
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans free trial: invoice mode starts a no-card trial on a send_invoice subscription")}`,
	async () => {
		const pro = products.pro({
			items: [items.monthlyMessages({ includedUsage: INCLUDED_MESSAGES })],
		});
		const { customerId, autumnV2_4, ctx } = await initScenario({
			customerId: "set-plans-trial-invoice-mode",
			setup: [s.customer({}), s.products({ list: [pro] })],
			actions: [],
		});

		await autumnV2_4.billing.setPlans({
			customer_id: customerId,
			free_trial: fourteenDayTrial({ cardRequired: false }),
			invoice_mode: { enabled: true },
			phases: [{ starts_at: "now", plans: [{ plan_id: pro.id }] }],
		});

		await expectProductTrialing({ customerId, productId: pro.id });
		await expectTrialInvoicedCorrect({ ctx, customerId });
		await expectStripeSubscriptionCorrect({
			ctx,
			customerId,
			options: { status: "trialing" },
		});
	},
);
