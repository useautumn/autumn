import { describe, expect, test } from "bun:test";
import {
	buildMiscellaneousJsonText,
	getStatusMessage,
	MISCELLANEOUS_DEFAULT_CONFIG,
} from "./miscellaneousEdgeConfigTypes";

describe("Miscellaneous edge config admin defaults", () => {
	test("keeps Axiom response-body reduction enabled by default", () => {
		expect(MISCELLANEOUS_DEFAULT_CONFIG.axiomResponseBodyReduction).toBe(true);
		expect(
			JSON.parse(
				buildMiscellaneousJsonText({
					config: MISCELLANEOUS_DEFAULT_CONFIG,
				}),
			),
		).toMatchObject({ axiomResponseBodyReduction: true });
	});

	test("describes missing S3 config as using defaults", () => {
		expect(
			getStatusMessage({ config: MISCELLANEOUS_DEFAULT_CONFIG }),
		).toContain("defaults shown below apply");
	});
});
