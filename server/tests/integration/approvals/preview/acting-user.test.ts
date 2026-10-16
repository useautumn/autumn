import { expect, test } from "bun:test";
import { ApiVersion, ErrCode } from "@autumn/shared";
import { mintOAuthAccessToken } from "@tests/integration/approvals/utils/mintOAuthAccessToken";
import { setupApprovalRules } from "@tests/integration/approvals/utils/setupApprovalRules";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { rules } from "@tests/utils/fixtures/rules";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { generateId } from "@/utils/genUtils.js";

/**
 * Leaf previews and runs a Slack approval with its installation token, naming
 * the clicker in `x-approvals-acting-user`; rules are checked against that member.
 */

const setupActingUser = async ({ customerId }: { customerId: string }) => {
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
	return { ctx, pro, owner, sales, cleanup };
};

const previewAs = ({
	token,
	actingUserId,
	customerId,
	planId,
}: {
	token: string;
	actingUserId: string;
	customerId: string;
	planId: string;
}) =>
	fetch(
		`${process.env.AUTUMN_TEST_BASE_URL?.replace(/\/$/, "") ?? "http://localhost:8080"}/v1/billing.preview_attach`,
		{
			method: "POST",
			headers: {
				Authorization: `Bearer ${token}`,
				"Content-Type": "application/json",
				"x-api-version": ApiVersion.V2_1,
				"x-approvals-sandbox-as-live": "true",
				"x-approvals-acting-user": actingUserId,
			},
			body: JSON.stringify({ customer_id: customerId, plan_id: planId }),
		},
	).then(async (res) => ({
		status: res.status,
		body: (await res.json()) as Record<string, unknown>,
	}));

test.concurrent(
	`${chalk.yellowBright("acting user 1: Leaf's Slack token checks rules against the named clicker")}`,
	async () => {
		const customerId = "approvals-acting-user-slack";
		const { ctx, pro, owner, sales, cleanup } = await setupActingUser({
			customerId,
		});
		const oauth = await mintOAuthAccessToken({
			ctx,
			clientId: "autumn_mcp_slack",
			userId: owner.userId,
		});

		try {
			const res = await previewAs({
				token: oauth.token,
				actingUserId: sales.userId,
				customerId,
				planId: pro.id,
			});
			expect(res.status).toBe(200);
			expect(res.body.permission).toMatchObject({
				verdict: "deny",
				decided_by: { level: "user", rule_name: "No-charge attaches" },
			});
		} finally {
			await oauth.cleanup();
			await cleanup();
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("acting user 2: the header is ignored from any other OAuth client or a secret key")}`,
	async () => {
		const customerId = "approvals-acting-user-other-client";
		const { ctx, pro, owner, sales, cleanup } = await setupActingUser({
			customerId,
		});
		const oauth = await mintOAuthAccessToken({
			ctx,
			clientId: generateId("oauth_client"),
			userId: owner.userId,
		});

		try {
			const res = await previewAs({
				token: oauth.token,
				actingUserId: sales.userId,
				customerId,
				planId: pro.id,
			});
			expect(res.status).toBe(200);
			expect(res.body).not.toHaveProperty("permission");

			const secretKeyRes = await previewAs({
				token: ctx.orgSecretKey,
				actingUserId: sales.userId,
				customerId,
				planId: pro.id,
			});
			expect(secretKeyRes.status).toBe(200);
			expect(secretKeyRes.body).not.toHaveProperty("permission");
		} finally {
			await oauth.cleanup();
			await cleanup();
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("acting user 3: a clicker who isn't a member is refused, not run as the token")}`,
	async () => {
		const customerId = "approvals-acting-user-stranger";
		const { ctx, pro, owner, cleanup } = await setupActingUser({ customerId });
		const oauth = await mintOAuthAccessToken({
			ctx,
			clientId: "autumn_mcp_slack",
			userId: owner.userId,
		});

		try {
			const res = await previewAs({
				token: oauth.token,
				actingUserId: "usr_not_a_member",
				customerId,
				planId: pro.id,
			});
			expect(res.status).toBe(403);
			expect(res.body.code).toBe(ErrCode.InvalidActingUser);
		} finally {
			await oauth.cleanup();
			await cleanup();
		}
	},
);
