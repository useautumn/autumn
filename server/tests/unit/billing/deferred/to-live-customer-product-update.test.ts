/**
 * When a deferred plan resumes, its "expire the plan being replaced" update must target the
 * customer's current plan, even if that plan was replaced while the payment was pending.
 */

import { expect, test } from "bun:test";
import {
	CusProductStatus,
	type CustomerProductUpdate,
	type FullCusProduct,
} from "@autumn/shared";
import { toLiveCustomerProductUpdate } from "@/internal/billing/v2/execute/refreshDeferredBillingPlan/toLiveAutumnBillingPlan";
import { makeFullCusProduct } from "../billing-change-response/helpers/makeFullCusProduct.js";
import { makeFullCustomer } from "../billing-change-response/helpers/makeFullCustomer.js";

const GROUP = "plans";

const makePlan = ({
	id,
	planId,
	isAddOn = false,
	group = GROUP,
}: {
	id: string;
	planId: string;
	isAddOn?: boolean;
	group?: string;
}): FullCusProduct => {
	const customerProduct = makeFullCusProduct({ id, planId });
	return {
		...customerProduct,
		product: { ...customerProduct.product, group, is_add_on: isAddOn },
	};
};

const premium = makePlan({ id: "cp_premium", planId: "premium" });

const expireUpdate = (
	customerProduct: FullCusProduct,
): CustomerProductUpdate => ({
	customerProduct,
	updates: { status: CusProductStatus.Expired },
});

test("a plan that is still live keeps its update", () => {
	const pro = makePlan({ id: "cp_pro", planId: "pro" });
	const update = expireUpdate(pro);

	const result = toLiveCustomerProductUpdate({
		update,
		fullCustomer: makeFullCustomer({ customerProducts: [pro] }),
		insertCustomerProducts: [premium],
	});

	expect(result).toBe(update);
});

test("a plan replaced by a new row of the same product expires the new row", () => {
	const oldPro = makePlan({ id: "cp_pro_old", planId: "pro" });
	const newPro = makePlan({ id: "cp_pro_new", planId: "pro" });

	const result = toLiveCustomerProductUpdate({
		update: expireUpdate(oldPro),
		fullCustomer: makeFullCustomer({ customerProducts: [newPro] }),
		insertCustomerProducts: [premium],
	});

	expect(result?.customerProduct.id).toBe("cp_pro_new");
});

test("a main plan replaced by another plan in its group expires that plan", () => {
	const pro = makePlan({ id: "cp_pro", planId: "pro" });
	const basic = makePlan({ id: "cp_basic", planId: "basic" });

	const result = toLiveCustomerProductUpdate({
		update: expireUpdate(pro),
		fullCustomer: makeFullCustomer({ customerProducts: [basic] }),
		insertCustomerProducts: [premium],
	});

	expect(result?.customerProduct.id).toBe("cp_basic");
});

test("an add-on that is gone drops its update", () => {
	const addOn = makePlan({ id: "cp_addon", planId: "addon", isAddOn: true });
	const pro = makePlan({ id: "cp_pro", planId: "pro" });

	const result = toLiveCustomerProductUpdate({
		update: expireUpdate(addOn),
		fullCustomer: makeFullCustomer({ customerProducts: [pro] }),
		insertCustomerProducts: [premium],
	});

	expect(result).toBeUndefined();
});

test("a plan named for removal does not expire its group successor", () => {
	const pro = makePlan({ id: "cp_pro", planId: "pro" });
	const basic = makePlan({ id: "cp_basic", planId: "basic" });
	const otherGroupPlan = makePlan({
		id: "cp_other",
		planId: "other",
		group: "other-group",
	});

	const result = toLiveCustomerProductUpdate({
		update: expireUpdate(pro),
		fullCustomer: makeFullCustomer({ customerProducts: [basic] }),
		insertCustomerProducts: [otherGroupPlan],
	});

	expect(result).toBeUndefined();
});
