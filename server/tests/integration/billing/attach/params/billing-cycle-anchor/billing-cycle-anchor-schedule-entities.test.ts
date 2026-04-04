import { expect, test } from "bun:test";
import type {
	ApiCustomerV5,
	ApiEntityV2,
	AttachParamsV1Input,
} from "@autumn/shared";
import { advanceToAnchor } from "@tests/integration/billing/utils/advanceUtils/advanceToAnchor";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectProductActive,
	expectProductNotPresent,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
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

const PREPAID_BILLING_UNITS = 100;

test.skip(`${chalk.yellowBright("billing-cycle-anchor-schedule-entities 1: single entity scheduled anchor before next cycle")}`, async () => {
	const customerId = "anchor-sched-ent-single";
	const proQuantity = 300;
	const premiumQuantity = 500;

	const pro = products.pro({
		id: "pro-sched-entity",
		items: [
			items.prepaidMessages({
				includedUsage: 100,
				billingUnits: PREPAID_BILLING_UNITS,
				price: 10,
			}),
		],
	});

	const premium = products.premium({
		id: "premium-sched-entity",
		items: [
			items.prepaidMessages({
				includedUsage: 200,
				billingUnits: PREPAID_BILLING_UNITS,
				price: 15,
			}),
		],
	});

	const { autumnV2_2, entities, ctx, advancedTo, testClockId } =
		await initScenario({
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
					options: [
						{ feature_id: TestFeature.Messages, quantity: proQuantity },
					],
				}),
			],
		});

	const scheduledAnchorMs = addDays(advancedTo, 10).getTime();

	const expectedNextCycle = await calculateBillingCycleAnchorResetNextCycle({
		customerId,
		billingCycleAnchorMs: scheduledAnchorMs,
		nextCycleAmount: 95,
	});

	const preview = await autumnV2_2.billing.previewAttach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: premium.id,
		entity_id: entities[0].id,
		feature_quantities: [
			{ feature_id: TestFeature.Messages, quantity: premiumQuantity },
		],
		// @ts-ignore scheduled anchor not yet supported
		billing_cycle_anchor: scheduledAnchorMs,
	});

	expect(preview.total).toBe(0);
	expectPreviewNextCycleCorrect({
		preview,
		startsAt: expectedNextCycle.startsAt,
		total: expectedNextCycle.total,
	});

	const result = await autumnV2_2.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: premium.id,
		entity_id: entities[0].id,
		feature_quantities: [
			{ feature_id: TestFeature.Messages, quantity: premiumQuantity },
		],
		// @ts-ignore scheduled anchor not yet supported
		billing_cycle_anchor: scheduledAnchorMs,
		redirect_mode: "if_required",
	});

	expect(result.invoice).toBeUndefined();
	await expectStripeSubscriptionCorrect({ ctx, customerId });

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
		nextResetAt: scheduledAnchorMs,
	});

	await expectCustomerInvoiceCorrect({
		customerId,
		count: 1,
		latestTotal: 40,
	});

	await advanceToAnchor({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		advancedTo,
		anchorMs: scheduledAnchorMs,
	});

	const entityAfterReset = await autumnV2_2.entities.get<ApiEntityV2>(
		customerId,
		entities[0].id,
	);
	await expectProductActive({
		customer: entityAfterReset,
		productId: premium.id,
	});
	expectBalanceCorrect({
		customer: entityAfterReset,
		featureId: TestFeature.Messages,
		remaining: premiumQuantity,
		usage: 0,
		planId: premium.id,
	});

	await expectCustomerInvoiceCorrect({
		customerId,
		count: 2,
		latestTotal: expectedNextCycle.total,
	});

	await expectStripeSubscriptionCorrect({ ctx, customerId });
});

