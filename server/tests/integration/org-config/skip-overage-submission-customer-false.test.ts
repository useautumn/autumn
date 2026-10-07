// tw:solo: runOverageRenewal toggles org.config.disable_overage_billing via OrgService.update, so this file can't share a worker.

import { test } from "bun:test";
import chalk from "chalk";
import { runOverageRenewal } from "./utils/skipOverageSubmission";

test(`${chalk.yellowBright("disable overage billing: customer false overrides org true")}`, async () => {
	await runOverageRenewal({
		customerId: "disable-overage-customer-false",
		orgDisableOverageBilling: true,
		customerDisableOverageBilling: false,
		expectedLatestTotal: 30,
	});
});
