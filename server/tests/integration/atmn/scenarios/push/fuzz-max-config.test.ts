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

		expect(result.output.match(/^Features \(\d+\)$/gm)).toHaveLength(1);
		expect(result.output.match(/^Plans \(\d+\)$/gm)).toHaveLength(1);
		expect(result.output.match(/^Applied\.$/gm)).toHaveLength(1);

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
