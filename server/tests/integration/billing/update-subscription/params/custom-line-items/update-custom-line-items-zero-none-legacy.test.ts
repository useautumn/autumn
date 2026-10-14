import { test } from "bun:test";
import { expectCustomLineItemsUpdate } from "./utils/customLineItemsCase.js";

for (const mode of ["zero", "none", "legacy"] as const) {
	test.concurrent(`update custom line items: ${mode}`, () =>
		expectCustomLineItemsUpdate(mode),
	);
}
