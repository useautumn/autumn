import { test } from "bun:test";
import {
	type AnchorLicenseQuantityVariant,
	expectAnchorLicenseQuantity,
} from "./anchorLicenseQuantityCase.js";

const cases: AnchorLicenseQuantityVariant[] = [
	{ name: "license-increase", seats: 3, nextSeats: 5 },
	{ name: "license-decrease", seats: 5, nextSeats: 3 },
];
for (const variant of cases) {
	test.concurrent(`anchor quantities: ${variant.name}`, () =>
		expectAnchorLicenseQuantity(variant),
	);
}
