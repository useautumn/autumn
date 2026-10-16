import { expect, test } from "bun:test";
import { enforceApprovals } from "@tests/integration/approvals/utils/enforceApprovals";
import { expectDecisionLogged } from "@tests/integration/approvals/utils/expectDecisionLogged";
import {
	expectPermissionDenied,
	postRaw,
} from "@tests/integration/approvals/utils/expectPermissionDenied";
import { setupApprovalRules } from "@tests/integration/approvals/utils/setupApprovalRules";
import { TestFeature } from "@tests/setup/v2Features";
import { rules } from "@tests/utils/fixtures/rules";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

/** Grant credits and Set balance are checked against the member's rules (E5a). */

const setupGrantRule = async ({ customerId }: { customerId: string }) => {
	const { ctx, members } = await initScenario({
		customerId,
		setup: [
			s.customer({}),
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
			rules.creditGrants({
				featureId: TestFeature.Messages,
				maxGrant: 100,
				subjects: [{ type: "user", user_id: sales.userId }],
			}),
			rules.rule({
				name: "Small balance changes",
				subjects: [{ type: "user", user_id: sales.userId }],
				actions: ["balances.update"],
				when: {
					feature_id: TestFeature.Messages,
					add_to_balance: { $lte: 10 },
				},
			}),
		],
	});
	return { ctx, sales, client: enforceApprovals(client), cleanup };
};

const grant = ({
	customerId,
	featureId,
	amount,
}: {
	customerId: string;
	featureId: string;
	amount: number;
}) => ({
	customer_id: customerId,
	feature_id: featureId,
	included_grant: amount,
});

test.concurrent(
	`${chalk.yellowBright("balances enforce 1: a grant within the limit goes through and is logged")}`,
	async () => {
		const customerId = "approvals-balances-within";
		const { ctx, sales, client, cleanup } = await setupGrantRule({
			customerId,
		});

		try {
			const res = await postRaw({
				client,
				path: "/balances.create",
				body: grant({
					customerId,
					featureId: TestFeature.Messages,
					amount: 100,
				}),
			});
			expect(res.status).toBe(200);
			const decision = await expectDecisionLogged({
				ctx,
				userId: sales.userId,
				action: "balances.create",
				verdict: "allow",
				enforced: true,
			});
			expect(decision.facts).toMatchObject({
				feature_id: TestFeature.Messages,
				included_grant: 100,
			});
		} finally {
			await cleanup();
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("balances enforce 2: over the limit, or another feature, is denied")}`,
	async () => {
		const customerId = "approvals-balances-over";
		const { client, cleanup } = await setupGrantRule({ customerId });

		try {
			expectPermissionDenied({
				res: await postRaw({
					client,
					path: "/balances.create",
					body: grant({
						customerId,
						featureId: TestFeature.Messages,
						amount: 200,
					}),
				}),
				violations: [{ field: "included_grant", actual: "200" }],
			});
			expectPermissionDenied({
				res: await postRaw({
					client,
					path: "/balances.create",
					body: grant({ customerId, featureId: TestFeature.Words, amount: 10 }),
				}),
				violations: [{ field: "feature_id" }],
			});
		} finally {
			await cleanup();
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("balances enforce 3: Set balance is checked on what it sets")}`,
	async () => {
		const customerId = "approvals-balances-update";
		const { client, cleanup } = await setupGrantRule({ customerId });

		try {
			const created = await postRaw({
				client,
				path: "/balances.create",
				body: grant({
					customerId,
					featureId: TestFeature.Messages,
					amount: 50,
				}),
			});
			expect(created.status).toBe(200);

			const small = await postRaw({
				client,
				path: "/balances.update",
				body: {
					customer_id: customerId,
					feature_id: TestFeature.Messages,
					add_to_balance: 5,
				},
			});
			expect(small.status).toBe(200);

			expectPermissionDenied({
				res: await postRaw({
					client,
					path: "/balances.update",
					body: {
						customer_id: customerId,
						feature_id: TestFeature.Messages,
						add_to_balance: 500,
					},
				}),
				violations: [{ field: "add_to_balance" }],
			});
		} finally {
			await cleanup();
		}
	},
);
