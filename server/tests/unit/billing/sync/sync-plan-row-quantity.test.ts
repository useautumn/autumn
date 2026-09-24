/**
 * syncPlanRowQuantity
 *
 * An add-on's Stripe quantity is expanded into N rows elsewhere, so each row
 * is ×1. A main plan's Stripe quantity is one row × N.
 */

import { describe, expect, test } from "bun:test";
import type { SyncProductContext } from "@autumn/shared";
import { syncPlanRowQuantity } from "@/internal/billing/v2/actions/sync/utils/syncPlanRowQuantity.js";

const productContext = ({
	isAddOn,
	quantity,
}: {
	isAddOn: boolean;
	quantity?: number;
}) =>
	({
		fullProduct: { is_add_on: isAddOn },
		plan: { plan_id: "pro", quantity },
	}) as unknown as SyncProductContext;

describe("syncPlanRowQuantity", () => {
	test("a main plan carries its Stripe quantity on the row", () => {
		expect(
			syncPlanRowQuantity({
				productContext: productContext({ isAddOn: false, quantity: 2 }),
			}),
		).toBe(2);
	});

	test("a main plan without a quantity is ×1", () => {
		expect(
			syncPlanRowQuantity({
				productContext: productContext({ isAddOn: false }),
			}),
		).toBe(1);
	});

	test("an add-on row is always ×1", () => {
		expect(
			syncPlanRowQuantity({
				productContext: productContext({ isAddOn: true, quantity: 3 }),
			}),
		).toBe(1);
	});
});
