import { test } from "bun:test";
import { expectScheduledPooledQuantity } from "./scheduledPooledQuantityCase.js";

for (const quantity of [300]) {
	test.concurrent(`scheduled pooled quantity: ${quantity}`, () =>
		expectScheduledPooledQuantity(quantity),
	);
}
