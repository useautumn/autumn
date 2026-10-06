import { test } from "bun:test";
import {
	type AnchorQuantityVariant,
	expectAnchorQuantityReset,
} from "./anchorQuantityResetCase.js";

const cases: AnchorQuantityVariant[] = [
	{ name: "increase", old: 300, next: 500 },
	{ name: "decrease", old: 500, next: 300 },
	{ name: "deferred-decrease", old: 500, next: 300, deferred: true },
];
for (const variant of cases) {
	test.concurrent(`anchor quantities: ${variant.name}`, () =>
		expectAnchorQuantityReset(variant),
	);
}
