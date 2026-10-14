import { expect, test } from "bun:test";
import type { ApiCustomerV3, CheckResponseV2 } from "@autumn/shared";
import { findCustomerEntitlement } from "@tests/balances/utils/findCustomerEntitlement";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { waitForPostgresBalance } from "@tests/integration/cron/batch-reset-v2/batchResetV2TestUtils";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("carry-over-balance 1: remaining balance carried as loose entitlement on immediate upgrade")}`,
	async () => {
		const proMessages = items.monthlyMessages({ includedUsage: 100 });
		const premiumMessages = items.monthlyMessages({ includedUsage: 500 });

		const pro = products.pro({ id: "pro", items: [proMessages] });
		const premium = products.premium({
			id: "premium",
			items: [premiumMessages],
		});

		const { customerId, autumnV2_1, autumnV1 } = await initScenario({
			customerId: "carry-over-balance-basic1",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [s.attach({ productId: pro.id, timeout: 4000 })],
		});

		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 30,
		});

		await new Promise((resolve) => setTimeout(resolve, 2000));

		await autumnV2_1.billing.attach({
			customer_id: customerId,
			plan_id: premium.id,
			carry_over_balances: { enabled: true },
		});

		await new Promise((resolve) => setTimeout(resolve, 2000));

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Messages,
			balance: 570,
			usage: 0,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("carry-over-balance 2: zero balance is a no-op — new plan starts at full allowance")}`,
	async () => {
		const proMessages = items.monthlyMessages({ includedUsage: 100 });
		const premiumMessages = items.monthlyMessages({ includedUsage: 500 });

		const pro = products.pro({ id: "pro", items: [proMessages] });
		const premium = products.premium({
			id: "premium",
			items: [premiumMessages],
		});

		const { customerId, autumnV2_1, autumnV1 } = await initScenario({
			customerId: "carry-over-balance-zero",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [s.attach({ productId: pro.id, timeout: 4000 })],
		});

		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 100,
		});

		await new Promise((resolve) => setTimeout(resolve, 2000));

		await autumnV2_1.billing.attach({
			customer_id: customerId,
			plan_id: premium.id,
			carry_over_balances: { enabled: true },
		});

		await new Promise((resolve) => setTimeout(resolve, 2000));

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Messages,
			balance: 500,
			usage: 0,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("carry-over-balance 3: negative balance carries over to the new plan")}`,
	async () => {
		const proMessages = items.consumableMessages({ includedUsage: 100 });
		const premiumMessages = items.monthlyMessages({ includedUsage: 500 });

		const pro = products.pro({ id: "pro", items: [proMessages] });
		const premium = products.premium({
			id: "premium",
			items: [premiumMessages],
		});

		const { customerId, autumnV2_1, autumnV2_2, autumnV1, ctx } =
			await initScenario({
				customerId: "carry-over-balance-negative",
				setup: [
					s.customer({ paymentMethod: "success" }),
					s.products({ list: [pro, premium] }),
				],
				actions: [s.attach({ productId: pro.id, timeout: 4000 })],
			});

		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 120,
		});

		const cusEnt = await findCustomerEntitlement({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});
		expect(cusEnt).toBeDefined();
		await waitForPostgresBalance({
			db: ctx.db,
			customerEntitlementId: cusEnt!.id,
			expectedBalance: -20,
		});

		await autumnV2_2.billing.attach({
			customer_id: customerId,
			plan_id: premium.id,
			carry_over_balances: { enabled: true },
		});

		await new Promise((resolve) => setTimeout(resolve, 2000));

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Messages,
			balance: 480,
			usage: 0,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("carry-over-balance 4: free overage is paid down from the new plan's grant")}`,
	async () => {
		const proMessages = items.monthlyMessages({ includedUsage: 100 });
		const premiumMessages = items.monthlyMessages({ includedUsage: 500 });

		const pro = products.pro({ id: "pro", items: [proMessages] });
		const premium = products.premium({
			id: "premium",
			items: [premiumMessages],
		});

		const { customerId, autumnV2, autumnV2_2 } = await initScenario({
			customerId: "carry-over-balance-free-overage",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [s.attach({ productId: pro.id, timeout: 4000 })],
		});

		await autumnV2.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			current_balance: -20,
		});

		await autumnV2_2.billing.attach({
			customer_id: customerId,
			plan_id: premium.id,
			carry_over_balances: { enabled: true },
		});

		const check = await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			skip_cache: true,
		});
		expect(check.balance?.current_balance).toBe(480);
		for (const entry of check.balance?.breakdown ?? []) {
			expect(entry.current_balance).toBeGreaterThanOrEqual(0);
		}
	},
);
