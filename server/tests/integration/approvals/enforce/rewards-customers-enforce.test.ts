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

/** Rewards and customers writes are checked against the member's rules (E5c). */

test.concurrent(
	`${chalk.yellowBright("rewards customers enforce 1: customer update and delete are judged on the customer")}`,
	async () => {
		const customerId = "approvals-customers-enforce";
		const { ctx, members } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
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
				rules.rule({
					name: "Update this customer",
					subjects,
					actions: ["customers.update"],
					when: { customer: { customer_id: customerId } },
				}),
				rules.rule({
					name: "Delete another customer",
					subjects,
					actions: ["customers.delete"],
					when: { customer: { customer_id: "someone-else" } },
				}),
			],
		});
		enforceApprovals(client);

		try {
			const updated = await postRaw({
				client,
				path: "/customers.update",
				body: { customer_id: customerId, name: "Renamed" },
			});
			expect(updated.status).toBe(200);
			await expectDecisionLogged({
				ctx,
				userId: sales.userId,
				action: "customers.update",
				verdict: "allow",
				enforced: true,
			});

			expectPermissionDenied({
				res: await postRaw({
					client,
					path: "/customers.delete",
					body: { customer_id: customerId },
				}),
				decidedBy: { level: "user", rule_name: "Delete another customer" },
			});
		} finally {
			await cleanup();
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("rewards customers enforce 2: redeeming a promo code is judged on its reward")}`,
	async () => {
		const customerId = "approvals-rewards-redeem";
		const allowedReward = "approvals-redeem-allowed";
		const { ctx, members } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.featureGrant({
					id: allowedReward,
					entitlements: [{ feature_id: TestFeature.Messages, allowance: 10 }],
					promoCodes: [{ code: "APPROVALSREDEEMOK" }],
				}),
				s.featureGrant({
					id: "approvals-redeem-other",
					entitlements: [{ feature_id: TestFeature.Messages, allowance: 10 }],
					promoCodes: [{ code: "APPROVALSREDEEMNO" }],
				}),
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
					name: "One reward",
					subjects: [{ type: "user", user_id: sales.userId }],
					actions: ["rewards.apply"],
					when: { reward_id: allowedReward },
				}),
			],
		});
		enforceApprovals(client);

		try {
			const redeemed = await postRaw({
				client,
				path: "/rewards.redeem",
				body: { customer_id: customerId, code: "APPROVALSREDEEMOK" },
			});
			expect(redeemed.status).toBe(200);
			const decision = await expectDecisionLogged({
				ctx,
				userId: sales.userId,
				action: "rewards.apply",
				verdict: "allow",
				enforced: true,
			});
			expect(decision.facts).toMatchObject({ reward_id: allowedReward });

			expectPermissionDenied({
				res: await postRaw({
					client,
					path: "/rewards.redeem",
					body: { customer_id: customerId, code: "APPROVALSREDEEMNO" },
				}),
				violations: [{ field: "reward_id" }],
			});
			expectPermissionDenied({
				res: await postRaw({
					client,
					path: `/customers/${customerId}/coupons/approvals-unlisted-coupon`,
					body: {},
				}),
				violations: [{ field: "reward_id" }],
			});
		} finally {
			await cleanup();
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("rewards customers enforce 3: a who-only rule lets a read-only member create rewards and customers")}`,
	async () => {
		const customerId = "approvals-who-only-create";
		const { ctx, members } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.member({ role: "owner" }),
				s.member({ role: "member" }),
			],
			actions: [],
		});
		const [owner, readOnly] = members;
		const subjects = [{ type: "user" as const, user_id: readOnly.userId }];
		const { client, cleanup } = await setupApprovalRules({
			ctx,
			owner,
			member: readOnly,
			rules: [
				rules.whoOnly({ actions: ["rewards.create"], subjects }),
				rules.whoOnly({ actions: ["customers.create"], subjects }),
			],
		});
		enforceApprovals(client);

		try {
			const reward = await postRaw({
				client,
				path: "/rewards.create",
				body: {
					feature_grant: {
						id: `approvals_grant_${Date.now()}`,
						name: "Approvals grant",
						grants: [
							{ feature_id: TestFeature.Messages, included: 10, expiry: null },
						],
						promo_codes: [{ code: `APPROVALSWHO${Date.now()}`, max_uses: 1 }],
					},
				},
			});
			expect(reward).toMatchObject({ status: 200 });

			const customer = await postRaw({
				client,
				path: "/customers.get_or_create",
				body: { customer_id: `approvals-who-only-new-${Date.now()}` },
			});
			expect(customer).toMatchObject({ status: 200 });
		} finally {
			await cleanup();
		}
	},
);
