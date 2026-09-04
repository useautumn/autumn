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
	TMP_ROOT,
} from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";
import { runPull } from "../../../../../../packages/atmn-nightly/src/actions/pull";

test.concurrent(
	"empty dir → scaffold root + `planVersions/.gitkeep`; second pull is a no-op",
	async () => {
		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
			],
			config: configBody({ features: everyFeatureType, plans: freePlan }),
		});

		const emptyDir = join(TMP_ROOT, uniqueTestId("atmn_empty_dir"));
		mkdirSync(emptyDir, { recursive: true });

		try {
			await scenario.push();

			let firstOutput = "";
			const first = await runPull({
				client: scenario.client,
				cwd: emptyDir,
				write: (text) => {
					firstOutput += text;
				},
			});
			expect(firstOutput).toContain("Scaffolded");
			expect(existsSync(join(emptyDir, "planVersions", ".gitkeep"))).toBe(true);
			expect(first.appended).toContain("free");
			expect(
				readFileSync(join(emptyDir, "autumn.config.ts"), "utf8"),
			).toContain('planId: "free"');

			let secondOutput = "";
			const second = await runPull({
				client: scenario.client,
				cwd: emptyDir,
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
