import { describe, expect, test } from "bun:test";
import type { FeatureOptions } from "../../../../models/cusProductModels/cusProductModels.js";
import { featureOptionsAreSame } from "./featureOptionsAreSame.js";

const options = (
	overrides: Partial<FeatureOptions> & { feature_id: string },
): FeatureOptions => ({
	internal_feature_id: `internal_${overrides.feature_id}`,
	quantity: 0,
	...overrides,
});

describe("featureOptionsAreSame", () => {
	test("ignores ordering", () => {
		const seats = options({ feature_id: "seats", quantity: 3 });
		const messages = options({ feature_id: "messages", quantity: 10 });

		expect(
			featureOptionsAreSame({
				curFeatureOptions: [seats, messages],
				newFeatureOptions: [messages, seats],
			}),
		).toBe(true);
	});

	test("detects a changed quantity", () => {
		expect(
			featureOptionsAreSame({
				curFeatureOptions: [options({ feature_id: "seats", quantity: 3 })],
				newFeatureOptions: [options({ feature_id: "seats", quantity: 4 })],
			}),
		).toBe(false);
	});

	test("detects a removed feature", () => {
		expect(
			featureOptionsAreSame({
				curFeatureOptions: [
					options({ feature_id: "seats", quantity: 3 }),
					options({ feature_id: "messages", quantity: 10 }),
				],
				newFeatureOptions: [options({ feature_id: "seats", quantity: 3 })],
			}),
		).toBe(false);
	});

	test("matches on internal_feature_id when feature_id differs", () => {
		expect(
			featureOptionsAreSame({
				curFeatureOptions: [
					{ feature_id: "seats", internal_feature_id: "if_1", quantity: 3 },
				],
				newFeatureOptions: [
					{ feature_id: "renamed", internal_feature_id: "if_1", quantity: 3 },
				],
			}),
		).toBe(true);
	});

	test("two empty sets are the same", () => {
		expect(
			featureOptionsAreSame({ curFeatureOptions: [], newFeatureOptions: [] }),
		).toBe(true);
	});
});
