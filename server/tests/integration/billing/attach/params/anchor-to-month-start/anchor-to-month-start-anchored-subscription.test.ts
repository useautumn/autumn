/**
 * Changes to a subscription that is already anchored to the 1st.
 *
 * Contract:
 *   quantity update         → Stripe anchor stays on the 1st; resets stay on the 1st
 *   premium → pro downgrade → scheduled to start on the 1st
 *   pro → premium upgrade   → premium prorated over the full month, pro stub credited
 */

import { expect, test } from "bun:test";
import type {
	ApiCustomerV5,
	AttachParamsV1Input,
	UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { calculateAnchorStubUpgradeTotal } from "@tests/integration/billing/utils/proration";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { subDays } from "date-fns";
import {
	anchoredToMonthStart,
	expectStripeSubscriptionAnchorCorrect,
	nextMonthStartMs,
} from "./utils/anchorToMonthStartUtils";

const EXACT_MS = 1000;
const PRO_MONTHLY_PRICE = 20;
const PREMIUM_MONTHLY_PRICE = 50;

test.concurrent(
	`${chalk.yellowBright("anchor-to-month-start anchored sub 1: quantity update keeps the 1st")}`,
	async () => {
		const customerId = "anchor-month-anchored-update";
		const pro = anchoredToMonthStart(
			products.pro({
				id: "pro",
				items: [items.prepaidMessages({ billingUnits: 100, price: 10 })],
			}),
		);

		const { autumnV2_3, advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [
				s.billing.attach({
					productId: pro.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
				}),
				s.advanceTestClock({ days: 1 }),
			],
		});
		const monthStartMs = nextMonthStartMs({ fromMs: advancedTo });

		await autumnV2_3.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: pro.id,
			feature_quantities: [{ feature_id: TestFeature.Messages, quantity: 200 }],
			redirect_mode: "if_required",
		});

		await expectStripeSubscriptionAnchorCorrect({
			customerId,
			anchorMs: monthStartMs,
		});
		await expectBalanceCorrect({
			customerId,
			autumn: autumnV2_3,
			featureId: TestFeature.Messages,
			planId: pro.id,
			nextResetAt: monthStartMs,
			toleranceMs: EXACT_MS,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("anchor-to-month-start anchored sub 2: premium -> pro downgrade is scheduled for the 1st")}`,
	async () => {
		const customerId = "anchor-month-anchored-downgrade";
		const premium = anchoredToMonthStart(
			products.premium({
				id: "premium",
				items: [items.monthlyMessages({ includedUsage: 500 })],
			}),
		);
		const pro = anchoredToMonthStart(
			products.pro({
				id: "pro",
				items: [items.monthlyMessages({ includedUsage: 100 })],
			}),
		);

		const { autumnV2_3, advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [premium, pro] }),
			],
			actions: [
				s.billing.attach({ productId: premium.id }),
				s.advanceTestClock({ days: 1 }),
			],
		});
		const monthStartMs = nextMonthStartMs({ fromMs: advancedTo });

		await autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: pro.id,
		});

		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		const scheduledPro = customer.subscriptions?.find(
			(subscription) => subscription.plan_id === pro.id,
		);
		expect(scheduledPro?.status).toBe("scheduled");
		expect(
			Math.abs((scheduledPro?.started_at ?? 0) - monthStartMs),
		).toBeLessThan(EXACT_MS);
		await expectStripeSubscriptionAnchorCorrect({
			customerId,
			anchorMs: monthStartMs,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("anchor-to-month-start anchored sub 3: pro -> premium upgrade prorates to the 1st")}`,
	async () => {
		const customerId = "anchor-month-anchored-upgrade";
		const pro = anchoredToMonthStart(
			products.pro({
				id: "pro",
				items: [items.monthlyMessages({ includedUsage: 100 })],
			}),
		);
		const premium = anchoredToMonthStart(
			products.premium({
				id: "premium",
				items: [items.monthlyMessages({ includedUsage: 500 })],
			}),
		);

		const { autumnV2_3, autumnV1, advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.advanceTestClock({ days: 1 }),
			],
		});

		const upgradeParams: AttachParamsV1Input = {
			customer_id: customerId,
			plan_id: premium.id,
		};
		const expectedUpgradeTotal = calculateAnchorStubUpgradeTotal({
			attachedAt: subDays(advancedTo, 1).getTime(),
			upgradedAt: advancedTo,
			anchorMs: nextMonthStartMs({ fromMs: advancedTo }),
			oldAmount: PRO_MONTHLY_PRICE,
			newAmount: PREMIUM_MONTHLY_PRICE,
		});
		const preview =
			await autumnV2_3.billing.previewAttach<AttachParamsV1Input>(
				upgradeParams,
			);
		expect(preview.total).toBe(expectedUpgradeTotal);
		await autumnV2_3.billing.attach<AttachParamsV1Input>(upgradeParams);

		await expectStripeSubscriptionAnchorCorrect({
			customerId,
			anchorMs: nextMonthStartMs({ fromMs: advancedTo }),
		});
		await expectCustomerInvoiceCorrect({
			customerId,
			autumn: autumnV1,
			count: 2,
			latestTotal: expectedUpgradeTotal,
		});
	},
);
