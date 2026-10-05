import { test } from "bun:test";
import {
	type AnchorQuantityVariant,
	expectAnchorQuantityReset,
} from "./anchorQuantityResetCase.js";

const cases: AnchorQuantityVariant[] = [
	{ name: "volume", old: 300, next: 800, volume: true },
	{ name: "none-increase", old: 300, next: 500, none: true },
	{
		name: "none-deferred-decrease",
		old: 500,
		next: 300,
		deferred: true,
		none: true,
	},
];
for (const variant of cases) {
	test.concurrent(`anchor quantities: ${variant.name}`, () =>
		expectAnchorQuantityReset(variant),
	);
}
