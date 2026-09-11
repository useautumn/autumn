import { expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";
import { paidMonthly } from "@tests/utils/atmnUtils/baseConfigs.js";
import {
	initAtmnScenario,
	runCli,
	TMP_ROOT,
} from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";

test.concurrent(
	"plan versions get their own file and keep its user-chosen location",
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
		const freshDirectory = join(TMP_ROOT, uniqueTestId("atmn_version_pull"));
		mkdirSync(freshDirectory, { recursive: true });

		try {
			await scenario.push();
			await scenario.client.update({
				plans: [
					{
						plan_id: planId,
						versioning: "new_version",
						active: true,
						name: "Pro v2",
						price: { amount: 59, interval: "month" },
					},
				],
			});

			const firstOutput = runCli({
				cwd: freshDirectory,
				args: ["pull"],
				secretKey: scenario.secretKey,
				baseUrl: scenario.baseUrl,
			});
			expect(firstOutput).toContain(`+ ${planId}@v1`);
			const rootPath = join(freshDirectory, "autumn.config.ts");
			const versionPath = join(freshDirectory, "planVersions", `${planId}.ts`);
			const root = readFileSync(rootPath, "utf8");
			const version = readFileSync(versionPath, "utf8");
			const v1Export = `${planId}_v1`.replace(/[^A-Za-z0-9]/g, "_");
			expect(root).toContain(
				`import { ${v1Export} } from "./planVersions/${planId}";`,
			);
			expect(root).toContain(`planVersions: [\n\t\t${v1Export},`);
			expect(root).toContain('versionSlug: "v2"');
			expect(version).toContain(`export const ${v1Export} = plan({`);
			expect(version).toContain('versionSlug: "v1"');

			const secondOutput = runCli({
				cwd: freshDirectory,
				args: ["pull"],
				secretKey: scenario.secretKey,
				baseUrl: scenario.baseUrl,
			});
			expect(secondOutput).toBe("Nothing to pull.\n");
			expect(readFileSync(rootPath, "utf8")).toBe(root);
			expect(readFileSync(versionPath, "utf8")).toBe(version);
			const dryRunOutput = runCli({
				cwd: freshDirectory,
				args: ["push", "--dry-run"],
				secretKey: scenario.secretKey,
				baseUrl: scenario.baseUrl,
			});
			expect(dryRunOutput).toContain("No changes");

			const legacyPath = join(freshDirectory, "planVersions", "legacy.ts");
			const legacyExport = "userNamedLegacy";
			const renamedPlanId = `${planId}_renamed`;
			writeFileSync(
				versionPath,
				version
					.replaceAll(v1Export, legacyExport)
					.replace(`planId: "${planId}"`, `planId: "${renamedPlanId}"`),
				"utf8",
			);
			renameSync(versionPath, legacyPath);
			writeFileSync(
				rootPath,
				root
					.replaceAll(v1Export, legacyExport)
					.replace(`./planVersions/${planId}`, "./planVersions/legacy")
					.replaceAll(`planId: "${planId}"`, `planId: "${renamedPlanId}"`),
				"utf8",
			);

			await scenario.client.update({
				plans: [
					{
						plan_id: planId,
						versioning: "new_version",
						active: true,
						name: "Pro v3",
						price: { amount: 69, interval: "month" },
					},
				],
			});
			runCli({
				cwd: freshDirectory,
				args: ["pull"],
				secretKey: scenario.secretKey,
				baseUrl: scenario.baseUrl,
			});

			const finalRoot = readFileSync(rootPath, "utf8");
			const finalLegacy = readFileSync(legacyPath, "utf8");
			expect(existsSync(versionPath)).toBe(false);
			expect(finalRoot).toContain("./planVersions/legacy");
			expect(finalLegacy).toContain(`export const ${legacyExport} = plan({`);
			expect(finalLegacy).toContain(`planId: "${planId}"`);
			expect(finalLegacy).not.toContain(`planId: "${renamedPlanId}"`);
			expect(finalLegacy).toContain('versionSlug: "v2"');
		} finally {
			rmSync(freshDirectory, { recursive: true, force: true });
			scenario.cleanup();
		}
	},
);
