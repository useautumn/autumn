/**
 * Immediate Switch Entity Edge Cases (Attach V2)
 *
 * Regression tests for edge cases observed in production (Mintlify customer)
 * where attaching products with different billing intervals to different
 * entities after a time advance produced duplicate charges.
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3, ApiEntityV0 } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectCustomerProducts,
	expectProductActive,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { calculateProrationFromPeriod } from "@tests/integration/billing/utils/proration";
import { getStripeSubscription } from "@tests/integration/billing/utils/stripeSubscriptionUtils";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Entity 1 pro annual, advance 3 weeks, attach pro monthly to entity 2
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Entity 1 attaches pro annual ($200/yr)
 * - Advance test clock by 3 weeks
 * - Entity 2 attaches pro monthly ($20/mo)
 *
 * Expected Result:
 * - Entity 1 still has pro annual, entity 2 has pro monthly
 * - Second attach invoice is exactly $20 for the monthly item only
 * - No duplicate charge for the annual item that was already billed on entity 1
 */
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

	const { autumnV1, ctx, entities, advancedTo, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proAnnual, proMonthly] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [s.billing.attach({ productId: proAnnual.id, entityIndex: 0 })],
	});

	// Set the annual sub's billing_cycle_anchor to exactly one year from its
	// start date — this mirrors the Mintlify production scenario.
	const {
		stripeCli,
		subscription: annualSub,
	} = await getStripeSubscription({ customerId });
	const annualStart = annualSub.start_date;
	const oneYearFromStart = annualStart + 365 * 24 * 60 * 60;
	await stripeCli.subscriptions.update(annualSub.id, {
		trial_end: oneYearFromStart,
		proration_behavior: "none",
	});

	// Now advance the clock 3 weeks into the annual cycle
	await advanceTestClock({
		stripeCli,
		testClockId: testClockId!,
		numberOfWeeks: 3,
	});
	const advancedToAfter = advancedTo + 3 * 7 * 24 * 60 * 60 * 1000;

	// 1. Preview attach pro monthly to entity 2
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: proMonthly.id,
		entity_id: entities[1].id,
	});

	// 2. Attach pro monthly to entity 2
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: proMonthly.id,
		entity_id: entities[1].id,
		redirect_mode: "if_required",
	});

	// 3. Compute the EXACT expected proration of $20 against the monthly sub's
	//    period via getStripeSubscription + calculateProrationFromPeriod
	const { billingPeriod } = await getStripeSubscription({ customerId });
	const expectedMonthlyCharge = calculateProrationFromPeriod({
		billingPeriod,
		advancedTo: advancedToAfter,
		amount: 20,
	});

	// Preview must match the exact prorated amount — proves no duplicate annual
	expect(preview.total).toBe(expectedMonthlyCharge);

	// 4. Invoice count: annual attach + monthly attach = 2 invoices; most recent
	//    invoice total must exactly equal the computed prorated amount
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: expectedMonthlyCharge,
		latestStatus: "paid",
	});

	// 4. Entity 1 still has pro annual, entity 2 has pro monthly
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

	// 5. Stripe subscriptions reflect the two independent entity subs
	await expectStripeSubscriptionCorrect({ ctx, customerId });
});
