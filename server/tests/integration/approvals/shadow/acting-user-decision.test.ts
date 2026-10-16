import { expect, test } from "bun:test";
import { ApiVersion } from "@autumn/shared";
import { expectDecisionLogged } from "@tests/integration/approvals/utils/expectDecisionLogged";
import { postRaw } from "@tests/integration/approvals/utils/expectPermissionDenied";
import { mintOAuthAccessToken } from "@tests/integration/approvals/utils/mintOAuthAccessToken";
import { setupApprovalRules } from "@tests/integration/approvals/utils/setupApprovalRules";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { rules } from "@tests/utils/fixtures/rules";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";

/** A Slack approval Leaf runs with its installation token is decided, and logged, as the clicker. */

test.concurrent(
	`${chalk.yellowBright("acting user decision 1: the logged decision names the clicker, and enforcement blocks them")}`,
	async () => {
		const customerId = "approvals-acting-user-decision";
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
		const { cleanup } = await setupApprovalRules({
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
		const oauth = await mintOAuthAccessToken({
			ctx,
			clientId: "autumn_mcp_slack",
			userId: owner.userId,
		});
		const leafClient = ({ enforced }: { enforced: boolean }) =>
			new AutumnInt({
				version: ApiVersion.V2_1,
				secretKey: oauth.token,
				headers: {
					"x-approvals-sandbox-as-live": "true",
					"x-approvals-acting-user": sales.userId,
					...(enforced
						? { "org-config": JSON.stringify({ approvals_enforced: true }) }
						: {}),
				},
			});
		const params = { customer_id: customerId, plan_id: pro.id };

		try {
			const enforced = await postRaw({
				client: leafClient({ enforced: true }),
				path: "/billing.attach",
				body: params,
			});
			expect(enforced.status).toBe(403);
			await expectDecisionLogged({
				ctx,
				userId: sales.userId,
				action: "billing.attach",
				verdict: "deny",
				enforced: true,
			});

			const shadow = await postRaw({
				client: leafClient({ enforced: false }),
				path: "/billing.attach",
				body: params,
			});
			expect(shadow.status).toBe(200);
			const decision = await expectDecisionLogged({
				ctx,
				userId: sales.userId,
				action: "billing.attach",
				verdict: "deny",
			});
			expect(decision.role).toBe("sales");
		} finally {
			await oauth.cleanup();
			await cleanup();
		}
	},
);
