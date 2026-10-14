import { expect, test } from "bun:test";
import type { ApiCustomerV5, MultiUpdateParamsV0Input } from "@autumn/shared";
import { expectMultiUpdatePreviewCorrect } from "@tests/integration/billing/multi-update/utils/expectMultiUpdatePreviewCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectNoStripeSubscription } from "@tests/integration/billing/utils/expectNoStripeSubscription";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("multi update mixed products: free + paid canceled in one call")}`,
	async () => {
		const customerId = "multi-update-mixed-free-paid";

		const proA = products.pro({
			id: "pro-a",
			items: [items.monthlyWords({ includedUsage: 100 })],
			group: `${customerId}_a`,
		});
		const freeB = products.base({
			id: "free-b",
			items: [items.monthlyMessages({ includedUsage: 100 })],
			group: `${customerId}_b`,
		});

		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [proA, freeB] }),
			],
			actions: [
				s.attach({ productId: proA.id }),
				s.attach({ productId: freeB.id }),
			],
		});

		const multiUpdateParams: MultiUpdateParamsV0Input = {
			customer_id: customerId,
			updates: [
				{ plan_id: freeB.id, cancel_action: "cancel_immediately" },
				{ plan_id: proA.id, cancel_action: "cancel_immediately" },
			],
		};

		const preview = await expectMultiUpdatePreviewCorrect({
			autumn: autumnV2_3,
			params: multiUpdateParams,
			total: -20,
			subscriptions: [{ planIds: [proA.id], total: -20, nextCycleTotal: null }],
		});

		await autumnV2_3.billing.multiUpdate<MultiUpdateParamsV0Input>(
			multiUpdateParams,
		);

		const customerAfterCancel =
			await autumnV2_3.customers.get<ApiCustomerV5>(customerId);

		await expectCustomerProducts({
			customer: customerAfterCancel,
			notPresent: [proA.id, freeB.id],
		});

		await expectCustomerInvoiceCorrect({
			customerId,
			count: 2,
			latestTotal: preview.total,
		});

		await expectNoStripeSubscription({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("multi update mixed products: one-off immediate + recurring EOC")}`,
	async () => {
		const customerId = "multi-update-mixed-oneoff";

		const pro = products.pro({
			id: "pro",
			items: [items.monthlyWords({ includedUsage: 100 })],
		});
		const oneOffAddOn = products.oneOffAddOn({
			id: "one-off-addon",
			items: [
				items.oneOffMessages({
					includedUsage: 0,
					billingUnits: 100,
					price: 10,
				}),
			],
		});

		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, oneOffAddOn] }),
			],
			actions: [
				s.attach({ productId: pro.id }),
				s.attach({
					productId: oneOffAddOn.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
				}),
			],
		});

		await autumnV2_3.billing.multiUpdate<MultiUpdateParamsV0Input>({
			customer_id: customerId,
			updates: [
				{ plan_id: oneOffAddOn.id, cancel_action: "cancel_immediately" },
				{ plan_id: pro.id, cancel_action: "cancel_end_of_cycle" },
			],
		});

		const customerAfterCancel =
			await autumnV2_3.customers.get<ApiCustomerV5>(customerId);

		await expectCustomerProducts({
			customer: customerAfterCancel,
			canceling: [pro.id],
		});
		expect(
			customerAfterCancel.purchases.some(
				(purchase) => purchase.plan_id === oneOffAddOn.id,
			),
		).toBe(false);

		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
			shouldBeCanceled: true,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("multi update mixed products: trialing + one-off, no charges or credits")}`,
	async () => {
		const customerId = "multi-update-mixed-trial";

		const proTrial = products.proWithTrial({
			id: "pro-trial",
			items: [items.monthlyWords({ includedUsage: 100 })],
			trialDays: 7,
		});
		const oneOffAddOn = products.oneOffAddOn({
			id: "one-off-addon",
			items: [
				items.oneOffMessages({
					includedUsage: 0,
					billingUnits: 100,
					price: 10,
				}),
			],
		});

		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [proTrial, oneOffAddOn] }),
			],
			actions: [
				s.attach({ productId: proTrial.id }),
				s.attach({
					productId: oneOffAddOn.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
				}),
			],
		});

		await expectCustomerInvoiceCorrect({ customerId, count: 2 });

		await autumnV2_3.billing.multiUpdate<MultiUpdateParamsV0Input>({
			customer_id: customerId,
			updates: [
				{ plan_id: proTrial.id, cancel_action: "cancel_immediately" },
				{ plan_id: oneOffAddOn.id, cancel_action: "cancel_immediately" },
			],
		});

		const customerAfterCancel =
			await autumnV2_3.customers.get<ApiCustomerV5>(customerId);

		await expectCustomerProducts({
			customer: customerAfterCancel,
			notPresent: [proTrial.id],
		});
		expect(
			customerAfterCancel.purchases.some(
				(purchase) => purchase.plan_id === oneOffAddOn.id,
			),
		).toBe(false);

		await expectCustomerInvoiceCorrect({ customerId, count: 2 });

		await expectNoStripeSubscription({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("multi update mixed products: two groups, both defaults scheduled")}`,
	async () => {
		const customerId = "multi-update-mixed-defaults";

		const freeA = products.base({
			id: "free-a",
			items: [items.dashboard()],
			isDefault: true,
			group: `${customerId}_a`,
		});
		const proA = products.pro({
			id: "pro-a",
			items: [items.monthlyWords({ includedUsage: 100 })],
			group: `${customerId}_a`,
		});
		const freeB = products.base({
			id: "free-b",
			items: [items.monthlyMessages({ includedUsage: 100 })],
			isDefault: true,
			group: `${customerId}_b`,
		});
		const proB = products.pro({
			id: "pro-b",
			items: [items.monthlyUsers({ includedUsage: 5 })],
			group: `${customerId}_b`,
		});

		const { autumnV2_3, ctx, testClockId } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [freeA, proA, freeB, proB] }),
			],
			actions: [
				s.attach({ productId: proA.id }),
				s.attach({ productId: proB.id }),
			],
		});

		await autumnV2_3.billing.multiUpdate<MultiUpdateParamsV0Input>({
			customer_id: customerId,
			updates: [
				{ plan_id: proA.id, cancel_action: "cancel_end_of_cycle" },
				{ plan_id: proB.id, cancel_action: "cancel_end_of_cycle" },
			],
		});

		const customerAfterCancel =
			await autumnV2_3.customers.get<ApiCustomerV5>(customerId);

		await expectCustomerProducts({
			customer: customerAfterCancel,
			canceling: [proA.id, proB.id],
			scheduled: [freeA.id, freeB.id],
		});

		await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
		});

		const customerAfterAdvance =
			await autumnV2_3.customers.get<ApiCustomerV5>(customerId);

		await expectCustomerProducts({
			customer: customerAfterAdvance,
			active: [freeA.id, freeB.id],
			notPresent: [proA.id, proB.id],
		});

		await expectNoStripeSubscription({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});
	},
);
