import { expect, test } from "bun:test";
import type { ApiCustomerV5, MultiUpdateParamsV0Input } from "@autumn/shared";
import {
	expectCustomerProducts,
	expectProductActive,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectNoStripeSubscription } from "@tests/integration/billing/utils/expectNoStripeSubscription";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("multi update errors: duplicate targets rejected")}`,
	async () => {
		const customerId = "multi-update-err-dup";

		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.attach({ productId: pro.id })],
		});

		await expectAutumnError({
			func: async () => {
				await autumnV2_3.billing.multiUpdate<MultiUpdateParamsV0Input>({
					customer_id: customerId,
					updates: [
						{ plan_id: pro.id, cancel_action: "cancel_end_of_cycle" },
						{ plan_id: pro.id, cancel_action: "cancel_immediately" },
					],
				});
			},
		});

		const customerAfterError =
			await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		await expectProductActive({
			customer: customerAfterError,
			productId: pro.id,
		});
		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
			shouldBeCanceled: false,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("multi update errors: unknown plan rejects whole request")}`,
	async () => {
		const customerId = "multi-update-err-unknown";

		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.attach({ productId: pro.id })],
		});

		await expectAutumnError({
			func: async () => {
				await autumnV2_3.billing.multiUpdate<MultiUpdateParamsV0Input>({
					customer_id: customerId,
					updates: [
						{ plan_id: pro.id, cancel_action: "cancel_end_of_cycle" },
						{
							plan_id: "nonexistent-plan",
							cancel_action: "cancel_immediately",
						},
					],
				});
			},
		});

		const customerAfterError =
			await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		await expectProductActive({
			customer: customerAfterError,
			productId: pro.id,
		});
		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
			shouldBeCanceled: false,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("multi update errors: EOC on free product rejects whole request")}`,
	async () => {
		const customerId = "multi-update-err-free-eoc";

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

		await expectAutumnError({
			func: async () => {
				await autumnV2_3.billing.multiUpdate<MultiUpdateParamsV0Input>({
					customer_id: customerId,
					updates: [
						{ plan_id: proA.id, cancel_action: "cancel_end_of_cycle" },
						{ plan_id: freeB.id, cancel_action: "cancel_end_of_cycle" },
					],
				});
			},
		});

		const customerAfterError =
			await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		await expectCustomerProducts({
			customer: customerAfterError,
			active: [proA.id, freeB.id],
		});
		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
			shouldBeCanceled: false,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("multi update errors: EOC on one-off product rejects whole request")}`,
	async () => {
		const customerId = "multi-update-err-oneoff-eoc";

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

		const { autumnV2_3 } = await initScenario({
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

		await expectAutumnError({
			func: async () => {
				await autumnV2_3.billing.multiUpdate<MultiUpdateParamsV0Input>({
					customer_id: customerId,
					updates: [
						{ plan_id: oneOffAddOn.id, cancel_action: "cancel_end_of_cycle" },
						{ plan_id: pro.id, cancel_action: "cancel_end_of_cycle" },
					],
				});
			},
		});

		const customerAfterError =
			await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		await expectCustomerProducts({
			customer: customerAfterError,
			active: [pro.id],
		});
		expect(
			customerAfterError.purchases.some(
				(purchase) => purchase.plan_id === oneOffAddOn.id,
			),
		).toBe(true);
	},
);

test.concurrent(
	`${chalk.yellowBright("multi update errors: schema validation")}`,
	async () => {
		const customerId = "multi-update-err-schema";

		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.attach({ productId: pro.id })],
		});

		await expectAutumnError({
			func: async () => {
				await autumnV2_3.billing.multiUpdate({
					customer_id: customerId,
					updates: [],
				});
			},
		});

		await expectAutumnError({
			func: async () => {
				await autumnV2_3.billing.multiUpdate({
					customer_id: customerId,
					updates: [{ plan_id: pro.id }] as never,
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("multi update errors: already-canceling plan cancels immediately")}`,
	async () => {
		const customerId = "multi-update-err-already-canceling";

		const proA = products.pro({
			id: "pro-a",
			items: [items.monthlyWords({ includedUsage: 100 })],
			group: `${customerId}_a`,
		});
		const proB = products.pro({
			id: "pro-b",
			items: [items.monthlyUsers({ includedUsage: 5 })],
			group: `${customerId}_b`,
		});

		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [proA, proB] }),
			],
			actions: [
				s.attach({ productId: proA.id }),
				s.attach({ productId: proB.id }),
				s.updateSubscription({
					productId: proA.id,
					cancelAction: "cancel_end_of_cycle",
				}),
			],
		});

		await autumnV2_3.billing.multiUpdate<MultiUpdateParamsV0Input>({
			customer_id: customerId,
			updates: [
				{ plan_id: proA.id, cancel_action: "cancel_immediately" },
				{ plan_id: proB.id, cancel_action: "cancel_immediately" },
			],
		});

		const customerAfterCancel =
			await autumnV2_3.customers.get<ApiCustomerV5>(customerId);

		await expectCustomerProducts({
			customer: customerAfterCancel,
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
