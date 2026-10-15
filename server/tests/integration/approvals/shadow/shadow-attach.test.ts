import { expect, test } from "bun:test";
import type { AttachParamsV1Input } from "@autumn/shared";
import {
	expectDecisionLogged,
	expectNoDecisionLogged,
} from "@tests/integration/approvals/utils/expectDecisionLogged";
import { setupApprovalRules } from "@tests/integration/approvals/utils/setupApprovalRules";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { rules } from "@tests/utils/fixtures/rules";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

/** Shadow mode logs every decision for a billing write and blocks nothing. */

test.concurrent(
	`${chalk.yellowBright("shadow attach 1: a denying rule logs the deny, the attach still succeeds, and its preview logs nothing")}`,
	async () => {
		const customerId = "approvals-shadow-attach-deny";
		const pro = products.pro({
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { ctx, members, autumnV2_1 } = await initScenario({
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
				rules.rule({
					name: "No-charge attaches",
					subjects: [{ type: "user", user_id: sales.userId }],
					when: { paid: false },
				}),
			],
		});

		try {
			const params: AttachParamsV1Input = {
				customer_id: customerId,
				plan_id: pro.id,
			};
			await client.billing.previewAttach(params);
			await expectNoDecisionLogged({
				ctx,
				userId: sales.userId,
				action: "billing.attach",
			});

			await client.billing.attach(params);

			const customer = await autumnV2_1.customers.get<{
				subscriptions: { plan_id: string }[];
			}>(customerId);
			expect(customer.subscriptions.map(({ plan_id }) => plan_id)).toContain(
				pro.id,
			);

			const decision = await expectDecisionLogged({
				ctx,
				userId: sales.userId,
				action: "billing.attach",
				verdict: "deny",
			});
			expect(decision.role).toBe("sales");
			expect(decision.violations).toEqual([
				expect.objectContaining({ field: "paid", limit: false, actual: true }),
			]);
			expect(decision.facts).toMatchObject({ paid: true, total: 20 });
		} finally {
			await cleanup();
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("shadow attach 2: a matching rule logs an allow")}`,
	async () => {
		const customerId = "approvals-shadow-attach-allow";
		const free = products.base({
			id: "free",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { ctx, members } = await initScenario({
			customerId,
			setup: [
				s.customer({}),
				s.products({ list: [free] }),
				s.member({ role: "owner" }),
				s.member({ role: "sales" }),
			],
			actions: [],
		});
		const [owner, sales] = members;
		const { client, ruleIds, cleanup } = await setupApprovalRules({
			ctx,
			owner,
			member: sales,
			rules: [
				rules.rule({
					name: "No-charge attaches",
					subjects: [{ type: "user", user_id: sales.userId }],
					when: { paid: false },
				}),
			],
		});

		try {
			await client.billing.attach<AttachParamsV1Input>({
				customer_id: customerId,
				plan_id: free.id,
			});

			const decision = await expectDecisionLogged({
				ctx,
				userId: sales.userId,
				action: "billing.attach",
				verdict: "allow",
			});
			expect(decision.decided_by).toMatchObject({
				level: "user",
				rule_id: ruleIds[0],
			});
			expect(decision.rule_version).toBe(1);
		} finally {
			await cleanup();
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("shadow attach 3: cancelling is logged as billing.cancel")}`,
	async () => {
		const customerId = "approvals-shadow-cancel";
		const pro = products.pro({
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { ctx, members } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
				s.member({ role: "owner" }),
				s.member({ role: "sales" }),
			],
			actions: [s.attach({ productId: pro.id })],
		});
		const [owner, sales] = members;
		const { client, cleanup } = await setupApprovalRules({
			ctx,
			owner,
			member: sales,
			rules: [
				rules.rule({
					name: "End-of-cycle cancels",
					subjects: [{ type: "user", user_id: sales.userId }],
					actions: ["billing.cancel"],
					when: { cancel_action: "cancel_end_of_cycle" },
				}),
			],
		});

		try {
			await client.billing.update({
				customer_id: customerId,
				plan_id: pro.id,
				cancel_action: "cancel_immediately",
			});

			const decision = await expectDecisionLogged({
				ctx,
				userId: sales.userId,
				action: "billing.cancel",
				verdict: "deny",
			});
			expect(decision.facts).toMatchObject({
				cancel_action: "cancel_immediately",
			});
		} finally {
			await cleanup();
		}
	},
);
