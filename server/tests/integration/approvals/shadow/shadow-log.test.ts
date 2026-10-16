import { expect, test } from "bun:test";
import {
	expectDecisionLogged,
	listDecisions,
} from "@tests/integration/approvals/utils/expectDecisionLogged";
import { setupApprovalRules } from "@tests/integration/approvals/utils/setupApprovalRules";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { rules } from "@tests/utils/fixtures/rules";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

/** Shadow mode: a write a rule decides is logged and goes through; nothing else is logged. */

test.concurrent(
	`${chalk.yellowBright("shadow log 1: a blocked attach is logged as a deny and still goes through; its preview logs nothing")}`,
	async () => {
		const customerId = "approvals-shadow-log-deny";
		const pro = products.pro({
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { ctx, members, autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
				s.member({ role: "owner" }),
				s.member({ role: "sales" }),
			],
			actions: [],
		});
		const [owner, sales] = members;
		const { client, cleanup } = await setupApprovalRules({
			ctx,
			owner,
			member: sales,
			rules: [
				rules.block({
					name: "No charges",
					subjects: [{ type: "user", user_id: sales.userId }],
					filter: { paid: true },
				}),
			],
		});
		const params = { customer_id: customerId, plan_id: pro.id };

		try {
			await client.billing.previewAttach(params);
			expect(
				await listDecisions({
					ctx,
					userId: sales.userId,
					action: "billing.attach",
				}),
			).toHaveLength(0);

			await client.billing.attach(params);
			const decision = await expectDecisionLogged({
				ctx,
				userId: sales.userId,
				action: "billing.attach",
				verdict: "deny",
			});
			expect(decision).toMatchObject({
				role: "sales",
				enforced: false,
				decided_by: { level: "user", rule_name: "No charges" },
				violations: [expect.objectContaining({ field: "paid" })],
				facts: expect.objectContaining({ total: 20, acted_via: "dashboard" }),
			});

			const customer = await autumnV1.customers.get(customerId);
			expect(customer.products.map(({ id }: { id: string }) => id)).toContain(
				pro.id,
			);
		} finally {
			await cleanup();
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("shadow log 2: a write no rule matches logs nothing")}`,
	async () => {
		const customerId = "approvals-shadow-log-no-match";
		const free = products.base({
			id: "free",
			items: [items.monthlyMessages({ includedUsage: 10 })],
		});
		const { ctx, members } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [free] }),
				s.member({ role: "owner" }),
				s.member({ role: "sales" }),
			],
			actions: [],
		});
		const [owner, sales] = members;
		const { client, cleanup } = await setupApprovalRules({
			ctx,
			owner,
			member: sales,
			rules: [
				rules.block({
					name: "No charges",
					subjects: [{ type: "user", user_id: sales.userId }],
					filter: { paid: true },
				}),
			],
		});

		try {
			await client.billing.attach({
				customer_id: customerId,
				plan_id: free.id,
			});
			expect(
				await listDecisions({
					ctx,
					userId: sales.userId,
					action: "billing.attach",
				}),
			).toHaveLength(0);
		} finally {
			await cleanup();
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("shadow log 3: deleting an entity cancels its plans as system work, so no rule judges it")}`,
	async () => {
		const customerId = "approvals-shadow-log-system";
		const pro = products.pro({
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { ctx, members, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
				s.member({ role: "owner" }),
				s.member({ role: "developer" }),
			],
			actions: [s.attach({ productId: pro.id, entityIndex: 0 })],
		});
		const [owner, developer] = members;
		const { client, cleanup } = await setupApprovalRules({
			ctx,
			owner,
			member: developer,
			rules: [
				rules.block({
					name: "No cancels",
					subjects: [{ type: "user", user_id: developer.userId }],
					actions: ["billing.cancel"],
				}),
			],
		});

		try {
			await client.entities.delete(customerId, entities[0].id);
			expect(
				await listDecisions({
					ctx,
					userId: developer.userId,
					action: "billing.cancel",
				}),
			).toHaveLength(0);
		} finally {
			await cleanup();
		}
	},
);
