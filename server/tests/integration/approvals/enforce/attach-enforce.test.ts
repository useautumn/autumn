import { expect, test } from "bun:test";
import { enforceApprovals } from "@tests/integration/approvals/utils/enforceApprovals";
import { expectDecisionLogged } from "@tests/integration/approvals/utils/expectDecisionLogged";
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

/** Under approvals_enforced, a deny is a 403 that names the matched conditions, and nothing is written. */

const setupBlockPaid = async ({ customerId }: { customerId: string }) => {
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
	return { ctx, sales, client, cleanup, pro, autumnV1 };
};

test.concurrent(
	`${chalk.yellowBright("attach enforce 1: a blocked attach is a 403 with its decision under details, logged as enforced, and nothing attaches")}`,
	async () => {
		const customerId = "approvals-enforce-attach-deny";
		const { ctx, sales, client, cleanup, pro, autumnV1 } = await setupBlockPaid(
			{
				customerId,
			},
		);

		try {
			const res = await postRaw({
				client: enforceApprovals(client),
				path: "/billing.attach",
				body: { customer_id: customerId, plan_id: pro.id },
			});
			expectPermissionDenied({
				res,
				ruleName: "No charges",
				violations: [{ field: "paid", actual: true }],
			});

			const decision = await expectDecisionLogged({
				ctx,
				userId: sales.userId,
				action: "billing.attach",
				verdict: "deny",
			});
			expect(decision.enforced).toBe(true);

			const customer = await autumnV1.customers.get(customerId);
			expect(
				customer.products.map(({ id }: { id: string }) => id),
			).not.toContain(pro.id);
		} finally {
			await cleanup();
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("attach enforce 2: the preview says whether its verdict is enforced")}`,
	async () => {
		const customerId = "approvals-enforce-attach-preview";
		const { client, cleanup, pro } = await setupBlockPaid({ customerId });
		const params = { customer_id: customerId, plan_id: pro.id };

		try {
			const shadow = await client.billing.previewAttach(params);
			expect(shadow.permission).toMatchObject({
				verdict: "deny",
				enforced: false,
			});

			const enforced =
				await enforceApprovals(client).billing.previewAttach(params);
			expect(enforced.permission).toMatchObject({
				verdict: "deny",
				enforced: true,
			});
		} finally {
			await cleanup();
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("attach enforce 3: a user-level allow beats a role-level block, whatever the order")}`,
	async () => {
		const customerId = "approvals-enforce-levels";
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
			actions: [],
		});
		const [owner, sales] = members;
		const { client, cleanup } = await setupApprovalRules({
			ctx,
			owner,
			member: sales,
			rules: [
				rules.allow({
					name: "This rep may attach",
					subjects: [{ type: "user", user_id: sales.userId }],
				}),
				// Added later, at a broader level, so it loses to the user's allow.
				rules.block({
					name: "Sales can't attach",
					subjects: [{ type: "role", role_id: "sales" }],
				}),
			],
		});

		try {
			const res = await postRaw({
				client: enforceApprovals(client),
				path: "/billing.attach",
				body: { customer_id: customerId, plan_id: pro.id },
			});
			expect(res.status).toBe(200);
		} finally {
			await cleanup();
		}
	},
);
