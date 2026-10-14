import { test } from "bun:test";
import { ErrCode } from "@autumn/shared";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("carry-over-balance-scheduled 1: carry_over_balances on downgrade returns InvalidRequest error")}`, async () => {
	const premiumMessages = items.monthlyMessages({ includedUsage: 500 });
	const proMessages = items.monthlyMessages({ includedUsage: 100 });

	const premium = products.premium({ id: "premium", items: [premiumMessages] });
	const pro = products.pro({ id: "pro", items: [proMessages] });

	const { customerId, autumnV2_1 } = await initScenario({
		customerId: "carry-over-balance-downgrade-blocked",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [premium, pro] }),
		],
		actions: [s.attach({ productId: premium.id, timeout: 4000 })],
	});

	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: "messages",
		value: 100,
	});

	await new Promise((resolve) => setTimeout(resolve, 2000));

	await expectAutumnError({
		errCode: ErrCode.InvalidRequest,
		func: async () => {
			await autumnV2_1.billing.attach({
				customer_id: customerId,
				plan_id: pro.id,
				carry_over_balances: { enabled: true },
			});
		},
	});
});
