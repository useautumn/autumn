// Scheduled downgrades with entity-scoped prepaid products: each entity gets independent inline
// Stripe prices, and the schedule must preserve per-entity pricing through the transition.

import { expect, test } from "bun:test";
import type { ApiCustomerV3, ApiEntityV0 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectCustomerProducts,
	expectProductCanceling,
	expectProductScheduled,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { isBalanceWorkerRoute } from "@tests/utils/balanceWorkerRouteTestUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import {
	BILLING_UNITS,
	INCLUDED_USAGE,
	PREMIUM_BASE,
	PRICE_PER_UNIT,
	PRO_BASE,
	prepaidCost,
} from "./utils/scheduledSwitchPrepaidEntities";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Single entity premium → pro downgrade + advance cycle
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Both entities start on premium ($50/mo) with 500 prepaid messages.
 * Downgrade entity 1 to pro ($20/mo) with 300 messages.
 *
 * Expected:
 *   Entity 1: premium canceling + pro scheduled, balance still 500 (until cycle ends)
 *   Entity 2: premium active, balance 500
 *   Stripe schedule reflects the scheduled downgrade with inline prepaid prices
 */
test.concurrent(
	`${chalk.yellowBright("scheduled-switch-entities-prepaid 1: single entity premium→pro downgrade + advance cycle")}`,
	async () => {
		const customerId = "sched-prepaid-ent-pre-cycle";
		const premiumQuantity = 500;
		const proQuantity = 300;

		const prepaidItem = items.prepaidMessages({
			includedUsage: INCLUDED_USAGE,
			billingUnits: BILLING_UNITS,
			price: PRICE_PER_UNIT,
		});

		const premium = products.premium({
			id: "premium-prepaid",
			items: [prepaidItem],
		});
		const pro = products.pro({
			id: "pro-prepaid",
			items: [prepaidItem],
		});

		const { autumnV1, entities, ctx, testClockId } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [premium, pro] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.billing.attach({
					productId: premium.id,
					entityIndex: 0,
					options: [
						{ feature_id: TestFeature.Messages, quantity: premiumQuantity },
					],
				}),
			],
		});

		// Action under test: downgrade entity 1 to pro (scheduled)
		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: pro.id,
			entity_id: entities[0].id,
			options: [{ feature_id: TestFeature.Messages, quantity: proQuantity }],
			redirect_mode: "if_required",
		});

		// Verify entity 1: premium canceling, pro scheduled
		const entity1 = await autumnV1.entities.get<ApiEntityV0>(
			customerId,
			entities[0].id,
		);
		await expectProductCanceling({ customer: entity1, productId: premium.id });
		await expectProductScheduled({ customer: entity1, productId: pro.id });

		// Balances unchanged before cycle ends
		expectCustomerFeatureCorrect({
			customer: entity1,
			featureId: TestFeature.Messages,
			balance: premiumQuantity,
			usage: 0,
		});

		// Stripe schedule should reflect the downgrade
		await expectStripeSubscriptionCorrect({ ctx, customerId });

		await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
		});

		const customerAfter =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		const entityAfter = await autumnV1.entities.get<ApiEntityV0>(
			customerId,
			entities[0].id,
		);

		await expectCustomerProducts({
			customer: entityAfter,
			active: [pro.id],
			notPresent: [premium.id],
		});

		expectCustomerFeatureCorrect({
			customer: entityAfter,
			featureId: TestFeature.Messages,
			balance: proQuantity,
			usage: 0,
		});
		await expectCustomerProducts({
			customer: customerAfter,
			active: isBalanceWorkerRoute() ? [] : [pro.id],
			notPresent: isBalanceWorkerRoute() ? [pro.id, premium.id] : [premium.id],
		});
		if (isBalanceWorkerRoute()) {
			expect(customerAfter.features[TestFeature.Messages]).toBeUndefined();
		} else {
			expectCustomerFeatureCorrect({
				customer: customerAfter,
				featureId: TestFeature.Messages,
				balance: proQuantity,
				usage: 0,
			});
		}
		await expectStripeSubscriptionCorrect({ ctx, customerId });

		// Invoices:
		//   0 (latest): renewal — pro base ($20) + prepaid 300 ($20) = $40
		//   1: initial — premium base ($50) + prepaid 500 ($40) = $90
		await expectCustomerInvoiceCorrect({
			customer: customerAfter,
			count: 2,
			latestTotal: PRO_BASE + prepaidCost(proQuantity),
		});
		await expectCustomerInvoiceCorrect({
			customer: customerAfter,
			count: 2,
			invoiceIndex: 1,
			latestTotal: PREMIUM_BASE + prepaidCost(premiumQuantity),
		});
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Entity 1 premium → pro, entity 2 stays premium → advance cycle
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Both entities on premium with 500 messages. Downgrade entity 1 to pro with 300.
 * After cycle: entity 1 on pro with 300 balance, entity 2 renewed on premium with 500 balance.
 */
