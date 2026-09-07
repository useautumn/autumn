import { expect, test } from "bun:test";
import {
	type CreditSchemaItem,
	findAmbiguousCreditDimensions,
} from "@autumn/shared";
import {
	rateRules,
	savedRulesFrom,
	toRateRows,
	withRatePriority,
	withRateRules,
} from "./creditDimensionUtils";

/** Two rules with one match key each: neither is more specific, so they clash. */
const clashing: CreditSchemaItem = {
	metered_feature_id: "cpu_minutes",
	credit_amount: 1,
	dimensions: {
		size_big: { match: { size: "big" }, credit_amount: 10 },
		region_eu: { match: { region: "eu" }, credit_amount: 20 },
	},
};

const preferFirstRow = (item: CreditSchemaItem) => {
	const rows = toRateRows({ rules: rateRules(item), drafts: [] });
	const [first, ...rest] = rows;
	return withRateRules({
		item,
		rules: savedRulesFrom([
			withRatePriority({ row: first, priority: 1 }),
			...rest,
		]),
	});
};

test("a priority resolves the clash and survives the save", () => {
	expect(findAmbiguousCreditDimensions(clashing.dimensions ?? {})).toHaveLength(
		1,
	);

	const saved = preferFirstRow(clashing);

	expect(findAmbiguousCreditDimensions(saved.dimensions ?? {})).toHaveLength(0);
	expect(
		Object.values(saved.dimensions ?? {}).filter(
			(dimension) => dimension.priority === 1,
		),
	).toHaveLength(1);
});

test("clearing a priority drops the field and brings the clash back", () => {
	const saved = preferFirstRow(clashing);
	const rows = toRateRows({ rules: rateRules(saved), drafts: [] });
	const preferred = rows.find((row) => row.dimension?.priority !== undefined);
	if (!preferred) throw new Error("expected a preferred row");

	const cleared = withRateRules({
		item: saved,
		rules: savedRulesFrom(
			rows.map((row) =>
				row === preferred
					? withRatePriority({ row, priority: undefined })
					: row,
			),
		),
	});

	for (const dimension of Object.values(cleared.dimensions ?? {})) {
		expect(dimension).not.toHaveProperty("priority");
	}
	expect(findAmbiguousCreditDimensions(cleared.dimensions ?? {})).toHaveLength(
		1,
	);
});
