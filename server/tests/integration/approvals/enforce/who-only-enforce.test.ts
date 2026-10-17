import { expect, test } from "bun:test";
import { enforceApprovals } from "@tests/integration/approvals/utils/enforceApprovals";
import { listDecisions } from "@tests/integration/approvals/utils/expectDecisionLogged";
import {
	expectPermissionDenied,
	postRaw,
} from "@tests/integration/approvals/utils/expectPermissionDenied";
import { setupApprovalRules } from "@tests/integration/approvals/utils/setupApprovalRules";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { rules } from "@tests/utils/fixtures/rules";
import { autumnAs } from "@tests/utils/testInitUtils/autumnAs";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import type { AutumnInt } from "@/external/autumn/autumnCli.js";

/** API key creation and migrations are who-only actions: checked against the rules with no conditions (E5e). */

/** The dashboard's internal routes sit at the server root, not under /v1. */
const internalClient = (client: AutumnInt) =>
	({
		baseUrl: client.baseUrl.replace(/\/v1$/, ""),
		headers: client.headers,
	}) as AutumnInt;

const dashboardMigration = ({
	id,
	planId,
}: {
	id: string;
	planId: string;
}) => ({
	id,
	filter: { customer: { plan: { plan_id: planId } } },
	operations: {
		customer: [
			{
				type: "update_plan" as const,
				plan_filter: { plan_id: planId },
				customize: { add_items: [itemsV2.dashboard()] },
			},
		],
	},
});

test.concurrent(
	`${chalk.yellowBright("who-only enforce 1: an Everyone block on api_keys.create stops a developer; a later admin-role allow lets admins")}`,
	async () => {
		const suffix = Date.now();
		const { ctx, members, autumnV2_2 } = await initScenario({
			customerId: `approvals-who-only-keys-${suffix}`,
			setup: [
				s.platform.create({
					setupDefaultFeatures: true,
					userEmail: `approvals-who-only-${suffix}@autumn.test`,
				}),
				s.member({ role: "owner" }),
				s.member({ role: "developer" }),
				s.member({ role: "admin" }),
			],
			actions: [],
		});
		const [owner, developer, admin] = members;
		const { client, cleanup } = await setupApprovalRules({
			ctx,
			owner,
			member: developer,
			rules: [
				rules.block({
					name: "No new API keys",
					actions: ["api_keys.create"],
				}),
				rules.allow({
					name: "Admins create API keys",
					subjects: [{ type: "role", role_id: "admin" }],
					actions: ["api_keys.create"],
				}),
				rules.block({
					name: "No new migrations",
					actions: ["migrations.create"],
				}),
			],
		});
		const adminClient = enforceApprovals(autumnAs(admin));
		adminClient.headers["x-approvals-sandbox-as-live"] = "true";

		try {
			expectPermissionDenied({
				res: await postRaw({
					client: internalClient(enforceApprovals(client)),
					path: "/dev/api_key",
					body: { name: "Blocked key" },
				}),
				ruleName: "No new API keys",
			});
			const adminKey = await postRaw({
				client: internalClient(adminClient),
				path: "/dev/api_key",
				body: { name: "Admin key" },
			});
			expect(adminKey.status).toBe(200);

			// A secret key skips the approval step, so the Everyone block doesn't apply to it.
			const migration = await autumnV2_2.post("/migrations.create", {
				id: `approvals-who-only-key-${suffix}`,
			});
			expect(migration).toMatchObject({
				id: `approvals-who-only-key-${suffix}`,
			});
		} finally {
			await cleanup();
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("who-only enforce 2: blocks on migrations.create and migrations.run stop a member, but a dry run goes through")}`,
	async () => {
		const suffix = Date.now().toString(36);
		const plan = products.base({
			id: `approvals-mig-plan-${suffix}`,
			items: [],
		});
		const { ctx, members, autumnV2_2 } = await initScenario({
			customerId: `approvals-who-only-mig-${suffix}`,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [plan] }),
				s.member({ role: "owner" }),
				s.member({ role: "developer" }),
			],
			actions: [],
		});
		const [owner, developer] = members;
		const subjects = [{ type: "user" as const, user_id: developer.userId }];
		const { client, cleanup } = await setupApprovalRules({
			ctx,
			owner,
			member: developer,
			rules: [
				rules.block({
					name: "Developer: no migration runs",
					subjects,
					actions: ["migrations.run"],
				}),
				rules.block({
					name: "Developer: no new migrations",
					subjects,
					actions: ["migrations.create"],
				}),
			],
		});
		const migration = await autumnV2_2.migrationsV2.deleteAndCreate(
			dashboardMigration({
				id: `approvals-who-only-run-${suffix}`,
				planId: plan.id,
			}),
		);
		const enforced = enforceApprovals(client);

		try {
			expectPermissionDenied({
				res: await postRaw({
					client: enforced,
					path: "/migrations.create",
					body: { id: `approvals-who-only-new-${suffix}` },
				}),
				ruleName: "Developer: no new migrations",
			});
			expectPermissionDenied({
				res: await postRaw({
					client: enforced,
					path: "/migrations.run",
					body: { id: migration.id },
				}),
				ruleName: "Developer: no migration runs",
			});

			// The run itself may fail without Trigger.dev locally; the rules must not judge it.
			const dryRun = await postRaw({
				client: enforced,
				path: "/migrations.run",
				body: { id: migration.id, dry_run: true },
			});
			expect(dryRun.status).not.toBe(403);
			const runDecisions = await listDecisions({
				ctx,
				userId: developer.userId,
				action: "migrations.run",
			});
			expect(runDecisions).toHaveLength(1);
		} finally {
			await cleanup();
		}
	},
);
