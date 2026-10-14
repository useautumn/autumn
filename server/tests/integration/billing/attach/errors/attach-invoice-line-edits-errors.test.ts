/**
 * add_lines / remove_lines errors on attach.
 *
 * Contract (all 400):
 *   - A change scheduled for the end of the cycle bills nothing now.
 *   - Combined with custom_line_items.
 *   - remove_lines names a plan with no line, matches no line, or two entries match the same line.
 */

import { test } from "bun:test";
import { type AttachParamsV1Input, BillingMethod } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

const NEEDS_CHARGE_NOW = "add_lines needs a charge billed now";

test.concurrent(
	`${chalk.yellowBright("attach invoice line edits errors 1: a change scheduled for the end of the cycle bills nothing now")}`,
	async () => {
		const customerId = "attach-line-edits-err-invoice";
		const pro = products.pro({
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const premium = products.premium({
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});

		const { autumnV2_5 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [],
		});

		await autumnV2_5.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: premium.id,
			redirect_mode: "if_required",
		});

		await expectAutumnError({
			errMessage: `${NEEDS_CHARGE_NOW}; this request schedules the change for the end of the cycle`,
			func: () =>
				autumnV2_5.billing.attach<AttachParamsV1Input>({
					customer_id: customerId,
					plan_id: pro.id,
					redirect_mode: "if_required",
					add_lines: [{ amount: 10, description: "Downgrade fee" }],
				}),
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("attach invoice line edits errors 2: remove_lines must match lines on this invoice, once each")}`,
	async () => {
		const customerId = "attach-line-edits-err-match";
		const pro = products.pro({
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const premium = products.premium({
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});
		const growth = products.growth({
			items: [items.monthlyMessages({ includedUsage: 1000 })],
		});

		const { autumnV2_5 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium, growth] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		const attachPremium = (params: Partial<AttachParamsV1Input>) =>
			autumnV2_5.billing.previewAttach<AttachParamsV1Input>({
				customer_id: customerId,
				plan_id: premium.id,
				redirect_mode: "if_required",
				...params,
			});

		await expectAutumnError({
			errMessage: `remove_lines[0].plan_id "${growth.id}" has no line on this invoice`,
			func: () => attachPremium({ remove_lines: [{ plan_id: growth.id }] }),
		});

		await expectAutumnError({
			errMessage:
				"remove_lines[0].feature_quantities[0] matches no line on this invoice",
			func: () =>
				attachPremium({
					remove_lines: [
						{
							plan_id: pro.id,
							feature_quantities: [
								{
									feature_id: TestFeature.Messages,
									billing_behavior: BillingMethod.Prepaid,
								},
							],
						},
					],
				}),
		});

		await expectAutumnError({
			errMessage: "remove_lines[0].price matches no line on this invoice",
			func: () =>
				attachPremium({
					remove_lines: [{ plan_id: pro.id, price: true, direction: "charge" }],
				}),
		});

		await expectAutumnError({
			errMessage:
				"remove_lines[0] and remove_lines[1].price match the same line",
			func: () =>
				attachPremium({
					remove_lines: [{ plan_id: pro.id }, { plan_id: pro.id, price: true }],
				}),
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("attach invoice line edits errors 3: custom_line_items can't be combined with add_lines or remove_lines")}`,
	async () => {
		const customerId = "attach-line-edits-err-custom";
		const pro = products.pro({
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const premium = products.premium({
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});

		const { autumnV2_5 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		await expectAutumnError({
			errMessage:
				"custom_line_items replaces all lines; it can't be combined with add_lines or remove_lines",
			func: () =>
				autumnV2_5.billing.attach<AttachParamsV1Input>({
					customer_id: customerId,
					plan_id: premium.id,
					redirect_mode: "if_required",
					custom_line_items: [{ amount: 15, description: "Agreed charge" }],
					add_lines: [{ amount: 5, description: "Setup" }],
				}),
		});
	},
);
