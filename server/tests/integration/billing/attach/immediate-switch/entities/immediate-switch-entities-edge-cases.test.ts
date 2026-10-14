import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	type ApiEntityV0,
	type AttachParamsV0Input,
	type AttachParamsV1,
	BillingInterval,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectCustomerProducts,
	expectProductActive,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { calculateProrationFromPeriod } from "@tests/integration/billing/utils/proration";
import { createCustomStripeSubscription } from "@tests/integration/billing/utils/stripe/createCustomStripeSubscription";
import { getStripeSubscription } from "@tests/integration/billing/utils/stripeSubscriptionUtils";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addYears, subMinutes } from "date-fns";

test.concurrent(`${chalk.yellowBright("immediate-switch-entities-edge-cases 1: entity 1 annual, advance 3 weeks, attach monthly to entity 2")}`, async () => {
	const customerId = "imm-switch-ent-edge-annual-then-monthly";

	const proAnnualMessages = items.monthlyMessages({ includedUsage: 500 });
	const proAnnual = products.proAnnual({
		id: "pro-annual",
		items: [proAnnualMessages],
	});

	const proMonthlyMessages = items.monthlyMessages({ includedUsage: 500 });
	const proMonthly = products.pro({
		id: "pro-monthly",
		items: [proMonthlyMessages],
	});

	const { autumnV1, autumnV2_1, ctx, entities, advancedTo, testClockId } =
		await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [proAnnual, proMonthly] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [],
		});

	const annualStripeSub = await createCustomStripeSubscription({
		ctx,
		customerId,
		productId: proAnnual.id,
		unitAmount: 20000,
		interval: "year",
		billingCycleAnchorMs: subMinutes(addYears(new Date(), 1), 100).getTime(),
	});

	await autumnV1.billing.attach<AttachParamsV0Input>({
		customer_id: customerId,
		product_id: proAnnual.id,
		entity_id: entities[0].id,
		processor_subscription_id: annualStripeSub.id,
	});

	await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		numberOfWeeks: 3,
	});
	const advancedToAfter = advancedTo + 3 * 7 * 24 * 60 * 60 * 1000;

	const params = {
		customer_id: customerId,
		plan_id: proMonthly.id,
		entity_id: entities[1].id,
	} as AttachParamsV1;

	const preview = await autumnV2_1.billing.previewAttach(params);

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: proMonthly.id,
		entity_id: entities[1].id,
		redirect_mode: "if_required",
	});

	const { billingPeriod } = await getStripeSubscription({
		customerId,
		interval: BillingInterval.Month,
	});
	const expectedMonthlyCharge = calculateProrationFromPeriod({
		billingPeriod,
		advancedTo: advancedToAfter,
		amount: 20,
	});

	expect(preview.total).toBe(expectedMonthlyCharge);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: expectedMonthlyCharge,
		latestStatus: "paid",
	});

	const entity1 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	const entity2 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[1].id,
	);

	await expectProductActive({ customer: entity1, productId: proAnnual.id });
	await expectCustomerProducts({
		customer: entity2,
		active: [proMonthly.id],
		notPresent: [proAnnual.id],
	});

	await expectStripeSubscriptionCorrect({ ctx, customerId });
});
