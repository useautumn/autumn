import { describe, expect, test } from "bun:test";
import { formatVolumeTierRule } from "./formatVolumeTierRule";

describe("formatVolumeTierRule", () => {
	test("with no included usage there is no threshold", () => {
		expect(
			formatVolumeTierRule({ includedUsage: 0, pricing: "per_unit" }),
		).toBe("volume: all units at the reached tier's rate");
		expect(
			formatVolumeTierRule({ includedUsage: null, pricing: "per_unit" }),
		).toBe("volume: all units at the reached tier's rate");
	});

	test("with included usage it names the threshold", () => {
		expect(
			formatVolumeTierRule({ includedUsage: 1000, pricing: "per_unit" }),
		).toBe("volume: past 1,000, all units at the reached tier's rate");
	});

	test("flat and mixed pricing name the flat fee", () => {
		expect(
			formatVolumeTierRule({ includedUsage: 100, pricing: "flat_fee" }),
		).toBe("volume: past 100, the reached tier's flat fee");
		expect(
			formatVolumeTierRule({
				includedUsage: 0,
				pricing: "per_unit_and_flat_fee",
			}),
		).toBe("volume: all units at the reached tier's rate plus its flat fee");
	});
});
