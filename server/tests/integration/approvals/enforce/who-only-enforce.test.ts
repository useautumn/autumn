import { expect, test } from "bun:test";
import { enforceApprovals } from "@tests/integration/approvals/utils/enforceApprovals";
import { postRaw } from "@tests/integration/approvals/utils/expectPermissionDenied";
import { setupApprovalRules } from "@tests/integration/approvals/utils/setupApprovalRules";
import { rules } from "@tests/utils/fixtures/rules";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

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

			const migration = await postRaw({
				client,
				path: "/migrations.create",
				body: { id: `approvals_migration_${Date.now()}` },
			});
			expect(migration).toMatchObject({ status: 200 });
		} finally {
			await cleanup();
		}
	},
);
