import { test } from "bun:test";
import {
	type AnchorLicenseQuantityVariant,
	expectAnchorLicenseQuantity,
} from "./anchorLicenseQuantityCase.js";

const cases: AnchorLicenseQuantityVariant[] = [
	{ name: "license-none", seats: 3, nextSeats: 5, none: true },
	{
		name: "license-none-catalog",
		seats: 3,
		nextSeats: 5,
		none: true,
		catalog: true,
	},
];
for (const variant of cases) {
	test.concurrent(`anchor quantities: ${variant.name}`, () =>
		expectAnchorLicenseQuantity(variant),
	);
}
