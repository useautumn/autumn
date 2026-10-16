import { expect, test } from "bun:test";
import { enforceApprovals } from "@tests/integration/approvals/utils/enforceApprovals";
import {
	expectPermissionDenied,
	postRaw,
} from "@tests/integration/approvals/utils/expectPermissionDenied";
import { setupApprovalRules } from "@tests/integration/approvals/utils/setupApprovalRules";
import { rules } from "@tests/utils/fixtures/rules";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

/** Plan and feature edits are checked against the member's rules on the plan or feature id (E5d). */

const setupCatalogRules = async ({
	customerId,
	role,
	allowedPlan,
	allowedFeature,
}: {
	customerId: string;
	role: "developer" | "sales";
	allowedPlan: string;
	allowedFeature: string;
}) => {
	const { ctx, members } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false }),
			s.member({ role: "owner" }),
			s.member({ role }),
		],
		actions: [],
	});
	const [owner, member] = members;
	const subjects = [{ type: "user" as const, user_id: member.userId }];
	const { client, cleanup } = await setupApprovalRules({
		ctx,
		owner,
		member,
		rules: [
			rules.rule({
				name: "One plan",
				subjects,
				actions: ["catalog.edit_plans"],
				when: { plan_id: allowedPlan },
			}),
			rules.rule({
				name: "One feature",
				subjects,
				actions: ["catalog.edit_features"],
				when: { feature_id: allowedFeature },
			}),
		],
	});
	return { client: enforceApprovals(client), cleanup };
};

test.concurrent(
	`${chalk.yellowBright("catalog enforce 1: plan and feature edits are judged on their id, renames included")}`,
	async () => {
		const suffix = Date.now();
		const allowedPlan = `approvals_plan_ok_${suffix}`;
		const otherPlan = `approvals_plan_no_${suffix}`;
		const allowedFeature = `approvals_feature_ok_${suffix}`;
		const { client, cleanup } = await setupCatalogRules({
			customerId: "approvals-catalog-single",
			role: "developer",
			allowedPlan,
			allowedFeature,
		});

		try {
			const created = await postRaw({
				client,
				path: "/plans.create",
				body: { plan_id: allowedPlan, name: "Allowed" },
			});
			expect(created).toMatchObject({ status: 200 });

			for (const [path, body] of [
				["/plans.create", { plan_id: otherPlan, name: "Other" }],
				["/plans.update", { plan_id: allowedPlan, new_plan_id: otherPlan }],
				["/plans.delete", { plan_id: otherPlan }],
			] as const) {
				expectPermissionDenied({
					res: await postRaw({ client, path, body }),
					violations: [{ field: "plan_id" }],
				});
			}

			const feature = await postRaw({
				client,
				path: "/features.create",
				body: { feature_id: allowedFeature, name: "Allowed", type: "boolean" },
			});
			expect(feature).toMatchObject({ status: 200 });
			expectPermissionDenied({
				res: await postRaw({
					client,
					path: "/features.create",
					body: {
						feature_id: `approvals_feature_no_${suffix}`,
						name: "Other",
						type: "boolean",
					},
				}),
				violations: [{ field: "feature_id" }],
			});

			const deleted = await postRaw({
				client,
				path: "/plans.delete",
				body: { plan_id: allowedPlan },
			});
			expect(deleted).toMatchObject({ status: 200 });
		} finally {
			await cleanup();
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalog enforce 2: bulk catalog updates are judged on every plan they touch")}`,
	async () => {
		const suffix = Date.now();
		const { client, cleanup } = await setupCatalogRules({
			customerId: "approvals-catalog-bulk",
			role: "developer",
			allowedPlan: `approvals_bulk_ok_${suffix}`,
			allowedFeature: `approvals_bulk_feature_${suffix}`,
		});

		try {
			expectPermissionDenied({
				res: await postRaw({
					client,
					path: "/catalog.update",
					body: {
						plans: [{ plan_id: `approvals_bulk_no_${suffix}`, name: "No" }],
					},
				}),
				violations: [{ field: "plan_id" }],
			});
			expectPermissionDenied({
				res: await postRaw({
					client,
					path: "/catalogV2.update",
					body: {
						remove_plans: [{ plan_id: `approvals_bulk_gone_${suffix}` }],
					},
				}),
				violations: [{ field: "plan_id" }],
			});
		} finally {
			await cleanup();
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalog enforce 3: a rule lets a member without plans:write create the plan it names")}`,
	async () => {
		const suffix = Date.now();
		const allowedPlan = `approvals_granted_plan_${suffix}`;
		const { client, cleanup } = await setupCatalogRules({
			customerId: "approvals-catalog-granted",
			role: "sales",
			allowedPlan,
			allowedFeature: `approvals_granted_feature_${suffix}`,
		});

		try {
			const created = await postRaw({
				client,
				path: "/plans.create",
				body: { plan_id: allowedPlan, name: "Granted" },
			});
			expect(created).toMatchObject({ status: 200 });
		} finally {
			await cleanup();
		}
	},
);
