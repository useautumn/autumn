import { test } from "bun:test";
import chalk from "chalk";
import { runOverageRenewal } from "./utils/skipOverageSubmission";

test(`${chalk.yellowBright("disable overage billing: customer true skips Stripe overage and resets")}`, async () => {
	await runOverageRenewal({
		customerId: "disable-overage-customer-true",
		orgDisableOverageBilling: false,
		customerDisableOverageBilling: true,
		expectedLatestTotal: 20,
	});
});
