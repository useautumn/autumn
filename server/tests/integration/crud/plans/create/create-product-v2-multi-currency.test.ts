import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	type ApiPlanV1,
	ApiVersion,
	ErrCode,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { AutumnRpcCli } from "@/external/autumn/autumnRpcCli.js";

const autumnRpc = new AutumnRpcCli({ version: ApiVersion.V2_1 });
const getSuffix = () => Math.random().toString(36).slice(2, 9);

const dashboardItems = () => {
	const baseItem = {
		...items.monthlyPrice({ price: 20 }),
		base_currency: "usd",
		additional_currencies: [{ currency: "eur", amount: 18 }],
	};
	const consumable = items.tieredConsumableMessages({
		tiers: [
			{ to: 500, amount: 0.1 },
			{ to: "inf", amount: 0.05 },
		],
	});
	const tieredItem = {
		...consumable,
		base_currency: "usd",
		tiers: consumable.tiers?.map((tier, index) => ({
			...tier,
			additional_currencies: [
				{ currency: "eur", amount: index === 0 ? 0.09 : 0.04 },
			],
		})),
	};
	return { baseItem, tieredItem };
};

test.concurrent(
	`${chalk.yellowBright("products v2 multi-currency: dashboard-shaped save round-trips and bills in eur")}`,
	async () => {
		const productId = `v2_mc_${getSuffix()}`;
		const { baseItem, tieredItem } = dashboardItems();

		const { customerId, autumnV1, ctx } = await initScenario({
			customerId: "v2-mc-eur",
			setup: [
				s.customer({ paymentMethod: "success", data: { currency: "eur" } }),
			],
			actions: [],
		});

		await autumnV1.products.create({
			id: productId,
			name: "V2 MC Product",
			items: [baseItem, tieredItem],
		});

		const fetched = await autumnRpc.plans.get<ApiPlanV1>(productId);
		expect(fetched.price?.additional_currencies).toEqual([
			{ currency: "eur", amount: 18 },
		]);
		const fetchedTiers = fetched.items[0]?.price?.tiers;
		expect(fetchedTiers?.[0]?.additional_currencies).toEqual([
			{ currency: "eur", amount: 0.09 },
		]);
		expect(fetchedTiers?.[1]?.additional_currencies).toEqual([
			{ currency: "eur", amount: 0.04 },
		]);

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: productId,
			redirect_mode: "if_required",
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductActive({ customer, productId });
		expectCustomerInvoiceCorrect({ customer, count: 1, latestTotal: 18 });

		const subs = await ctx.stripeCli.subscriptions.list({
			customer: customer.stripe_id as string,
		});
		expect(subs.data).toHaveLength(1);
		expect(subs.data[0].currency).toBe("eur");
	},
);

test.concurrent(
	`${chalk.yellowBright("products v2 multi-currency: additional_currencies without base_currency is rejected")}`,
	async () => {
		const productId = `v2_mc_bad_${getSuffix()}`;
		const { baseItem } = dashboardItems();
		const { base_currency: _, ...unstamped } = baseItem;

		const { autumnV1 } = await initScenario({
			customerId: "v2-mc-reject",
			setup: [s.customer({})],
			actions: [],
		});

		await expectAutumnError({
			errCode: ErrCode.InvalidProductItem,
			func: () =>
				autumnV1.products.create({
					id: productId,
					name: "V2 MC Bad Product",
					items: [unstamped],
				}),
		});
	},
);
