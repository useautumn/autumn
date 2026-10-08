import { test } from "bun:test";
import {
	type AnchorQuantityVariant,
	expectAnchorQuantityReset,
} from "./anchorQuantityResetCase.js";

const cases: AnchorQuantityVariant[] = [
	{ name: "decrease", old: 500, next: 300 },
];
for (const variant of cases) {
	test.concurrent(`anchor quantities: ${variant.name}`, () =>
		expectAnchorQuantityReset(variant),
	);
}
