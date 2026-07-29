/** Verifies the built package preserves separate prepaid reset and billing intervals. */
import { expect, test } from "bun:test";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ApiVersion, type ApiPlanV1 } from "@autumn/shared";
import chalk from "chalk";
import { AutumnRpcCli } from "../../../../../server/src/external/autumn/autumnRpcCli.js";
import {
	createCleanAtmnIntegrationContext,
	prepareAtmnIntegrationWorkspace,
	runAtmnWorkspaceCli,
} from "../utils/atmnTestWorkspace.js";

const atmnPackageDir = fileURLToPath(new URL("../../../", import.meta.url));
const builtCliPath = join(atmnPackageDir, "dist/cli.js");

test(`${chalk.yellowBright("atmn built CLI: push → pull → push preserves separate intervals")}`, async () => {
	const planId = "atmn_split_cycle_scale_annual";
	const ctx = await createCleanAtmnIntegrationContext();
	const build = Bun.spawn(["bun", "run", "build"], {
		cwd: atmnPackageDir,
		stderr: "inherit",
		stdout: "inherit",
	});
	expect(await build.exited).toBe(0);
	const workspace = await prepareAtmnIntegrationWorkspace({
		atmnPackageDir,
		secretKey: ctx.orgSecretKey,
	});

	await writeFile(
		workspace.configPath,
		`import { feature, item, plan } from 'atmn';

export const splitCycleCredits = feature({
\tid: 'atmn_split_cycle_credits',
\tname: 'Split Cycle Credits',
\ttype: 'metered',
\tconsumable: true,
});

export const splitCycleScaleAnnual = plan({
\tid: '${planId}',
\tname: 'Split Cycle Scale Annual',
\titems: [
\t\titem({
\t\t\tfeatureId: splitCycleCredits.id,
\t\t\tincluded: 1000,
\t\t\treset: { interval: 'month' },
\t\t\tprice: {
\t\t\t\tamount: 100,
\t\t\t\tbillingUnits: 1000,
\t\t\t\tbillingMethod: 'prepaid',
\t\t\t\tinterval: 'year',
\t\t\t},
\t\t}),
\t],
});
`,
	);

	await runAtmnWorkspaceCli({
		args: ["--yes"],
		cliPath: builtCliPath,
		command: "push",
		headless: true,
		workspace,
	});

	const rpc = new AutumnRpcCli({
		secretKey: ctx.orgSecretKey,
		version: ApiVersion.V2_1,
	});
	const pushed = await rpc.plans.get<ApiPlanV1>(planId);
	expect(pushed.items[0]).toMatchObject({
		reset: { interval: "month" },
		price: { billing_method: "prepaid", interval: "year" },
	});

	await runAtmnWorkspaceCli({
		args: ["--force", "--no-declaration-file"],
		cliPath: builtCliPath,
		command: "pull",
		headless: true,
		workspace,
	});
	const pulledConfig = await readFile(workspace.configPath, "utf8");
	expect(pulledConfig).toContain("reset: {");
	expect(pulledConfig).toContain("interval: 'month'");
	expect(pulledConfig).toContain("interval: 'year'");

	await runAtmnWorkspaceCli({
		args: ["--yes"],
		cliPath: builtCliPath,
		command: "push",
		headless: true,
		workspace,
	});
	const roundTripped = await rpc.plans.get<ApiPlanV1>(planId);
	expect(roundTripped.items[0]).toMatchObject({
		reset: { interval: "month" },
		price: { billing_method: "prepaid", interval: "year" },
	});
});
