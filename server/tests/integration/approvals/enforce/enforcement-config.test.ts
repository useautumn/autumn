import { expect, test } from "bun:test";
import { OrgConfigSchema } from "@autumn/shared";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { OrgService } from "@/internal/orgs/OrgService.js";

test.concurrent(
	`${chalk.yellowBright("enforcement config: the org config route refuses approvals_enforced")}`,
	async () => {
		const { autumnV1 } = await initScenario({
			customerId: "approvals-enforcement-config",
			setup: [s.customer({})],
			actions: [],
		});

		await autumnV1.patch("/organization/config", { approvals_enforced: true });

		const org = await OrgService.get({ db: ctx.db, orgId: ctx.org.id });
		expect(OrgConfigSchema.parse(org.config).approvals_enforced).toBe(false);
	},
);
