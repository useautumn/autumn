/**
 * atmn scenarios/pull — every version of a plan lands in `plans.ts`, each
 * row stating `active`. A user may then lift a row into its own file under
 * any export name; pull keeps finding it by stable id and edits it where it
 * is, and a new server version is appended to the array the root imports.
 */

import { expect, test } from "bun:test";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";
import { paidMonthly } from "@tests/utils/atmnUtils/baseConfigs.js";
import {
	initAtmnScenario,
	runCli,
	scenarioDir,
} from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";

test.concurrent(
	"every version lands in plans.ts; a row lifted into its own variable is still found and updated",
	async () => {
		const planId = uniqueTestId("atmn_version_file");
		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
			],
			config: `{
	plans: [${paidMonthly({ planId })}
	],
}`,
		});
		const freshDirectory = scenarioDir({
			id: uniqueTestId("atmn_version_pull"),
		});
		const pull = () =>
			runCli({
				cwd: freshDirectory,
				// An empty dir: -c names the folder so headless pull scaffolds.
				args: ["pull", "-c", "."],
				secretKey: scenario.secretKey,
				baseUrl: scenario.baseUrl,
			});
		const dryRun = () =>
			runCli({
				cwd: freshDirectory,
				args: ["push", "--dry-run"],
				secretKey: scenario.secretKey,
				baseUrl: scenario.baseUrl,
			});
		const mintVersion = ({ name, amount }: { name: string; amount: number }) =>
			scenario.client.update({
				plans: [
					{
						plan_id: planId,
						versioning: "new_version",
						active: true,
						name,
						price: { amount, interval: "month" },
					},
				],
			});

		try {
			await scenario.push();
			await mintVersion({ name: "Pro v2", amount: 59 });

			// A fresh pull: both versions in plans.ts, the root imports the array.
			const firstOutput = pull();
			expect(firstOutput).toContain(`+ ${planId}@v1`);
			expect(firstOutput).toContain(`+ ${planId}@v2`);
			const rootPath = join(freshDirectory, "autumn.config.ts");
			const plansPath = join(freshDirectory, "plans.ts");
			const root = readFileSync(rootPath, "utf8");
			const plans = readFileSync(plansPath, "utf8");
			expect(root).toContain('import { plans } from "./plans";');
			expect(root).not.toContain("plan(");
			expect(plans.match(/plan\(\{/g)).toHaveLength(2);
			expect(plans).toContain('versionSlug: "v1"');
			expect(plans).toContain('versionSlug: "v2"');
			expect(plans.match(/active: true/g)).toHaveLength(1);
			expect(plans.match(/active: false/g)).toHaveLength(1);

			expect(pull()).toBe("Nothing to pull.\n");
			expect(readFileSync(plansPath, "utf8")).toBe(plans);
			expect(dryRun()).toContain("No changes");

			// The user lifts v1 into its own file under a name of their choosing,
			// and references it from the array. Pull must follow the reference.
			const planLiterals = [
				...plans.matchAll(/\tplan\(\{[\s\S]*?\t\}\),/g),
			].map((match) => match[0]);
			const v1Literal = planLiterals.find((literal) =>
				literal.includes('versionSlug: "v1"'),
			);
			expect(v1Literal).toBeDefined();
			if (v1Literal === undefined) throw new Error("v1 row not found");
			const legacyPath = join(freshDirectory, "legacy.ts");
			const legacyExport = "userNamedLegacy";
			writeFileSync(
				legacyPath,
				[
					plans.split("\n").find((line) => line.startsWith("import ")) ?? "",
					"",
					`export const ${legacyExport} = ${v1Literal.trim().replace(/,$/, "")};`,
					"",
				].join("\n"),
				"utf8",
			);
			writeFileSync(
				plansPath,
				`import { ${legacyExport} } from "./legacy";\n${plans.replace(v1Literal, `\t${legacyExport},`)}`,
				"utf8",
			);
			expect(dryRun()).toContain("No changes");

			// The server mints v3: it is appended to the array the root imports,
			// v2 flips to inactive where it sits, and the lifted v1 is untouched.
			await mintVersion({ name: "Pro v3", amount: 69 });
			const thirdOutput = pull();
			expect(thirdOutput).toContain(`+ ${planId}@v3`);
			expect(thirdOutput).toContain(`~ ${planId}@v2`);
			const finalPlans = readFileSync(plansPath, "utf8");
			const finalLegacy = readFileSync(legacyPath, "utf8");
			expect(finalPlans).toContain(`\t${legacyExport},`);
			expect(finalPlans).toContain('versionSlug: "v3"');
			expect(finalPlans.match(/active: true/g)).toHaveLength(1);
			expect(finalLegacy).toContain(`export const ${legacyExport} = plan({`);
			expect(finalLegacy).toContain('versionSlug: "v1"');
			expect(finalLegacy).toContain("active: false");
			expect(pull()).toBe("Nothing to pull.\n");
			expect(dryRun()).toContain("No changes");

			// A server-side edit to the lifted row lands in the user's file.
			await scenario.client.update({
				plans: [
					{ plan_id: planId, version_slug: "v1", name: "Pro v1 (renamed)" },
				],
			});
			expect(pull()).toContain(`~ ${planId}@v1`);
			expect(readFileSync(legacyPath, "utf8")).toContain(
				'name: "Pro v1 (renamed)"',
			);
			expect(readFileSync(plansPath, "utf8")).not.toContain("Pro v1 (renamed)");
			expect(dryRun()).toContain("No changes");
		} finally {
			rmSync(freshDirectory, { recursive: true, force: true });
			scenario.cleanup();
		}
	},
);
