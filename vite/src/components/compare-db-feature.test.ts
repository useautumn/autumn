import { expect, test } from "bun:test";
import {
	type CreateFeature,
	type CreditSchemaItem,
	FeatureType,
	Infinite,
} from "@autumn/shared";
import { compareDbFeature } from "./compareDbFeature";

const creditSystem = ({
	schema,
	invoiceCredit = false,
}: {
	schema: CreditSchemaItem[];
	invoiceCredit?: boolean;
}) =>
	({
		id: "credits",
		name: "Credits",
		type: FeatureType.CreditSystem,
		config: { schema, invoice_credit: invoiceCredit },
		event_names: [],
	}) as CreateFeature;

const flat = ({
	featureId,
	billingUnits = 1,
	creditCost = 1,
}: {
	featureId: string;
	billingUnits?: number;
	creditCost?: number;
}): CreditSchemaItem => ({
	metered_feature_id: featureId,
	feature_amount: billingUnits,
	credit_amount: creditCost,
});

test("rate-card comparison is order independent without mutating either schema", () => {
	const currentSchema = [
		flat({ featureId: "tokens" }),
		flat({ featureId: "requests", billingUnits: 100 }),
	];
	const nextSchema = [...currentSchema].reverse();
	const currentOrder = currentSchema.map((item) => item.metered_feature_id);
	const nextOrder = nextSchema.map((item) => item.metered_feature_id);

	expect(
		compareDbFeature({
			curFeature: creditSystem({ schema: currentSchema }),
			newFeature: creditSystem({ schema: nextSchema }),
		}),
	).toBe(true);
	expect(currentSchema.map((item) => item.metered_feature_id)).toEqual(
		currentOrder,
	);
	expect(nextSchema.map((item) => item.metered_feature_id)).toEqual(nextOrder);
});

test("rate-card comparison detects billing-unit and item-count changes", () => {
	expect(
		compareDbFeature({
			curFeature: creditSystem({
				schema: [flat({ featureId: "tokens", billingUnits: 1 })],
			}),
			newFeature: creditSystem({
				schema: [flat({ featureId: "tokens", billingUnits: 100 })],
			}),
		}),
	).toBe(false);

	expect(
		compareDbFeature({
			curFeature: creditSystem({ schema: [flat({ featureId: "tokens" })] }),
			newFeature: creditSystem({ schema: [] }),
		}),
	).toBe(false);
});

test("rate-card comparison detects graduated tiers and invoice-credit changes", () => {
	const graduated: CreditSchemaItem = {
		metered_feature_id: "tokens",
		feature_amount: 100,
		tier_behavior: "graduated",
		tiers: [
			{ to: 10_000, credit_amount: 1 },
			{ to: Infinite, credit_amount: 0.5 },
		],
	};
	const changedTier: CreditSchemaItem = {
		...graduated,
		tiers: [
			{ to: 20_000, credit_amount: 1 },
			{ to: Infinite, credit_amount: 0.5 },
		],
	};

	expect(
		compareDbFeature({
			curFeature: creditSystem({ schema: [graduated] }),
			newFeature: creditSystem({ schema: [changedTier] }),
		}),
	).toBe(false);

	expect(
		compareDbFeature({
			curFeature: creditSystem({ schema: [graduated] }),
			newFeature: creditSystem({
				schema: [graduated],
				invoiceCredit: true,
			}),
		}),
	).toBe(false);
});

test("detects stripe product changes and treats empty as unset", () => {
	expect(
		compareDbFeature({
			curFeature: { ...creditSystem({ schema: [] }), stripe_product_id: null },
			newFeature: { ...creditSystem({ schema: [] }), stripe_product_id: "" },
		}),
	).toBe(true);

	expect(
		compareDbFeature({
			curFeature: {
				...creditSystem({ schema: [] }),
				stripe_product_id: "prod_123",
			},
			newFeature: {
				...creditSystem({ schema: [] }),
				stripe_product_id: "prod_456",
			},
		}),
	).toBe(false);
});
