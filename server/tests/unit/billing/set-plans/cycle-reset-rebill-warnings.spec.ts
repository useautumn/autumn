import { describe, expect, test } from "bun:test";
import type { Entity, FullCusProduct, LineItem } from "@autumn/shared";
import { cycleResetRebillWarnings } from "@/internal/billing/v2/actions/setPlans/preview/cycleResetRebillWarnings";
import { makeFullCusProduct } from "../billing-change-response/helpers/makeFullCusProduct";

const entity = ({ id, name }: { id: string; name: string | null }) =>
	({ id, name, internal_id: `internal_${id}` }) as Entity;

const livePlan = ({
	planId,
	name = planId,
	entityId,
}: {
	planId: string;
	name?: string;
	entityId?: string;
}): FullCusProduct => {
	const customerProduct = makeFullCusProduct({ planId });
	return {
		...customerProduct,
		id: `cp_${planId}_${entityId ?? "customer"}`,
		internal_entity_id: entityId ? `internal_${entityId}` : null,
		entity_id: entityId ?? null,
		product: { ...customerProduct.product, name },
	};
};

const lineItem = ({
	customerProduct,
	direction = "charge",
	billingTiming = "in_advance",
	lineEntity,
}: {
	customerProduct: FullCusProduct;
	direction?: "charge" | "refund";
	billingTiming?: "in_advance" | "in_arrear";
	lineEntity?: Entity;
}) =>
	({
		amount: direction === "charge" ? 20 : -13.55,
		context: {
			direction,
			billingTiming,
			product: customerProduct.product,
			entity: lineEntity,
			customerProduct,
		},
	}) as unknown as LineItem;

const seat1 = entity({ id: "ent-1", name: "Seat 1" });
const seat2 = entity({ id: "ent-2", name: "Seat 2" });
const proSeat1 = livePlan({ planId: "pro", name: "Pro", entityId: "ent-1" });
const proSeat2 = livePlan({ planId: "pro", name: "Pro", entityId: "ent-2" });
const wordsAddOn = livePlan({ planId: "words", name: "Words add-on" });
const premiumSeat1 = livePlan({
	planId: "premium",
	name: "Premium",
	entityId: "ent-1",
});

const resetSwitchingSeat1 = [
	lineItem({
		customerProduct: proSeat1,
		direction: "refund",
		lineEntity: seat1,
	}),
	lineItem({ customerProduct: premiumSeat1, lineEntity: seat1 }),
	lineItem({
		customerProduct: proSeat2,
		direction: "refund",
		lineEntity: seat2,
	}),
	lineItem({ customerProduct: proSeat2, lineEntity: seat2 }),
	lineItem({ customerProduct: wordsAddOn, direction: "refund" }),
	lineItem({ customerProduct: wordsAddOn }),
	lineItem({ customerProduct: wordsAddOn, billingTiming: "in_arrear" }),
];

describe("cycleResetRebillWarnings", () => {
	test("names every plan the reset re-bills without the request changing it", () => {
		const warnings = cycleResetRebillWarnings({
			resetsCycleNow: true,
			lineItems: resetSwitchingSeat1,
			liveCustomerProducts: [proSeat1, proSeat2, wordsAddOn],
		});

		expect(warnings).toEqual([
			{
				type: "cycle_reset_rebills_plans",
				message:
					"Resetting the billing cycle also re-bills Pro (Seat 2) and Words add-on, prorated, as Stripe does.",
				parts: [
					{ text: "Resetting the billing cycle also re-bills" },
					{ text: "Pro (Seat 2)", bold: true },
					{ text: "and" },
					{ text: "Words add-on", bold: true },
					{ text: ", prorated, as Stripe does.", attach: true },
				],
			},
		]);
	});

	test("a kept plan recreated by the reset counts as re-billed", () => {
		const recreatedProSeat1 = { ...proSeat1, id: "cp_pro_recreated" };
		const [warning] = cycleResetRebillWarnings({
			resetsCycleNow: true,
			lineItems: [
				lineItem({
					customerProduct: proSeat1,
					direction: "refund",
					lineEntity: seat1,
				}),
				lineItem({ customerProduct: recreatedProSeat1, lineEntity: seat1 }),
			],
			liveCustomerProducts: [proSeat1],
		});

		expect(warning?.message).toBe(
			"Resetting the billing cycle also re-bills Pro (Seat 1), prorated, as Stripe does.",
		);
	});

	test("lists three or more plans with commas", () => {
		const [warning] = cycleResetRebillWarnings({
			resetsCycleNow: true,
			lineItems: [
				lineItem({ customerProduct: proSeat1, lineEntity: seat1 }),
				lineItem({ customerProduct: proSeat2, lineEntity: seat2 }),
				lineItem({ customerProduct: wordsAddOn }),
			],
			liveCustomerProducts: [proSeat1, proSeat2, wordsAddOn],
		});

		expect(warning?.message).toBe(
			"Resetting the billing cycle also re-bills Pro (Seat 1), Pro (Seat 2) and Words add-on, prorated, as Stripe does.",
		);
	});

	test("an entity without a name is shown by its id", () => {
		const [warning] = cycleResetRebillWarnings({
			resetsCycleNow: true,
			lineItems: [
				lineItem({
					customerProduct: proSeat2,
					lineEntity: entity({ id: "ent-2", name: null }),
				}),
			],
			liveCustomerProducts: [proSeat2],
		});

		expect(warning?.message).toBe(
			"Resetting the billing cycle also re-bills Pro (ent-2), prorated, as Stripe does.",
		);
	});

	test("no warning unless the cycle resets now and an unchanged plan is charged", () => {
		expect(
			cycleResetRebillWarnings({
				resetsCycleNow: false,
				lineItems: resetSwitchingSeat1,
				liveCustomerProducts: [proSeat1, proSeat2, wordsAddOn],
			}),
		).toEqual([]);
		expect(
			cycleResetRebillWarnings({
				resetsCycleNow: true,
				lineItems: [
					lineItem({
						customerProduct: proSeat1,
						direction: "refund",
						lineEntity: seat1,
					}),
					lineItem({ customerProduct: premiumSeat1, lineEntity: seat1 }),
				],
				liveCustomerProducts: [proSeat1, proSeat2],
			}),
		).toEqual([]);
	});
});
