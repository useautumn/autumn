import { expect, test } from "bun:test";
import { enforceApprovals } from "@tests/integration/approvals/utils/enforceApprovals";
import { listDecisions } from "@tests/integration/approvals/utils/expectDecisionLogged";
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

const setupBalanceBlocks = async ({ customerId }: { customerId: string }) => {
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
	const subjects = [{ type: "user" as const, user_id: sales.userId }];
	const { client, cleanup } = await setupApprovalRules({
		ctx,
		owner,
		member: sales,
		rules: [
			rules.block({
				name: "Big message grants",
				subjects,
				actions: ["balances.create"],
				filter: {
					feature_id: TestFeature.Messages,
					included_grant: { $gt: 100 },
				},
			}),
			rules.block({
				name: "Big balance sets",
				subjects,
				actions: ["balances.update"],
				filter: {
					feature_id: TestFeature.Messages,
					remaining: { $gt: 500 },
				},
			}),
		],
	});
	return { ctx, sales, client: enforceApprovals(client), cleanup };
};

test.concurrent(
	`${chalk.yellowBright("balances enforce 1: a grant over the block's limit is denied with the amount violation, and logged")}`,
	async () => {
		const customerId = "approvals-balances-over";
		const { ctx, sales, client, cleanup } = await setupBalanceBlocks({
			customerId,
		});

		try {
			expectPermissionDenied({
				res: await postRaw({
					client,
					path: "/balances.create",
					body: {
						customer_id: customerId,
						feature_id: TestFeature.Messages,
						included_grant: 200,
					},
				}),
				ruleName: "Big message grants",
				violations: [{ field: "included_grant" }],
			});
			const [decision] = await listDecisions({
				ctx,
				userId: sales.userId,
				action: "balances.create",
			});
			expect(decision).toMatchObject({ verdict: "deny", enforced: true });
			expect(decision.facts).toMatchObject({
				customer: { id: customerId, has_paid: false },
				feature_id: TestFeature.Messages,
				included_grant: 200,
			});
		} finally {
			await cleanup();
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("balances enforce 2: a grant under the limit, or for another feature, matches nothing and goes through")}`,
	async () => {
		const customerId = "approvals-balances-under";
		const { client, cleanup } = await setupBalanceBlocks({ customerId });

		try {
			for (const body of [
				{ feature_id: TestFeature.Messages, included_grant: 50 },
				{ feature_id: TestFeature.Words, included_grant: 500 },
			]) {
				const res = await postRaw({
					client,
					path: "/balances.create",
					body: { customer_id: customerId, ...body },
				});
				expect(res.status).toBe(200);
			}
		} finally {
			await cleanup();
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("balances enforce 3: set balance is judged on what it sets, and the legacy current_balance alias as remaining")}`,
	async () => {
		const customerId = "approvals-balances-set";
		const { client, cleanup } = await setupBalanceBlocks({ customerId });

		try {
			const created = await postRaw({
				client,
				path: "/balances.create",
				body: {
					customer_id: customerId,
					feature_id: TestFeature.Messages,
					included_grant: 10,
				},
			});
			expect(created.status).toBe(200);

			for (const setTo of [{ remaining: 600 }, { current_balance: 600 }]) {
				expectPermissionDenied({
					res: await postRaw({
						client,
						path: "/balances.update",
						body: {
							customer_id: customerId,
							feature_id: TestFeature.Messages,
							...setTo,
						},
					}),
					ruleName: "Big balance sets",
					violations: [{ field: "remaining" }],
				});
			}

			const small = await postRaw({
				client,
				path: "/balances.update",
				body: {
					customer_id: customerId,
					feature_id: TestFeature.Messages,
					remaining: 20,
				},
			});
			expect(small.status).toBe(200);
		} finally {
			await cleanup();
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("balances enforce 4: the legacy customer balances route is judged per balance, as set balance")}`,
	async () => {
		const customerId = "approvals-balances-legacy";
		const { client, cleanup } = await setupBalanceBlocks({ customerId });

		try {
			const created = await postRaw({
				client,
				path: "/balances.create",
				body: {
					customer_id: customerId,
					feature_id: TestFeature.Messages,
					included_grant: 10,
				},
			});
			expect(created.status).toBe(200);

			expectPermissionDenied({
				res: await postRaw({
					client,
					path: `/customers/${customerId}/balances`,
					body: {
						balances: [
							{ feature_id: TestFeature.Messages, balance: 20 },
							{ feature_id: TestFeature.Messages, balance: 1000 },
						],
					},
				}),
				ruleName: "Big balance sets",
				violations: [{ field: "remaining" }],
			});

			const small = await postRaw({
				client,
				path: `/customers/${customerId}/balances`,
				body: { balances: [{ feature_id: TestFeature.Messages, balance: 20 }] },
			});
			expect(small.status).toBe(200);
		} finally {
			await cleanup();
		}
	},
);
