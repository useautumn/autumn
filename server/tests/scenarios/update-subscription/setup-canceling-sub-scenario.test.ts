import { test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test(`${chalk.yellowBright("setup: customer with canceling sub for dashboard UI repro")}`, async () => {
	const customerId = "ui-repro-canceling-sub";

	const pro = products.pro({ id: "pro", items: [] });

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: pro.id }), s.cancel({ productId: pro.id })],
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const product = customer.products?.find((entry) =>
		entry.id.startsWith("pro"),
	);

	console.log(
		chalk.cyanBright(
			`\n\n=== Dashboard UI repro ready ===\n` +
				`customer_id: ${customerId}\n` +
				`product: ${product?.id} (status: ${product?.status}, canceled_at: ${product?.canceled_at})\n` +
				`Open this customer in the dashboard → Manage Cancellation → Cancel immediately.\n` +
				`================================\n`,
		),
	);
});
