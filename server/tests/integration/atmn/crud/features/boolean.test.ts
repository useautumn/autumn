/**
 * atmn crud/features — boolean
 *
 * One line of plans/atmn-v3/07_tests.md. [a, b] is a matrix looped INSIDE this file.
 */

import { expect, test } from "bun:test";
import { configBody } from "@tests/utils/atmnUtils/baseConfigs.js";
import { expectRoundTrip } from "@tests/utils/atmnUtils/expectRoundTrip.js";
import { initAtmnScenario } from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";

const booleanFeatures = `
		feature({ featureId: "sso", name: "SSO", type: "boolean" }),`;

type CatalogFeatureRow = { id: string; type: string; archived: boolean };

test.concurrent("boolean", async () => {
	const scenario = await initAtmnScenario({
		setup: [
			s.platform.create({ userEmail: "atmn_boolean_feature@autumn.test" }),
		],
		config: configBody({ features: booleanFeatures }),
	});

	try {
		await expectRoundTrip({ scenario });

		const catalog = (await scenario.client.get({})) as unknown as {
			features: CatalogFeatureRow[];
		};
		const sso = catalog.features.find((row) => row.id === "sso");
		expect(sso).toEqual(expect.objectContaining({ type: "boolean" }));
	} finally {
		scenario.cleanup();
	}
});
