import { expect, test } from "bun:test";
import { enforceApprovals } from "@tests/integration/approvals/utils/enforceApprovals";
import { postRaw } from "@tests/integration/approvals/utils/expectPermissionDenied";
import { setupApprovalRules } from "@tests/integration/approvals/utils/setupApprovalRules";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { rules } from "@tests/utils/fixtures/rules";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

/** Rule-granted access runs before every scope branch, so #5015's empty-scopes deny can't pre-empt it. */

test.concurrent(
	`${chalk.yellowBright("empty scopes enforce 1: a rule lets a member whose role grants no scopes attach a free plan")}`,
	async () => {
		const customerId = "approvals-enforce-empty-scopes";
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
				s.member({ role: "retired_role" }),
			],
			actions: [],
		});
		const [owner, unknownRole] = members;
		const { client, cleanup } = await setupApprovalRules({
			ctx,
			owner,
			member: unknownRole,
			rules: [
				rules.rule({
					name: "Free attaches",
					subjects: [{ type: "user", user_id: unknownRole.userId }],
					when: { paid: false },
				}),
			],
		});
		enforceApprovals(client);

		try {
			const attach = await postRaw({
				client,
				path: "/billing.attach",
				body: { customer_id: customerId, plan_id: free.id },
			});
			expect(attach.status).toBe(200);
		} finally {
			await cleanup();
		}
	},
);
