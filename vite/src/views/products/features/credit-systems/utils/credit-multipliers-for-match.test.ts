import { expect, test } from "bun:test";
import {
	applyCreditMultipliers,
	creditMultipliersForMatch,
} from "@autumn/shared";

const multipliers = {
	lifecycle_spot: { match: { lifecycle: "spot" }, factor: 0.3 },
	region_eu: { match: { region: "eu" }, add: 2 },
};

test("a spot multiplier still applies to a dimension that pins spot", () => {
	const applied = creditMultipliersForMatch({
		multipliers,
		match: { size: "large", lifecycle: "spot" },
	});
	expect(applied).toHaveLength(1);
	expect(applyCreditMultipliers({ amount: 12, multipliers: applied })).toBe(
		3.6,
	);
});

test("a multiplier on a property the row does not pin is not shown", () => {
	expect(
		creditMultipliersForMatch({ multipliers, match: { size: "large" } }),
	).toHaveLength(0);
});

test("factors multiply then adds sum", () => {
	const applied = creditMultipliersForMatch({
		multipliers,
		match: { lifecycle: "spot", region: "eu" },
	});
	expect(applied).toHaveLength(2);
	expect(applyCreditMultipliers({ amount: 10, multipliers: applied })).toBe(5);
});
