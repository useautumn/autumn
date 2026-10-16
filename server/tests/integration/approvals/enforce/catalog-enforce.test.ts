import { expect, test } from "bun:test";
import { enforceApprovals } from "@tests/integration/approvals/utils/enforceApprovals";
import {
	expectPermissionDenied,
	postRaw,
} from "@tests/integration/approvals/utils/expectPermissionDenied";
import { setupApprovalRules } from "@tests/integration/approvals/utils/setupApprovalRules";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { rules } from "@tests/utils/fixtures/rules";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { ProductService } from "@/internal/products/ProductService";

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
			const gone = products.base({
				id: `approvals_bulk_gone_${suffix}`,
				items: [items.monthlyMessages({ includedUsage: 10 })],
			});
			await initScenario({
				setup: [s.products({ list: [gone] })],
				actions: [],
			});
			expectPermissionDenied({
				res: await postRaw({
					client,
					path: "/catalogV2.update",
					body: { remove_plans: [{ plan_id: gone.id }] },
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

test.concurrent(
	`${chalk.yellowBright("catalog enforce 4: variants, license parents, mappings and internal-id renames are judged on the plans they write")}`,
	async () => {
		const suffix = Date.now();
		const allowedPlan = `approvals_variant_base_${suffix}`;
		const { client, cleanup } = await setupCatalogRules({
			customerId: "approvals-catalog-variants",
			role: "developer",
			allowedPlan,
			allowedFeature: `approvals_variant_feature_${suffix}`,
		});
		const source = products.base({
			id: `approvals_rename_source_${suffix}`,
			items: [items.monthlyMessages({ includedUsage: 10 })],
		});
		const { ctx } = await initScenario({
			setup: [s.products({ list: [source] })],
			actions: [],
		});
		const sourcePlan = await ProductService.getFull({
			db: ctx.db,
			idOrInternalId: source.id,
			orgId: ctx.org.id,
			env: ctx.env,
		});

		try {
			// A stated plan is edited even when only its RevenueCat mapping changes.
			expectPermissionDenied({
				res: await postRaw({
					client,
					path: "/catalogV2.update",
					body: {
						plans: [{ plan_id: source.id, processors: { revenuecat: null } }],
					},
				}),
				violations: [{ field: "plan_id" }],
			});

			// Renaming another plan onto the allowed id still edits that other plan.
			expectPermissionDenied({
				res: await postRaw({
					client,
					path: "/catalogV2.update",
					body: {
						plans: [
							{
								plan_id: allowedPlan,
								internal_id: sourcePlan.internal_id,
								name: "Renamed",
							},
						],
					},
				}),
				violations: [{ field: "plan_id" }],
			});
			const created = await postRaw({
				client,
				path: "/plans.create",
				body: { plan_id: allowedPlan, name: "Base" },
			});
			expect(created).toMatchObject({ status: 200 });

			const variantRes = await postRaw({
				client,
				path: "/plans.update",
				body: {
					plan_id: allowedPlan,
					update_variant_ids: [`approvals_variant_no_${suffix}`],
				},
			});
			expectPermissionDenied({
				res: variantRes,
				violations: [{ field: "plan_id" }],
			});
		} finally {
			await cleanup();
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalog enforce 5: a full-state update is judged only on what it changes or deletes")}`,
	async () => {
		const suffix = Date.now();
		const keep = products.base({
			id: "keep",
			items: [items.monthlyMessages({ includedUsage: 10 })],
		});
		const { ctx, members } = await initScenario({
			customerId: `approvals-catalog-full-state-${suffix}`,
			setup: [
				s.platform.create({
					setupDefaultFeatures: true,
					userEmail: `approvals-catalog-full-state-${suffix}@autumn.test`,
				}),
				s.products({ list: [keep] }),
				s.member({ role: "owner" }),
				s.member({ role: "developer" }),
			],
			actions: [],
		});
		const [owner, developer] = members;
		const { client, cleanup } = await setupApprovalRules({
			ctx,
			owner,
			member: developer,
			rules: [
				rules.rule({
					name: "No plan edits",
					subjects: [{ type: "user", user_id: developer.userId }],
					actions: ["catalog.edit_plans"],
					when: { plan_id: "approvals_no_such_plan" },
				}),
			],
		});
		enforceApprovals(client);

		try {
			// Plans are omitted, so none is edited or deleted; every feature is kept.
			const listed = await postRaw({
				client,
				path: "/features.list",
				body: {},
			});
			const featureIds = (listed.body.list as { id: string }[]).map(
				({ id }) => id,
			);
			const res = await postRaw({
				client,
				path: "/catalogV2.update",
				body: {
					features: [],
					skip_deletions: false,
					skip_feature_ids: featureIds,
				},
			});
			expect(res).toMatchObject({ status: 200 });
		} finally {
			await cleanup();
		}
	},
);
