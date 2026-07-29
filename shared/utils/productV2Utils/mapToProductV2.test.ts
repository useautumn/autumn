import { expect, test } from "bun:test";
import { mapToProductItems } from "./mapToProductV2.js";

// Legacy/customized products may omit relational arrays; mapping must remain total.
test("mapToProductItems normalizes missing product relations", () => {
	expect(
		mapToProductItems({
			prices: undefined as never,
			entitlements: undefined as never,
			features: [],
		}),
	).toEqual([]);
});
