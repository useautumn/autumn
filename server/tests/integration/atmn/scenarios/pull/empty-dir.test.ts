/**
 * atmn scenarios/pull — empty dir → scaffold root + `planVersions/.gitkeep`; second pull is a no-op
 *
 * One line of plans/atmn-v3/07_tests.md. [a, b] is a matrix looped INSIDE this file.
 */

import { expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";
import {
	configBody,
	everyFeatureType,
	freePlan,
} from "@tests/utils/atmnUtils/baseConfigs.js";
import {
	initAtmnScenario,
	scenarioDir,
} from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";
import { runPull } from "../../../../../../packages/atmn-nightly/src/actions/pull";

test.concurrent(
	"empty dir → scaffold root + collection files; second pull is a no-op",
	async () => {
		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
			],
			config: configBody({ features: everyFeatureType, plans: freePlan }),
		});

		const emptyDir = scenarioDir({ id: uniqueTestId("atmn_empty_dir") });

		try {
			await scenario.push();

			let firstOutput = "";
			const first = await runPull({
				client: scenario.client,
				cwd: emptyDir,
				configPath: emptyDir,
				write: (text) => {
					firstOutput += text;
				},
			});
			expect(firstOutput).toContain("Scaffolded");
			for (const file of ["features.ts", "plans.ts", "rewards.ts"])
				expect(existsSync(join(emptyDir, file))).toBe(true);
			expect(existsSync(join(emptyDir, "planVersions"))).toBe(false);
			expect(first.appended).toContain("free@v1");
			// Rows land in the collection file; the root only imports.
			expect(readFileSync(join(emptyDir, "plans.ts"), "utf8")).toContain(
				'planId: "free"',
			);
			expect(
				readFileSync(join(emptyDir, "autumn.config.ts"), "utf8"),
			).not.toContain("plan(");

			let secondOutput = "";
			const second = await runPull({
				client: scenario.client,
				cwd: emptyDir,
				configPath: emptyDir,
				write: (text) => {
					secondOutput += text;
				},
			});
			expect(secondOutput).toBe("Nothing to pull.\n");
			expect(second).toEqual({
				configPath: first.configPath,
				appended: [],
				replaced: [],
				deleted: [],
			});
		} finally {
			scenario.cleanup();
		}
	},
);
