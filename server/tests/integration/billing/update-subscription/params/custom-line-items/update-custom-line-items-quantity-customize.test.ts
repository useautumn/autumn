import { test } from "bun:test";
import { expectCustomLineItemsUpdate } from "./utils/customLineItemsCase.js";

for (const mode of ["quantity", "customize"] as const) {
	test.concurrent(`update custom line items: ${mode}`, () =>
		expectCustomLineItemsUpdate(mode),
	);
}
