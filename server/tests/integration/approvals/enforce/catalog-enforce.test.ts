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

/** Plan and feature writes are checked per verb and per id, single routes and bulk catalog updates alike (E5d). */

type RuleSpec = NonNullable<Parameters<typeof rules.block>[0]>;

const setupCatalogBlocks = async ({
	customerId,
	planIds = [],
	featureIds = [],
	blocks,
}: {
	customerId: string;
	planIds?: string[];
	featureIds?: string[];
	blocks: (subjects: RuleSpec["subjects"]) => RuleSpec[];
}) => {
	const { ctx, members, autumnV2_3 } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false }),
			s.member({ role: "owner" }),
			// Sales has no plans or features scope, and a rule never grants one.
			s.member({ role: "admin" }),
		],
		actions: [],
	});
	// Created with the secret key, which approvals skip.
	for (const planId of planIds) {
		await autumnV2_3.post("/plans.create", { plan_id: planId, name: planId });
	}
	for (const featureId of featureIds) {
		await autumnV2_3.post("/features.create", {
			feature_id: featureId,
			name: featureId,
			type: "boolean",
		});
	}
	const [owner, admin] = members;
	const { client, cleanup } = await setupApprovalRules({
		ctx,
		owner,
		member: admin,
		rules: blocks([{ type: "user", user_id: admin.userId }]).map((rule) =>
			rules.block(rule),
		),
	});
	return { client: enforceApprovals(client), cleanup };
};

const uniqueId = (name: string) =>
	`apr_${name}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

test.concurrent(
	`${chalk.yellowBright("catalog enforce 1: a block on plans.update for one plan stops editing and renaming it, not other plans")}`,
	async () => {
		const locked = uniqueId("locked");
		const open = uniqueId("open");
		const ruleName = "Locked plan";
		const { client, cleanup } = await setupCatalogBlocks({
			customerId: "approvals-catalog-update",
			planIds: [locked, open],
			blocks: (subjects) => [
				{
					name: ruleName,
					subjects,
					actions: ["plans.update"],
					filter: { plan_id: locked },
				},
			],
		});

		try {
			for (const [path, body] of [
				["/plans.update", { plan_id: locked, name: "Renamed" }],
				["/plans.update", { plan_id: locked, new_plan_id: uniqueId("moved") }],
				["/plans.update", { plan_id: open, update_variant_ids: [locked] }],
				[`/products/${locked}`, { name: "Renamed" }],
			] as const) {
				expectPermissionDenied({
					res: await postRaw({ client, path, body }),
					ruleName,
					violations: [{ field: "plan_id" }],
				});
			}

			const other = await postRaw({
				client,
				path: "/plans.update",
				body: { plan_id: open, name: "Renamed" },
			});
			expect(other.status).toBe(200);
		} finally {
			await cleanup();
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalog enforce 2: plans.create and plans.delete are their own verbs; create_variant is a plans.create on the variant only")}`,
	async () => {
		const base = uniqueId("base");
		const blockedNew = uniqueId("blocked_new");
		const { client, cleanup } = await setupCatalogBlocks({
			customerId: "approvals-catalog-verbs",
			planIds: [base],
			blocks: (subjects) => [
				{
					name: "No new blocked plan",
					subjects,
					actions: ["plans.create"],
					filter: { plan_id: blockedNew },
				},
				{
					name: "Keep the base plan",
					subjects,
					actions: ["plans.delete"],
					filter: { plan_id: base },
				},
			],
		});

		try {
			for (const [path, body] of [
				["/plans.create", { plan_id: blockedNew, name: "New" }],
				["/products", { id: blockedNew, name: "New" }],
				[
					"/plans.create_variant",
					{ base_plan_id: base, variant_plan_id: blockedNew, name: "Variant" },
				],
			] as const) {
				expectPermissionDenied({
					res: await postRaw({ client, path, body }),
					ruleName: "No new blocked plan",
				});
			}
			expectPermissionDenied({
				res: await postRaw({
					client,
					path: "/plans.delete",
					body: { plan_id: base },
				}),
				ruleName: "Keep the base plan",
			});

			const variant = await postRaw({
				client,
				path: "/plans.create_variant",
				body: {
					base_plan_id: base,
					variant_plan_id: uniqueId("variant"),
					name: "Variant",
				},
			});
			expect(variant.status).toBe(200);
		} finally {
			await cleanup();
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalog enforce 3: a bulk catalog update is judged per plan with its own verb")}`,
	async () => {
		const kept = uniqueId("kept");
		const edited = uniqueId("edited");
		const blockedNew = uniqueId("bulk_new");
		const { client, cleanup } = await setupCatalogBlocks({
			customerId: "approvals-catalog-bulk",
			planIds: [kept, edited],
			blocks: (subjects) => [
				{
					name: "No bulk new plan",
					subjects,
					actions: ["plans.create"],
					filter: { plan_id: blockedNew },
				},
				{
					name: "Keep the kept plan",
					subjects,
					actions: ["plans.delete"],
					filter: { plan_id: kept },
				},
			],
		});

		try {
			for (const path of ["/catalogV2.update", "/catalog.update"]) {
				expectPermissionDenied({
					res: await postRaw({
						client,
						path,
						body: { plans: [{ plan_id: blockedNew, name: "New" }] },
					}),
					ruleName: "No bulk new plan",
				});
			}
			expectPermissionDenied({
				res: await postRaw({
					client,
					path: "/catalogV2.update",
					body: { remove_plans: [{ plan_id: kept }] },
				}),
				ruleName: "Keep the kept plan",
			});

			const update = await postRaw({
				client,
				path: "/catalogV2.update",
				body: { plans: [{ plan_id: edited, name: "Edited" }] },
			});
			expect(update.status).toBe(200);
		} finally {
			await cleanup();
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalog enforce 4: features.delete is its own action, and a rename is judged on both ids")}`,
	async () => {
		const feature = uniqueId("feature");
		const reserved = uniqueId("reserved");
		const { client, cleanup } = await setupCatalogBlocks({
			customerId: "approvals-catalog-features",
			featureIds: [feature],
			blocks: (subjects) => [
				{
					name: "Keep the feature",
					subjects,
					actions: ["features.delete"],
					filter: { feature_id: feature },
				},
				{
					name: "Reserved feature id",
					subjects,
					actions: ["features.update"],
					filter: { feature_id: reserved },
				},
			],
		});

		try {
			const renamed = await postRaw({
				client,
				path: "/features.update",
				body: { feature_id: feature, name: "Renamed" },
			});
			expect(renamed.status).toBe(200);

			for (const [path, body] of [
				["/features.delete", { feature_id: feature }],
				["/catalogV2.update", { remove_features: [{ feature_id: feature }] }],
			] as const) {
				expectPermissionDenied({
					res: await postRaw({ client, path, body }),
					ruleName: "Keep the feature",
				});
			}
			expectPermissionDenied({
				res: await postRaw({
					client,
					path: "/features.update",
					body: { feature_id: feature, new_feature_id: reserved },
				}),
				ruleName: "Reserved feature id",
			});
		} finally {
			await cleanup();
		}
	},
);