test.skip(`${chalk.yellowBright("billing-cycle-anchor-schedule-entities 2: two entities shared sub, upgrade one resets both cycles")}`, async () => {
	const customerId = "anchor-sched-ent-shared";
	const entity1ProQuantity = 300;
	const entity2ProQuantity = 500;
	const entity1PremiumQuantity = 400;

	const pro = products.pro({
		id: "pro-sched-shared",
		items: [
			items.prepaidMessages({
				includedUsage: 100,
				billingUnits: PREPAID_BILLING_UNITS,
				price: 10,
			}),
		],
	});

	const premium = products.premium({
		id: "premium-sched-shared",
		items: [
			items.prepaidMessages({
				includedUsage: 100,
				billingUnits: PREPAID_BILLING_UNITS,
				price: 15,
			}),
		],
	});

	const { autumnV2_2, entities, ctx, advancedTo, testClockId } =
		await initScenario({
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
						{
							feature_id: TestFeature.Messages,
							quantity: entity1ProQuantity,
						},
					],
				}),
				s.billing.attach({
					productId: pro.id,
					entityIndex: 1,
					options: [
						{
							feature_id: TestFeature.Messages,
							quantity: entity2ProQuantity,
						},
					],
				}),
			],
		});

	const scheduledAnchorMs = addDays(advancedTo, 10).getTime();

	const preview = await autumnV2_2.billing.previewAttach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: premium.id,
		entity_id: entities[0].id,
		feature_quantities: [
			{ feature_id: TestFeature.Messages, quantity: entity1PremiumQuantity },
		],
		// @ts-ignore scheduled anchor not yet supported
		billing_cycle_anchor: scheduledAnchorMs,
	});

	expect(preview.total).toBe(0);

	const result = await autumnV2_2.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: premium.id,
		entity_id: entities[0].id,
		feature_quantities: [
			{ feature_id: TestFeature.Messages, quantity: entity1PremiumQuantity },
		],
		// @ts-ignore scheduled anchor not yet supported
		billing_cycle_anchor: scheduledAnchorMs,
		redirect_mode: "if_required",
	});

	expect(result.invoice).toBeUndefined();
	await expectStripeSubscriptionCorrect({ ctx, customerId });

	const entity1BeforeReset = await autumnV2_2.entities.get<ApiEntityV2>(
		customerId,
		entities[0].id,
	);
	await expectProductActive({
		customer: entity1BeforeReset,
		productId: premium.id,
	});
	await expectProductNotPresent({
		customer: entity1BeforeReset,
		productId: pro.id,
	});
	expectBalanceCorrect({
		customer: entity1BeforeReset,
		featureId: TestFeature.Messages,
		remaining: entity1PremiumQuantity,
		usage: 0,
		planId: premium.id,
		nextResetAt: scheduledAnchorMs,
	});

	const entity2BeforeReset = await autumnV2_2.entities.get<ApiEntityV2>(
		customerId,
		entities[1].id,
	);
	await expectProductActive({
		customer: entity2BeforeReset,
		productId: pro.id,
	});
	expectBalanceCorrect({
		customer: entity2BeforeReset,
		featureId: TestFeature.Messages,
		remaining: entity2ProQuantity,
		usage: 0,
		planId: pro.id,
	});

	await advanceToAnchor({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		advancedTo,
		anchorMs: scheduledAnchorMs,
	});

	const entity1AfterReset = await autumnV2_2.entities.get<ApiEntityV2>(
		customerId,
		entities[0].id,
	);
	await expectProductActive({
		customer: entity1AfterReset,
		productId: premium.id,
	});
	expectBalanceCorrect({
		customer: entity1AfterReset,
		featureId: TestFeature.Messages,
		remaining: entity1PremiumQuantity,
		usage: 0,
		planId: premium.id,
	});

	const entity2AfterReset = await autumnV2_2.entities.get<ApiEntityV2>(
		customerId,
		entities[1].id,
	);
	await expectProductActive({
		customer: entity2AfterReset,
		productId: pro.id,
	});
	expectBalanceCorrect({
		customer: entity2AfterReset,
		featureId: TestFeature.Messages,
		remaining: entity2ProQuantity,
		usage: 0,
		planId: pro.id,
	});

	const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: entity1PremiumQuantity + entity2ProQuantity,
		usage: 0,
	});

	await expectStripeSubscriptionCorrect({ ctx, customerId });
});
