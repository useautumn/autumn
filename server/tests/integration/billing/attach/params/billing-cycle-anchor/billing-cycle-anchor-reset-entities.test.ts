import { expect, test } from "bun:test";
import type {
	ApiCustomerV5,
	ApiEntityV2,
	AttachParamsV1Input,
} from "@autumn/shared";
import {
	expectProductActive,
	expectProductNotPresent,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectPreviewNextCycleCorrect } from "@tests/integration/billing/utils/expectPreviewNextCycleCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addMonths } from "date-fns";

/**
 * Billing Cycle Anchor + Prepaid Entity Tests
 *
 * These tests exercise `billing_cycle_anchor: "now"` on entity-scoped prepaid
 * upgrades, where recurring Stripe items are inline-priced and subscription item
 * metadata is currently stripped for the pending-update-compatible request.
 */
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { calculateResetBillingCycleNowTotal } from "@tests/integration/billing/utils/proration/calculateProration";

const PREPAID_BILLING_UNITS = 100;

test.concurrent(`${chalk.yellowBright("billing-cycle-anchor-prepaid-entities 1: single entity upgrade resets cycle anchor")}`, async () => {
	const customerId = "anchor-prepaid-ent-single";
	const proQuantity = 300;
	const premiumQuantity = 500;

	const pro = products.pro({
		id: "pro-prepaid-entity",
		items: [
			items.prepaidMessages({
				includedUsage: 100,
				billingUnits: PREPAID_BILLING_UNITS,
				price: 10,
			}),
		],
	});

	const premium = products.premium({
		id: "premium-prepaid-entity",
		items: [
			items.prepaidMessages({
				includedUsage: 200,
				billingUnits: PREPAID_BILLING_UNITS,
				price: 15,
			}),
		],
	});

	const { autumnV2_2, entities, ctx, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({
				productId: pro.id,
				entityIndex: 0,
				options: [{ feature_id: TestFeature.Messages, quantity: proQuantity }],
			}),
			s.advanceTestClock({ days: 14 }),
		],
	});

	const expectedTotal = await calculateResetBillingCycleNowTotal({
		customerId,
		advancedTo,
		oldAmount: 40,
		newAmount: 95,
	});

	const preview = await autumnV2_2.billing.previewAttach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: premium.id,
		entity_id: entities[0].id,
		feature_quantities: [
			{ feature_id: TestFeature.Messages, quantity: premiumQuantity },
		],
		billing_cycle_anchor: "now",
	});
	expect(preview.total).toBeCloseTo(expectedTotal, 0);
	expectPreviewNextCycleCorrect({ preview, expectDefined: false });

	const result = await autumnV2_2.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: premium.id,
		entity_id: entities[0].id,
		feature_quantities: [
			{ feature_id: TestFeature.Messages, quantity: premiumQuantity },
		],
		billing_cycle_anchor: "now",
		redirect_mode: "if_required",
	});

	expect(result.invoice).toBeDefined();
	expect(result.invoice?.total).toBeCloseTo(preview.total, 0);

	const entity = await autumnV2_2.entities.get<ApiEntityV2>(
		customerId,
		entities[0].id,
	);
	await expectProductActive({ customer: entity, productId: premium.id });
	await expectProductNotPresent({ customer: entity, productId: pro.id });
	expectBalanceCorrect({
		customer: entity,
		featureId: TestFeature.Messages,
		remaining: premiumQuantity,
		usage: 0,
		planId: premium.id,
		nextResetAt: addMonths(advancedTo, 1).getTime(),
	});

	await expectCustomerInvoiceCorrect({
		customerId,
		count: 2,
		latestTotal: preview.total,
	});
	await expectStripeSubscriptionCorrect({ ctx, customerId });
});

test.concurrent(`${chalk.yellowBright("billing-cycle-anchor-prepaid-entities 2: merged entity upgrade keeps balances sane")}`, async () => {
	const customerId = "anchor-prepaid-ent-merged";
	const entity1ProQuantity = 300;
	const entity2ProQuantity = 500;
	const entity1PremiumQuantity = 400;

	const pro = products.pro({
		id: "pro-prepaid-merged",
		items: [
			items.prepaidMessages({
				includedUsage: 100,
				billingUnits: PREPAID_BILLING_UNITS,
				price: 10,
			}),
		],
	});

	const premium = products.premium({
		id: "premium-prepaid-merged",
		items: [
			items.prepaidMessages({
				includedUsage: 100,
				billingUnits: PREPAID_BILLING_UNITS,
				price: 15,
			}),
		],
	});

	const { autumnV2_2, entities, ctx, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({
				productId: pro.id,
				entityIndex: 0,
				options: [
					{ feature_id: TestFeature.Messages, quantity: entity1ProQuantity },
				],
			}),
			s.billing.attach({
				productId: pro.id,
				entityIndex: 1,
				options: [
					{ feature_id: TestFeature.Messages, quantity: entity2ProQuantity },
				],
			}),
			s.advanceTestClock({ days: 14 }),
		],
	});

	const expectedTotal = await calculateResetBillingCycleNowTotal({
		customerId,
		advancedTo,
		oldAmount: 40,
		newAmount: 95,
	});

	const preview = await autumnV2_2.billing.previewAttach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: premium.id,
		entity_id: entities[0].id,
		feature_quantities: [
			{ feature_id: TestFeature.Messages, quantity: entity1PremiumQuantity },
		],
		billing_cycle_anchor: "now",
	});
	expect(preview.total).toBeCloseTo(expectedTotal, 0);
	expectPreviewNextCycleCorrect({ preview, expectDefined: false });

	const result = await autumnV2_2.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: premium.id,
		entity_id: entities[0].id,
		feature_quantities: [
			{ feature_id: TestFeature.Messages, quantity: entity1PremiumQuantity },
		],
		billing_cycle_anchor: "now",
		redirect_mode: "if_required",
	});

	expect(result.invoice).toBeDefined();
	expect(result.invoice?.total).toBeCloseTo(preview.total, 0);

	const entity1 = await autumnV2_2.entities.get<ApiEntityV2>(
		customerId,
		entities[0].id,
	);
	await expectProductActive({ customer: entity1, productId: premium.id });
	await expectProductNotPresent({ customer: entity1, productId: pro.id });
	expectBalanceCorrect({
		customer: entity1,
		featureId: TestFeature.Messages,
		remaining: entity1PremiumQuantity,
		usage: 0,
		planId: premium.id,
		nextResetAt: addMonths(advancedTo, 1).getTime(),
	});

	const entity2 = await autumnV2_2.entities.get<ApiEntityV2>(
		customerId,
		entities[1].id,
	);
	await expectProductActive({ customer: entity2, productId: pro.id });
	expectBalanceCorrect({
		customer: entity2,
		featureId: TestFeature.Messages,
		remaining: entity2ProQuantity,
		usage: 0,
		planId: pro.id,
		nextResetAt: addMonths(advancedTo, 1).getTime(),
	});

	const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: entity1PremiumQuantity + entity2ProQuantity,
		usage: 0,
		nextResetAt: addMonths(advancedTo, 1).getTime(),
	});
	await expectCustomerInvoiceCorrect({
		customerId,
		count: 3,
		latestTotal: preview.total,
	});
	await expectStripeSubscriptionCorrect({ ctx, customerId });
});