test.concurrent(
	`${chalk.yellowBright("scheduled-switch-entities-prepaid 2: entity 1 premium→pro, entity 2 stays premium, advance cycle")}`,
	async () => {
		const customerId = "sched-prepaid-ent-post-cycle";
		const premiumQuantity = 500;
		const proQuantity = 300;

		const prepaidItem = items.prepaidMessages({
			includedUsage: INCLUDED_USAGE,
			billingUnits: BILLING_UNITS,
			price: PRICE_PER_UNIT,
		});

		const premium = products.premium({
			id: "premium-prepaid",
			items: [prepaidItem],
		});
		const pro = products.pro({
			id: "pro-prepaid",
			items: [prepaidItem],
		});

		const { autumnV1, entities, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [premium, pro] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.billing.attach({
					productId: premium.id,
					entityIndex: 0,
					options: [
						{ feature_id: TestFeature.Messages, quantity: premiumQuantity },
					],
				}),
				s.billing.attach({
					productId: premium.id,
					entityIndex: 1,
					options: [
						{ feature_id: TestFeature.Messages, quantity: premiumQuantity },
					],
				}),
				s.billing.attach({
					productId: pro.id,
					entityIndex: 0,
					options: [
						{ feature_id: TestFeature.Messages, quantity: proQuantity },
					],
				}),
				s.advanceToNextInvoice(),
			],
		});

		// After cycle: entity 1 on pro, entity 2 on premium
		const entity1 = await autumnV1.entities.get<ApiEntityV0>(
			customerId,
			entities[0].id,
		);
		const entity2 = await autumnV1.entities.get<ApiEntityV0>(
			customerId,
			entities[1].id,
		);

		await expectCustomerProducts({
			customer: entity1,
			active: [pro.id],
			notPresent: [premium.id],
		});
		await expectCustomerProducts({
			customer: entity2,
			active: [premium.id],
			notPresent: [pro.id],
		});

		// Entity 1 gets pro quantity, entity 2 keeps premium quantity
		expectCustomerFeatureCorrect({
			customer: entity1,
			featureId: TestFeature.Messages,
			balance: proQuantity,
			usage: 0,
		});
		expectCustomerFeatureCorrect({
			customer: entity2,
			featureId: TestFeature.Messages,
			balance: premiumQuantity,
			usage: 0,
		});

		await expectStripeSubscriptionCorrect({ ctx, customerId });

		// Invoices:
		//   0 (latest): renewal — entity 1 pro ($20+$20) + entity 2 premium ($50+$40) = $130
		//   1: initial — entity 2 premium ($50+$40) = $90
		//   2: initial — entity 1 premium ($50+$40) = $90
		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerInvoiceCorrect({
			customer,
			count: 3,
			latestTotal:
				PRO_BASE +
				prepaidCost(proQuantity) +
				PREMIUM_BASE +
				prepaidCost(premiumQuantity),
		});
	},
);
