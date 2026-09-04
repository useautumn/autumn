/**
 * atmn scenarios/push — fuzz-max config → one request, backfill covers every created row
 *
 * One line of plans/atmn-v3/07_tests.md. Built from baseConfigs rather than the
 * fuzzer — `bun run fuzz` stays a coverage report, not a test (07_tests.md).
 */

import { expect, test } from "bun:test";
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
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";

const internalIdCount = ({ files }: { files: Map<string, string> }): number => {
	let count = 0;
	for (const text of files.values()) count += text.split("internalId:").length - 1;
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
		let previewCalls = 0;
		let updateCalls = 0;
		const previewUpdate = scenario.client.previewUpdate.bind(scenario.client);
		const update = scenario.client.update.bind(scenario.client);
		scenario.client.previewUpdate = (async (...args: Parameters<typeof previewUpdate>) => {
			previewCalls += 1;
			return previewUpdate(...args);
		}) as typeof scenario.client.previewUpdate;
		scenario.client.update = (async (...args: Parameters<typeof update>) => {
			updateCalls += 1;
			return update(...args);
		}) as typeof scenario.client.update;

		await scenario.push();

		// One preview, one apply — the whole batch travels as a single request,
		// never one round trip per created row.
		expect(previewCalls).toBe(1);
		expect(updateCalls).toBe(1);

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
