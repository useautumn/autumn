import { test } from "bun:test";
import {
	type AnchorLicenseQuantityVariant,
	expectAnchorLicenseQuantity,
} from "./anchorLicenseQuantityCase.js";

const cases: AnchorLicenseQuantityVariant[] = [
	{
		name: "plan-change-none",
		seats: 3,
		nextSeats: 3,
		none: true,
		planChange: true,
	},
	{
		name: "plan-change-none-catalog",
		seats: 3,
		nextSeats: 3,
		none: true,
		catalog: true,
		planChange: true,
	},
];
for (const variant of cases) {
	test.concurrent(`anchor quantities: ${variant.name}`, () =>
		expectAnchorLicenseQuantity(variant),
	);
}
