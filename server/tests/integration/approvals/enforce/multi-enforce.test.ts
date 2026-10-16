import { expect, test } from "bun:test";
import { enforceApprovals } from "@tests/integration/approvals/utils/enforceApprovals";
import {
	expectPermissionDenied,
	postRaw,
} from "@tests/integration/approvals/utils/expectPermissionDenied";
import { setupApprovalRules } from "@tests/integration/approvals/utils/setupApprovalRules";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { rules } from "@tests/utils/fixtures/rules";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

/** Multi-attach and multi-update are checked like their single forms, so they can't route around a rule. */

test.concurrent(
	`${chalk.yellowBright("multi enforce 1: a multi-attach with a paid plan is denied, and nothing attaches")}`,
	async () => {
		const customerId = "approvals-enforce-multi-attach";
		const messages = items.monthlyMessages({ includedUsage: 100 });
		const pro = products.pro({ items: [messages] });
		const addon = products.recurringAddOn({ id: "addon", items: [messages] });

		const { ctx, members, autumnV2_1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, addon] }),
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
			const res = await postRaw({
				client: enforceApprovals(client),
				path: "/billing.multi_attach",
				body: {
					customer_id: customerId,
					plans: [{ plan_id: pro.id }, { plan_id: addon.id }],
				},
			});
			expectPermissionDenied({
				res,
				violations: [{ field: "paid", actual: true }],
			});
			const customer = await autumnV2_1.customers.get<{
				subscriptions: { plan_id: string }[];
			}>(customerId);
			expect(
				customer.subscriptions.map(({ plan_id }) => plan_id),
			).not.toContain(pro.id);
		} finally {
			await cleanup();
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("multi enforce 2: a multi-update mixing an allowed and a denied cancel is denied, and its preview says so")}`,
	async () => {
		const customerId = "approvals-enforce-multi-update";
		const messages = items.monthlyMessages({ includedUsage: 100 });
		const pro = products.pro({ items: [messages] });
		const addon = products.recurringAddOn({ id: "addon", items: [messages] });

		const { ctx, members } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, addon] }),
				s.member({ role: "owner" }),
				s.member({ role: "sales" }),
			],
			actions: [
				s.attach({ productId: pro.id }),
				s.attach({ productId: addon.id }),
			],
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
		const params = {
			customer_id: customerId,
			updates: [
				// The allowed cancel first: each item must be judged on its own action.
				{ plan_id: pro.id, cancel_action: "cancel_end_of_cycle" },
				{ plan_id: addon.id, cancel_action: "cancel_immediately" },
			],
		};

		try {
			const preview = await client.billing.previewMultiUpdate(params);
			expect(preview.permission?.verdict).toBe("deny");

			const res = await postRaw({
				client: enforceApprovals(client),
				path: "/billing.multi_update",
				body: params,
			});
			expectPermissionDenied({
				res,
				decidedBy: { level: "user", rule_name: "End-of-cycle cancels" },
			});
		} finally {
			await cleanup();
		}
	},
);
