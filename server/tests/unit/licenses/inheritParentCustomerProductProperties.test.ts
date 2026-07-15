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
		...overrides,
	}) as FullCusProduct;

const makePool = (parentCustomerProductId: string) =>
	({
		id: "cus_lic_1",
		link_id: "link_1",
		parent_customer_product_id: parentCustomerProductId,
	}) as FullCusProduct["parent_customer_license"];

test("seat mirrors parent status, subscription_ids, canceled_at", () => {
	const parent = makeCustomerProduct({
		id: "parent",
		status: CusProductStatus.Expired,
		subscription_ids: ["sub_1"],
		canceled_at: 123,
	});
	const seat = makeCustomerProduct({
		id: "seat",
		parent_customer_license: makePool("parent"),
	});

	inheritParentCustomerProductProperties({ customerProducts: [parent, seat] });

	expect(seat.status).toBe(CusProductStatus.Expired);
	expect(seat.subscription_ids).toEqual(["sub_1"]);
	expect(seat.canceled_at).toBe(123);
	expect(parent.status).toBe(CusProductStatus.Expired);
});

test("seat with absent parent is left untouched", () => {
	const seat = makeCustomerProduct({
		id: "seat",
		parent_customer_license: makePool("gone-parent"),
	});

	inheritParentCustomerProductProperties({ customerProducts: [seat] });

	expect(seat.status).toBe(CusProductStatus.Active);
	expect(seat.canceled_at).toBeNull();
});

test("non-seat rows are untouched", () => {
	const regular = makeCustomerProduct({ id: "regular", canceled_at: 5 });

	inheritParentCustomerProductProperties({ customerProducts: [regular] });

	expect(regular.canceled_at).toBe(5);
});
