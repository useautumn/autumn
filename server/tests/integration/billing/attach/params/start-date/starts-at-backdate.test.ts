import { expect, test } from "bun:test";
import { type AttachParamsV1Input, ErrCode, ms } from "@autumn/shared";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { expectAttachBackdateCorrect } from "./utils/expectAttachBackdateCorrect";

test.concurrent(
	`${chalk.yellowBright("starts_at backdate: new paid recurring subscription is backdated")}`,
	async () => {
		const customerId = "attach-starts-at-backdate-new-sub";
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV1, autumnV2_2, ctx, advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		const startsAt = advancedTo - ms.days(35);
		const result = await autumnV2_2.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: pro.id,
			starts_at: startsAt,
		});

		expect(result.invoice?.stripe_id).toBeDefined();
		await expectAttachBackdateCorrect({
			autumn: autumnV1,
			ctx,
			customerId,
			productId: pro.id,
			startsAt,
			result,
			minInvoiceTotal: 2000,
			minInvoiceLineCount: 2,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("starts_at backdate: existing subscriptions are rejected")}`,
	async () => {
		const customerId = "attach-starts-at-backdate-existing-sub";
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const premium = products.premium({
			id: "premium",
			items: [items.monthlyMessages({ includedUsage: 200 })],
		});

		const { autumnV2_2, advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		await expectAutumnError({
			errCode: ErrCode.InvalidRequest,
			errMessage:
				"Past starts_at is only supported when creating a new Stripe subscription",
			func: () =>
				autumnV2_2.billing.attach<AttachParamsV1Input>({
					customer_id: customerId,
					plan_id: premium.id,
					starts_at: advancedTo - ms.days(10),
				}),
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("starts_at backdate: Stripe Checkout-required attaches are rejected")}`,
	async () => {
		const customerId = "attach-starts-at-backdate-checkout";
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV2_2, advancedTo } = await initScenario({
			customerId,
			setup: [s.customer({}), s.products({ list: [pro] })],
			actions: [],
		});

		await expectAutumnError({
			errCode: ErrCode.InvalidRequest,
			errMessage:
				"Past starts_at cannot be used when Stripe Checkout is required",
			func: () =>
				autumnV2_2.billing.attach<AttachParamsV1Input>({
					customer_id: customerId,
					plan_id: pro.id,
					starts_at: advancedTo - ms.days(10),
				}),
		});
	},
);
