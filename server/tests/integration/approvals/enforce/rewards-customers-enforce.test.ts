import { expect, test } from "bun:test";
import { CouponDurationType, RewardType } from "@autumn/shared";
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
import { CusService } from "@/internal/customers/CusService";

/** Customer, reward and coupon writes are checked against the member's rules (E5c). */

const setupMemberBlocks = async ({
	customerId,
	otherCustomerIds = [],
	featureGrant,
	blocks,
}: {
	customerId: string;
	otherCustomerIds?: string[];
	featureGrant?: { id: string; code: string };
	blocks: (userId: string) => Parameters<typeof rules.block>[0][];
}) => {
	const { ctx, members } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false }),
			s.otherCustomers(otherCustomerIds.map((id) => ({ id }))),
			...(featureGrant
				? [
						s.featureGrant({
							id: featureGrant.id,
							entitlements: [
								{ feature_id: TestFeature.Messages, allowance: 10 },
							],
							promoCodes: [{ code: featureGrant.code }],
						}),
					]
				: []),
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
		rules: blocks(sales.userId).map((rule) => rules.block(rule)),
	});
	return { ctx, sales, client: enforceApprovals(client), cleanup };
};

const userSubject = (userId: string) => [
	{ type: "user" as const, user_id: userId },
];

test.concurrent(
	`${chalk.yellowBright("rewards-customers enforce 1: customer update and delete are judged on the customer")}`,
	async () => {
		const customerId = "approvals-customers-locked";
		const otherId = "approvals-customers-open";
		const ruleName = "Locked customer";
		const { ctx, sales, client, cleanup } = await setupMemberBlocks({
			customerId,
			otherCustomerIds: [otherId],
			blocks: (userId) => [
				{
					name: ruleName,
					subjects: userSubject(userId),
					actions: ["customers.update", "customers.delete"],
					filter: { customer: { customer_id: customerId } },
				},
			],
		});

		try {
			expectPermissionDenied({
				res: await postRaw({
					client,
					path: "/customers.update",
					body: { customer_id: customerId, name: "Renamed" },
				}),
				ruleName,
			});
			expectPermissionDenied({
				res: await postRaw({
					client,
					path: "/customers.delete",
					body: { customer_id: customerId },
				}),
				ruleName,
			});
			const [decision] = await listDecisions({
				ctx,
				userId: sales.userId,
				action: "customers.delete",
			});
			expect(decision.facts).toMatchObject({
				customer: { id: customerId, has_paid: false },
			});
			expect(
				await CusService.get({
					db: ctx.db,
					idOrInternalId: customerId,
					orgId: ctx.org.id,
					env: ctx.env,
				}),
			).toBeTruthy();

			const updated = await postRaw({
				client,
				path: "/customers.update",
				body: { customer_id: otherId, name: "Renamed" },
			});
			expect(updated.status).toBe(200);
		} finally {
			await cleanup();
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("rewards-customers enforce 2: redeeming a promo code or adding a coupon is judged on its reward, as rewards.redeem")}`,
	async () => {
		const customerId = "approvals-rewards-redeem";
		const suffix = Date.now();
		const featureGrant = {
			id: `approvals-grant-${suffix}`,
			code: `APPROVALS${suffix}`,
		};
		const ruleName = "No grant redemptions";
		const { ctx, sales, client, cleanup } = await setupMemberBlocks({
			customerId,
			featureGrant,
			blocks: (userId) => [
				{
					name: ruleName,
					subjects: userSubject(userId),
					actions: ["rewards.redeem"],
					filter: { reward_id: featureGrant.id },
				},
			],
		});

		try {
			expectPermissionDenied({
				res: await postRaw({
					client,
					path: "/rewards.redeem",
					body: { code: featureGrant.code, customer_id: customerId },
				}),
				ruleName,
				violations: [{ field: "reward_id" }],
			});
			const [decision] = await listDecisions({
				ctx,
				userId: sales.userId,
				action: "rewards.redeem",
			});
			expect(decision.facts).toMatchObject({
				customer: { id: customerId },
				reward_id: featureGrant.id,
			});

			expectPermissionDenied({
				res: await postRaw({
					client,
					path: `/customers/${customerId}/coupons/${featureGrant.id}`,
					body: { promo_code: featureGrant.code },
				}),
				ruleName,
			});
		} finally {
			await cleanup();
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("rewards-customers enforce 3: a block on customers.get_or_create stops creation but still returns an existing customer")}`,
	async () => {
		const customerId = "approvals-customers-existing";
		const ruleName = "No new customers";
		const { ctx, client, cleanup } = await setupMemberBlocks({
			customerId,
			blocks: (userId) => [
				{
					name: ruleName,
					subjects: userSubject(userId),
					actions: ["customers.get_or_create"],
				},
			],
		});

		try {
			const existing = await postRaw({
				client,
				path: "/customers.get_or_create",
				body: { customer_id: customerId },
			});
			expect(existing.status).toBe(200);

			const newId = `approvals-customers-new-${Date.now()}`;
			for (const [path, body] of [
				["/customers.get_or_create", { customer_id: newId }],
				["/customers", { id: newId }],
			] as const) {
				expectPermissionDenied({
					res: await postRaw({ client, path, body }),
					ruleName,
				});
			}
			expect(
				await CusService.get({
					db: ctx.db,
					idOrInternalId: newId,
					orgId: ctx.org.id,
					env: ctx.env,
				}),
			).toBeFalsy();
		} finally {
			await cleanup();
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("rewards-customers enforce 4: a block on rewards.create stops creating rewards")}`,
	async () => {
		const customerId = "approvals-rewards-create";
		const ruleName = "No new rewards";
		const { client, cleanup } = await setupMemberBlocks({
			customerId,
			blocks: (userId) => [
				{
					name: ruleName,
					subjects: userSubject(userId),
					actions: ["rewards.create"],
				},
			],
		});

		try {
			const suffix = Date.now();
			expectPermissionDenied({
				res: await postRaw({
					client,
					path: "/rewards.create",
					body: {
						coupon: {
							id: `approvals_coupon_${suffix}`,
							name: "Blocked coupon",
							type: RewardType.PercentageDiscount,
							value: 10,
							duration: { type: CouponDurationType.Months, length: 1 },
							plan_ids: null,
							promo_codes: [],
						},
					},
				}),
				ruleName,
			});
		} finally {
			await cleanup();
		}
	},
);
