import { test } from "bun:test";
import { ApiVersion, BillingInterval, ErrCode } from "@autumn/shared";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";

const flagOffV1 = new AutumnInt({
	version: ApiVersion.V1_2,
	orgConfig: { multi_currency: false },
});
const flagOffV2 = new AutumnInt({
	version: ApiVersion.V2_0,
	orgConfig: { multi_currency: false },
});
const getSuffix = () => Math.random().toString(36).slice(2, 9);

test.concurrent(
	`${chalk.yellowBright("multi-currency flag off: plan items with additional_currencies are rejected")}`,
	async () => {
		await expectAutumnError({
			errCode: ErrCode.InvalidProductItem,
			func: () =>
				flagOffV1.products.create({
					id: `mc_flag_off_${getSuffix()}`,
					name: "MC Flag Off Plan",
					items: [
						{
							price: 20,
							interval: BillingInterval.Month,
							base_currency: "usd",
							additional_currencies: [{ currency: "eur", amount: 18 }],
						},
					],
				}),
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("multi-currency flag off: customer create with a currency is rejected")}`,
	async () => {
		const customerId = `mc-flag-off-cus-${getSuffix()}`;
		await expectAutumnError({
			errCode: ErrCode.InvalidRequest,
			func: () =>
				flagOffV1.customers.create({
					id: customerId,
					name: "MC Flag Off Customer",
					currency: "eur",
				}),
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("multi-currency flag off: attach with a currency param is rejected")}`,
	async () => {
		const pro = products.pro({
			id: "mc_flag_off_attach",
			items: [items.monthlyMessages()],
		});

		const { customerId } = await initScenario({
			customerId: "mc-flag-off-attach",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		await expectAutumnError({
			errCode: ErrCode.InvalidRequest,
			func: () =>
				flagOffV2.billing.attach({
					customer_id: customerId,
					plan_id: pro.id,
					currency: "eur",
				}),
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("multi-currency flag off: plain single-currency flows still work")}`,
	async () => {
		const pro = products.pro({
			id: "mc_flag_off_plain",
			items: [items.monthlyMessages()],
		});

		const { customerId } = await initScenario({
			customerId: "mc-flag-off-plain",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		await flagOffV2.billing.attach({
			customer_id: customerId,
			plan_id: pro.id,
			redirect_mode: "if_required",
		});
	},
);
