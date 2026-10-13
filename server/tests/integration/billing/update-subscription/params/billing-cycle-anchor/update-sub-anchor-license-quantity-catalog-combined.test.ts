import { test } from "bun:test";
import {
	type AnchorLicenseQuantityVariant,
	expectAnchorLicenseQuantity,
} from "./anchorLicenseQuantityCase.js";

const cases: AnchorLicenseQuantityVariant[] = [
	{ name: "license-catalog", seats: 3, nextSeats: 5, catalog: true },
	{ name: "combined", seats: 3, nextSeats: 5, nextPrepaid: 500 },
];
for (const variant of cases) {
	test.concurrent(`anchor quantities: ${variant.name}`, () =>
		expectAnchorLicenseQuantity(variant),
	);
}
