/**
 * atmn scenarios/lint — restoring a plan on an archived feature is refused by lint
 *
 * One line of plans/atmn-v3/07_tests.md.
 */

import { expect, test } from "bun:test";
import { join } from "node:path";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";
import { initAtmnScenario } from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";

const CLI_PACKAGE_DIR = join(
	import.meta.dir,
	"../../../../../../packages/atmn-nightly",
);

const configSource = ({ body }: { body: string }): string =>
	`import { feature } from "${CLI_PACKAGE_DIR}/src/generated/features";
import { plan } from "${CLI_PACKAGE_DIR}/src/generated/plans";
import { atmn } from "${CLI_PACKAGE_DIR}/src/generated/wire";

export default atmn(${body});
`;

test("restoring a plan on an archived feature is refused by lint", async () => {
	const featureId = uniqueTestId("atmn_lint_archived");
	const planId = uniqueTestId("atmn_lint_archived_plan");

	const scenario = await initAtmnScenario({
		setup: [
			s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
		],
		config: {
			raw: configSource({
				body: `{
	features: [
		feature({ featureId: "${featureId}", name: "Seats", type: "boolean", archived: true }),
	],
	plans: [
		plan({
			planId: "${planId}",
			name: "Plan",
			items: [{ featureId: "${featureId}" }],
		}),
	],
}`,
			}),
		},
	});

	try {
		await expect(scenario.push()).rejects.toThrow(
			`Feature "${featureId}" is archived. Unarchive it, or archive plan "${planId}".`,
		);

		// Nothing was ever sent: the org's catalog stays empty.
		const catalog = (await scenario.client.get({})) as unknown as {
			features: Array<{ id: string }>;
			plans: Array<{ id: string }>;
		};
		expect(catalog.plans.some((row) => row.id === planId)).toBe(false);
	} finally {
		scenario.cleanup();
	}
});
