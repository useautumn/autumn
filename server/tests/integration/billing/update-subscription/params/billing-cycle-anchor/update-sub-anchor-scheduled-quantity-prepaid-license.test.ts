import { test } from "bun:test";
import {
	expectScheduledAnchorQuantities,
	type ScheduledAnchorQuantityVariant,
} from "./anchorScheduledQuantityCase.js";

const cases: ScheduledAnchorQuantityVariant[] = [
	{ name: "prepaid", prepaid: true, license: false, deferred: false },
	{ name: "license", prepaid: false, license: true, deferred: false },
];
for (const variant of cases) {
	test.concurrent(`scheduled anchor quantities: ${variant.name}`, () =>
		expectScheduledAnchorQuantities(variant),
	);
}
