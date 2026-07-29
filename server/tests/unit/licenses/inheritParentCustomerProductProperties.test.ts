import { expect, test } from "bun:test";
import {
	CusProductStatus,
	type FullCusProduct,
	inheritParentCustomerProductProperties,
} from "@autumn/shared";

const makeCustomerProduct = (
	overrides: Partial<FullCusProduct>,
): FullCusProduct =>
	({
		id: "cp",
		status: CusProductStatus.Active,
		subscription_ids: [],
		canceled_at: null,
		parent_customer_license: null,
		parent_customer_product: null,
		...overrides,
	}) as FullCusProduct;

const makePool = () =>
	({
		id: "cus_lic_1",
		link_id: "link_1",
		parent_customer_product_id: "parent",
	}) as FullCusProduct["parent_customer_license"];

test("seat mirrors the parent lifecycle snapshot", () => {
	const seat = makeCustomerProduct({
		id: "seat",
		parent_customer_license: makePool(),
		parent_customer_product: {
			status: CusProductStatus.Expired,
			subscription_ids: ["sub_1"],
			canceled_at: 123,
		},
	});

	inheritParentCustomerProductProperties({ customerProducts: [seat] });

	expect(seat.status).toBe(CusProductStatus.Expired);
	expect(seat.subscription_ids).toEqual(["sub_1"]);
	expect(seat.canceled_at).toBe(123);
});

test("seat without a snapshot is left untouched", () => {
	const seat = makeCustomerProduct({
		id: "seat",
		parent_customer_license: makePool(),
	});

	inheritParentCustomerProductProperties({ customerProducts: [seat] });

	expect(seat.status).toBe(CusProductStatus.Active);
	expect(seat.canceled_at).toBeNull();
});

test("non-seat rows ignore any stray snapshot", () => {
	const regular = makeCustomerProduct({
		id: "regular",
		canceled_at: 5,
		parent_customer_product: {
			status: CusProductStatus.Expired,
			subscription_ids: [],
			canceled_at: null,
		},
	});

	inheritParentCustomerProductProperties({ customerProducts: [regular] });

	expect(regular.status).toBe(CusProductStatus.Active);
	expect(regular.canceled_at).toBe(5);
});
