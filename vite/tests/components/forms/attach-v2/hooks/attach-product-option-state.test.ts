import { expect, test } from "bun:test";
import type { ProductV2 } from "@autumn/shared";
import {
	getAttachProductOptionState,
	hasInvalidAttachPlanScopes,
} from "@/components/forms/attach-v2/hooks/useAttachAdditionalPlans";
import { getUsedProductGroupKeys } from "@/components/forms/shared/utils/planGroupUtils";

const product = ({ id, name }: { id: string; name: string }) =>
	({
		id,
		name,
		group: null,
		is_add_on: false,
		items: [],
	}) as ProductV2;

const growth = product({ id: "growth", name: "Growth" });
const pro = product({ id: "pro", name: "Pro" });
const products = [growth, pro];
const usedGroupKeys = getUsedProductGroupKeys({
	productIds: [growth.id],
	products,
});

test("same-group plans remain selectable when another scope is available", () => {
	expect(
		getAttachProductOptionState({
			product: pro,
			products,
			customer: null,
			usedGroupKeys,
			allowScopeSelection: true,
		}),
	).toMatchObject({
		disabledValue: undefined,
		badgeValue: undefined,
		requiresDifferentScope: true,
	});
});

test("same-group plans remain blocked without another scope", () => {
	expect(
		getAttachProductOptionState({
			product: pro,
			products,
			customer: null,
			usedGroupKeys,
		}),
	).toMatchObject({
		disabledValue: "Plan group selected",
		requiresDifferentScope: true,
	});
});

test("same-group plans require different resolved scopes", () => {
	const additionalPlan = {
		_id: "additional",
		productId: pro.id,
		prepaidOptions: {},
		items: null,
		isCustom: false,
	};

	expect(
		hasInvalidAttachPlanScopes({
			productId: growth.id,
			additionalPlans: [additionalPlan],
			products,
			customer: null,
		}),
	).toBe(true);
	expect(
		hasInvalidAttachPlanScopes({
			productId: growth.id,
			additionalPlans: [{ ...additionalPlan, entityId: "entity-a" }],
			products,
			customer: null,
		}),
	).toBe(false);
});
