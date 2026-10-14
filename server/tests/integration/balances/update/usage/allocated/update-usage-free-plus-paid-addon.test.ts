import { expect, test } from "bun:test";
import type { ApiCustomer } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

const PRICE_PER_USER = 1;

const setupFreePlusPaidAddOn = async ({
	customerId,
}: {
	customerId: string;
}) => {
	const base = products.base({
		id: "base",
		items: [items.freeAllocatedUsers({ includedUsage: 3 })],
	});
	const addOn = products.base({
		id: "users-addon",
		isAddOn: true,
		items: [
			items.allocatedV2Users({
				includedUsage: 0,
				pricePerUnit: PRICE_PER_USER,
			}),
		],
	});

	return initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [base, addOn] }),
		],
		actions: [
			s.billing.attach({ productId: base.id }),
			s.billing.attach({ productId: addOn.id }),
		],
	});
};

type Autumn = Awaited<ReturnType<typeof setupFreePlusPaidAddOn>>["autumnV2"];

const expectSplit = async ({
	autumnV2,
	customerId,
	usage,
	baseUsage,
	addOnUsage,
}: {
	autumnV2: Autumn;
	customerId: string;
	usage: number;
	baseUsage: number;
	addOnUsage: number;
}) => {
	for (const params of [undefined, { skip_cache: "true" }]) {
		const customer = await autumnV2.customers.get<ApiCustomer>(
			customerId,
			params,
		);
		const balance = customer.balances[TestFeature.Users];
		expect(balance.usage).toBe(usage);

		const breakdown = balance.breakdown ?? [];
		const baseBreakdown = breakdown.find((item) => item.granted_balance === 3);
		const addOnBreakdown = breakdown.find((item) => item.granted_balance === 0);
		expect(baseBreakdown).toMatchObject({
			usage: baseUsage,
			purchased_balance: 0,
		});
		expect(addOnBreakdown).toMatchObject({
			usage: addOnUsage,
			purchased_balance: addOnUsage,
		});
	}
};

test.concurrent(
	`${chalk.yellowBright("update-usage free + paid add-on: overage lands on the add-on and bills at cycle end")}`,
	async () => {
		const customerId = "update-usage-free-plus-paid-addon";
		const { autumnV1, autumnV2, ctx, testClockId } =
			await setupFreePlusPaidAddOn({ customerId });

		const setUsage = (usage: number) =>
			autumnV2.balances.update({
				customer_id: customerId,
				feature_id: TestFeature.Users,
				usage,
			});

		await setUsage(5);
		await expectSplit({
			autumnV2,
			customerId,
			usage: 5,
			baseUsage: 3,
			addOnUsage: 2,
		});

		await setUsage(4);
		await expectSplit({
			autumnV2,
			customerId,
			usage: 4,
			baseUsage: 3,
			addOnUsage: 1,
		});

		await setUsage(2);
		await expectSplit({
			autumnV2,
			customerId,
			usage: 2,
			baseUsage: 2,
			addOnUsage: 0,
		});

		await setUsage(4);
		await expectSplit({
			autumnV2,
			customerId,
			usage: 4,
			baseUsage: 3,
			addOnUsage: 1,
		});

		await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			withPause: true,
		});
		await expectCustomerInvoiceCorrect({
			customerId,
			autumn: autumnV1,
			count: 1,
			latestTotal: PRICE_PER_USER,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("update-usage free + paid add-on: tracks split the same way")}`,
	async () => {
		const customerId = "update-usage-free-plus-paid-addon-track";
		const { autumnV2 } = await setupFreePlusPaidAddOn({ customerId });

		const track = async (value: number) => {
			await autumnV2.track({
				customer_id: customerId,
				feature_id: TestFeature.Users,
				value,
			});
			await timeout(3000);
		};

		await track(5);
		await expectSplit({
			autumnV2,
			customerId,
			usage: 5,
			baseUsage: 3,
			addOnUsage: 2,
		});

		await track(-3);
		await expectSplit({
			autumnV2,
			customerId,
			usage: 2,
			baseUsage: 2,
			addOnUsage: 0,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("update-usage free + paid add-on: Postgres tracks split the same way")}`,
	async () => {
		const customerId = "update-usage-free-plus-paid-addon-postgres";
		const { autumnV2 } = await setupFreePlusPaidAddOn({ customerId });

		const track = async (value: number) => {
			await autumnV2.track(
				{
					customer_id: customerId,
					feature_id: TestFeature.Users,
					value,
				},
				{ skipCache: true },
			);
			await timeout(3000);
		};

		await track(5);
		await expectSplit({
			autumnV2,
			customerId,
			usage: 5,
			baseUsage: 3,
			addOnUsage: 2,
		});
	},
);
