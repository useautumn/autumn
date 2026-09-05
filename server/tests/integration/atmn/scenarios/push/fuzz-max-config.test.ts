/**
 * atmn scenarios/push — fuzz-max config → one request, backfill covers every created row
 *
 * One line of plans/atmn-v3/07_tests.md. Built from baseConfigs rather than the
 * fuzzer — `bun run fuzz` stays a coverage report, not a test (07_tests.md).
 */

import { expect, test } from "bun:test";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";
import {
	configBody,
	enterpriseWithSeats,
	everyFeatureType,
	freePlan,
	seatPlan,
	versionedPro,
} from "@tests/utils/atmnUtils/baseConfigs.js";
import { initAtmnScenario } from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";

const internalIdCount = ({ files }: { files: Map<string, string> }): number => {
	let count = 0;
	for (const text of files.values())
		count += text.split("internalId:").length - 1;
	return count;
};

test("fuzz-max config → one request, backfill covers every created row", async () => {
	// Every feature type, plus free/paid/versioned-with-everything/licensed
	// plans — every builder baseConfigs exports, in one config.
	const scenario = await initAtmnScenario({
		setup: [
			s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
		],
		config: configBody({
			features: everyFeatureType,
			plans: `${freePlan}${versionedPro()}${seatPlan}${enterpriseWithSeats()}`,
		}),
	});

	try {
		const result = await scenario.push();

		// The CLI runs in its own process, so its output is the evidence: one
		// preview rendered, one apply — never a round trip per created row.
		expect(result.output.match(/^Features \(\d+\)$/gm)).toHaveLength(1);
		expect(result.output.match(/^Plans \(\d+\)$/gm)).toHaveLength(1);
		expect(result.output.match(/^Applied\.$/gm)).toHaveLength(1);

		// 7 features (everyFeatureType) + 4 plans (free, pro, seat, enterprise):
		// every one of them lacked an internalId in the source, so backfill must
		// have written exactly that many in.
		expect(internalIdCount({ files: scenario.files() })).toBe(11);

		const catalog = (await scenario.client.get({})) as unknown as {
			features: Array<{ id: string }>;
			plans: Array<{ id: string }>;
		};
		expect(catalog.features.length).toBeGreaterThanOrEqual(7);
		for (const planId of ["free", "pro", "seat", "enterprise"]) {
			expect(catalog.plans.some((row) => row.id === planId)).toBe(true);
		}
	} finally {
		scenario.cleanup();
	}
});
