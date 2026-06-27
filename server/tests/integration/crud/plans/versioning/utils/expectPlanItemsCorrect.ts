import { expect } from "bun:test";
import {
	type ApiPlanV1,
	ApiPlanV1Schema,
} from "@autumn/shared";

type ApiPlanItem = ApiPlanV1["items"][number];
type PlanItemExpectation = { feature_id: string } & Partial<ApiPlanItem>;
type PlanPriceExpectation = NonNullable<ApiPlanV1["price"]>;

const planItemMatchesExpectation = ({
	item,
	expected,
}: {
	item: ApiPlanItem;
	expected: PlanItemExpectation;
}) => {
	if (item.feature_id !== expected.feature_id) return false;
	if ("reset" in expected) {
		return JSON.stringify(item.reset) === JSON.stringify(expected.reset);
	}
	return true;
};

export const expectPlanItemsCorrect = ({
	plan,
	items,
	exact = false,
}: {
	plan: ApiPlanV1;
	items: PlanItemExpectation[];
	exact?: boolean;
}) => {
	const parsedPlan = ApiPlanV1Schema.parse(plan);

	if (exact) {
		expect(parsedPlan.items).toHaveLength(items.length);
	}

	const matchedIndexes = new Set<number>();
	for (const expected of items) {
		const itemIndex = parsedPlan.items.findIndex(
			(item, index) =>
				!matchedIndexes.has(index) &&
				planItemMatchesExpectation({ item, expected }),
		);

		expect(
			itemIndex,
			`Missing plan item ${JSON.stringify(expected)} in ${JSON.stringify(parsedPlan.items)}`,
		).toBeGreaterThanOrEqual(0);

		matchedIndexes.add(itemIndex);
		expect(parsedPlan.items[itemIndex]).toMatchObject(expected);
	}
};

export const expectPlanPriceCorrect = ({
	plan,
	price,
}: {
	plan: ApiPlanV1;
	price: PlanPriceExpectation | null;
}) => {
	const parsedPlan = ApiPlanV1Schema.parse(plan);

	if (price === null) {
		expect(parsedPlan.price).toBeNull();
		return;
	}

	expect(parsedPlan.price).toMatchObject(price);
};
