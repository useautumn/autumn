import { test } from "bun:test";
import {
	expectScheduledAnchorQuantities,
	type ScheduledAnchorQuantityVariant,
} from "./anchorScheduledQuantityCase.js";

const cases: ScheduledAnchorQuantityVariant[] = [
	{ name: "combined", prepaid: true, license: true, deferred: false },
	{ name: "deferred", prepaid: true, license: false, deferred: true },
];
for (const variant of cases) {
	test.concurrent(`scheduled anchor quantities: ${variant.name}`, () =>
		expectScheduledAnchorQuantities(variant),
	);
}
