import { expect, test } from "bun:test";
import type { AttachParamsV1Input } from "@autumn/shared";
import { expectNoDecisionLogged } from "@tests/integration/approvals/utils/expectDecisionLogged";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { autumnAs } from "@tests/utils/testInitUtils/autumnAs.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

/** With no rule covering the request, nothing is evaluated: no decision rows, no `permission`. */

test.concurrent(
	`${chalk.yellowBright("shadow no rules 1: an attach with no rules writes no decision and previews no permission")}`,
	async () => {
		const customerId = "approvals-shadow-no-rules";
		const pro = products.pro({
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { ctx, members } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
				s.member({ role: "sales" }),
			],
			actions: [],
		});
		const [sales] = members;
		const client = autumnAs(sales);
		client.headers["x-approvals-sandbox-as-live"] = "true";

		try {
			const params: AttachParamsV1Input = {
				customer_id: customerId,
				plan_id: pro.id,
			};
			const preview = await client.billing.previewAttach(params);
			expect(preview.total).toBe(20);
			expect(preview).not.toHaveProperty("permission");

			await client.billing.attach(params);
			await expectNoDecisionLogged({
				ctx,
				userId: sales.userId,
				action: "billing.attach",
			});
		} finally {
			await sales.cleanup();
		}
	},
);
