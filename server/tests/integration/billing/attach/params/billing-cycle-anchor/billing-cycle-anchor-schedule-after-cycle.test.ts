import { expect, test } from "bun:test";
import type { ApiCustomerV5, AttachParamsV1Input } from "@autumn/shared";
import { advanceToAnchor } from "@tests/integration/billing/utils/advanceUtils/advanceToAnchor";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectPreviewNextCycleCorrect } from "@tests/integration/billing/utils/expectPreviewNextCycleCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { calculateBillingCycleAnchorResetNextCycle } from "@tests/integration/billing/utils/proration";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addDays } from "date-fns";

test(`${chalk.yellowBright("billing-cycle-anchor-schedule 2: anchor after next cycle previews regular renewal first")}`, async () => {
	const customerId = "attach-anchor-scheduled-after-cycle";

	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const premium = products.premium({
		id: "premium",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});

	const { autumnV2_2, ctx, advancedTo, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	const scheduledAnchorMs = addDays(advancedTo, 40).getTime();
	const expectedNextCycle = await calculateBillingCycleAnchorResetNextCycle({
		customerId,
		billingCycleAnchorMs: scheduledAnchorMs,
		nextCycleAmount: 50,
	});

	const preview = await autumnV2_2.billing.previewAttach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: premium.id,
		billing_cycle_anchor: scheduledAnchorMs,
	});

	expect(preview.total).toBe(30);
	expectPreviewNextCycleCorrect({
		preview,
		startsAt: expectedNextCycle.startsAt,
		total: expectedNextCycle.total,
	});

	const result = await autumnV2_2.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: premium.id,
		billing_cycle_anchor: scheduledAnchorMs,
		redirect_mode: "if_required",
	});

	await expectStripeSubscriptionCorrect({ ctx, customerId });
	expect(result.invoice).toBeDefined();

	const customerAfterAttach =
		await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	await expectCustomerProducts({
		customer: customerAfterAttach,
		active: [premium.id],
		notPresent: [pro.id],
	});
	expectBalanceCorrect({
		customer: customerAfterAttach,
		featureId: TestFeature.Messages,
		remaining: 500,
		usage: 0,
		planId: premium.id,
	});

	await expectCustomerInvoiceCorrect({
		customerId,
		count: 2,
		latestTotal: preview.total,
	});

	await advanceToAnchor({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		advancedTo,
		anchorMs: expectedNextCycle.startsAt,
	});

	await expectCustomerInvoiceCorrect({
		customerId,
		count: 3,
		latestTotal: expectedNextCycle.total,
	});

	await expectStripeSubscriptionCorrect({ ctx, customerId });
});
