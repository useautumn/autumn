import { expect, test } from "bun:test";
import { ErrCode } from "@autumn/shared";
import { enforceApprovals } from "@tests/integration/approvals/utils/enforceApprovals";
import { postRaw } from "@tests/integration/approvals/utils/expectPermissionDenied";
import { setupApprovalRules } from "@tests/integration/approvals/utils/setupApprovalRules";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { rules } from "@tests/utils/fixtures/rules";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

/** Update paths no rule decides keep the scope check for members that rules let in. */

test.concurrent(
	`${chalk.yellowBright("undecided paths enforce 1: a rule-admitted member can't switch the collection method")}`,
	async () => {
		const customerId = "approvals-enforce-switch";
		const pro = products.pro({
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { ctx, members } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
				s.member({ role: "owner" }),
				s.member({ role: "member" }),
			],
			actions: [s.attach({ productId: pro.id })],
		});
		const [owner, viewer] = members;
		const { client, cleanup } = await setupApprovalRules({
			ctx,
			owner,
			member: viewer,
			rules: [
				rules.rule({
					name: "Any update",
					subjects: [{ type: "user", user_id: viewer.userId }],
					actions: ["billing.update_subscription"],
				}),
			],
		});

		try {
			const res = await postRaw({
				client: enforceApprovals(client),
				path: "/billing.update",
				body: {
					customer_id: customerId,
					plan_id: pro.id,
					invoice_mode: { enabled: true },
				},
			});
			expect(res.status).toBe(403);
			expect(res.body.code).toBe(ErrCode.InsufficientScopes);
		} finally {
			await cleanup();
		}
	},
);
