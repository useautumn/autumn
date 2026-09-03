/**
 * productToPlanProcessors / priceConfigToPriceProcessors — GET echo mappers.
 *
 * Contract:
 *   plan processor.id → processors.stripe.product_id
 *   prepaid V2 id wins over V1 for price_id
 *   omit the object when no stripe price id is set
 *
 * Red (current): mappers do not exist
 * Green (after): mapping table above
 */

import { describe, expect, test } from "bun:test";
import {
	priceConfigToPriceProcessors,
	productToPlanProcessors,
} from "@autumn/shared";

describe("productToPlanProcessors", () => {
	test("maps processor id and additional ids", () => {
		expect(
			productToPlanProcessors({
				product: {
					processor: {
						type: "stripe",
						id: "prod_abc",
						additional_ids: ["prod_alias"],
					},
				},
			}),
		).toEqual({
			stripe: {
				product_id: "prod_abc",
				additional_product_ids: ["prod_alias"],
			},
		});
	});

	test("omits when processor is missing", () => {
		expect(
			productToPlanProcessors({ product: { processor: null } }),
		).toBeUndefined();
		expect(
			productToPlanProcessors({
				product: { processor: { type: "stripe", id: "" } },
			}),
		).toBeUndefined();
	});
});

describe("priceConfigToPriceProcessors", () => {
	test("prepaid V2 id wins over V1", () => {
		expect(
			priceConfigToPriceProcessors({
				config: {
					stripe_product_id: "prod_price",
					stripe_price_id: "price_v1",
					stripe_prepaid_price_v2_id: "price_v2",
				},
			}),
		).toEqual({
			stripe: { price_id: "price_v2" },
		});
	});

	test("falls back to stripe_price_id when V2 is unset", () => {
		expect(
			priceConfigToPriceProcessors({
				config: { stripe_price_id: "price_v1" },
			}),
		).toEqual({
			stripe: { price_id: "price_v1" },
		});
	});

	test("omits when no stripe price id is set", () => {
		expect(priceConfigToPriceProcessors({ config: {} })).toBeUndefined();
		expect(priceConfigToPriceProcessors({ config: null })).toBeUndefined();
		expect(
			priceConfigToPriceProcessors({
				config: { stripe_product_id: "prod_price" },
			}),
		).toBeUndefined();
	});
});
