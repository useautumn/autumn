import { test } from "bun:test";
import { type ApiCustomerV3, RewardType } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { createReward } from "@tests/utils/productUtils";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli";
import { constructCoupon } from "@/utils/scriptUtils/createTestProducts";

test.concurrent(`${chalk.yellowBright("legacy-upgrade-discount 1: reward applies on upgrade")}`, async () => {
	const customerId = "legacy-upgrade-discount-1";
	const rewardId = `${customerId}-20-off`;

	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});

	const premium = products.premium({
		id: "premium",
		items: [items.monthlyMessages({ includedUsage: 1000 })],
	});

	const reward = constructCoupon({
		id: rewardId,
		promoCode: `UPGRADE`,
		discountType: RewardType.PercentageDiscount,
		discountValue: 20,
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	await createReward({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
		autumn: new AutumnInt(),
		reward,
		productId: premium.id,
	});

	await autumnV1.attach({
		customer_id: customerId,
		product_id: premium.id,
		reward: reward.id,
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [premium.id],
		notPresent: [pro.id],
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: 20,
	});
});
