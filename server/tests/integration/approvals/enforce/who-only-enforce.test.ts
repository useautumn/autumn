import { expect, test } from "bun:test";
import { enforceApprovals } from "@tests/integration/approvals/utils/enforceApprovals";
import { postRaw } from "@tests/integration/approvals/utils/expectPermissionDenied";
import { setupApprovalRules } from "@tests/integration/approvals/utils/setupApprovalRules";
import { rules } from "@tests/utils/fixtures/rules";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";

/** Who-only areas: a rule naming a member lets them past the route's coarse scope (E5e). */

test.concurrent(
	`${chalk.yellowBright("who-only enforce 1: a rule lets a member without the scope create API keys and migrations")}`,
	async () => {
		const { ctx, members } = await initScenario({
			customerId: "approvals-who-only-areas",
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
				rules.whoOnly({ actions: ["api_keys.create"], subjects }),
				rules.whoOnly({ actions: ["migrations.create"], subjects }),
				rules.whoOnly({ actions: ["migrations.run"], subjects }),
			],
		});
		enforceApprovals(client);
		// Internal dashboard routes are mounted at the root, not under /v1.
		const internalClient = Object.assign(Object.create(client), {
			baseUrl: client.baseUrl.replace(/\/v1\/?$/, ""),
		});

		try {
			const apiKey = await postRaw({
				client: internalClient,
				path: "/dev/api_key",
				body: { name: "Approvals key" },
			});
			expect(apiKey).toMatchObject({ status: 200 });

			// With no scopes asked for, the key gets the member's own scopes, never unrestricted access.
			const keyClient = new AutumnInt({
				secretKey: apiKey.body.api_key as string,
			});
			const viaKey = await postRaw({
				client: keyClient,
				path: "/plans.create",
				body: { plan_id: `approvals_key_plan_${Date.now()}`, name: "Key" },
			});
			expect(viaKey).toMatchObject({
				status: 403,
				body: { code: "insufficient_scopes" },
			});

			const migration = await postRaw({
				client,
				path: "/migrations.create",
				body: { id: `approvals_migration_${Date.now()}` },
			});
			expect(migration).toMatchObject({ status: 200 });

			// Past the scope check, an unknown migration is the route's own error.
			for (const path of ["/migrations.run", "/migrations.lazy_run"]) {
				const run = await postRaw({
					client,
					path,
					body: { id: "approvals_no_such_migration" },
				});
				expect(run.body.code).not.toBe("insufficient_scopes");
			}
		} finally {
			await cleanup();
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("who-only enforce 2: without a run rule, a member without the scope can't run migrations")}`,
	async () => {
		const { ctx, members } = await initScenario({
			customerId: "approvals-who-only-no-run",
			setup: [
				s.customer({ testClock: false }),
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
				rules.whoOnly({
					actions: ["migrations.create"],
					subjects: [{ type: "user", user_id: sales.userId }],
				}),
			],
		});
		enforceApprovals(client);

		try {
			for (const path of ["/migrations.run", "/migrations.lazy_run"]) {
				const run = await postRaw({
					client,
					path,
					body: { id: "approvals_no_such_migration" },
				});
				expect(run).toMatchObject({
					status: 403,
					body: { code: "insufficient_scopes" },
				});
			}
		} finally {
			await cleanup();
		}
	},
);
