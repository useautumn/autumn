import { test } from "bun:test";
import { expectCustomLineItemsUpdate } from "./utils/customLineItemsCase.js";

// Custom-line modes share one contract runner; see utils/customLineItemsCase.ts.
for (const mode of ["zero", "none", "legacy"] as const) {
	test.concurrent(`update custom line items: ${mode}`, () =>
		expectCustomLineItemsUpdate(mode),
	);
}
