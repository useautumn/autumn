import type { FullCustomer, ProductV2 } from "@autumn/shared";
import {
	isProductAlreadyEnabled,
	isProductCurrentlyAttached,
} from "@autumn/shared";
import { useCallback } from "react";
import {
	getProductGroupKey,
	getUsedProductGroupKeys,
} from "@/components/forms/shared/utils/planGroupUtils";
import { type AttachForm, EMPTY_ADDITIONAL_PLAN } from "../attachFormSchema";
import type { UseAttachForm } from "./useAttachForm";

export interface UseAttachAdditionalPlansReturn {
	isMultiPlan: boolean;
	hasInvalidPlanScopes: boolean;
	selectedProductIds: string[];
	usedGroupKeys: Set<string>;
	additionalPlanGroupKeys: Set<string>;
	canSelectMultipleScopes: boolean;
	canAddPlan: boolean;
	handleAddPlan: () => void;
	handleRemovePlan: (params: { id: string }) => void;
	handleChangePlanProduct: (params: { id: string; productId: string }) => void;
}

const resolvePlanEntityId = ({
	planEntityId,
	requestEntityId,
}: {
	planEntityId?: string | null;
	requestEntityId?: string;
}) => {
	if (planEntityId === null) return undefined;
	return planEntityId ?? requestEntityId;
};

export function hasInvalidAttachPlanScopes({
	productId,
	additionalPlans,
	products,
	customer,
	entityId,
}: Pick<AttachForm, "productId" | "additionalPlans"> & {
	products: ProductV2[];
	customer: FullCustomer | null;
	entityId?: string;
}) {
	const selectedPlans = productId ? [{ productId, entityId }] : [];
	for (const plan of additionalPlans) {
		if (!plan.productId) continue;
		selectedPlans.push({
			productId: plan.productId,
			entityId: resolvePlanEntityId({
				planEntityId: plan.entityId,
				requestEntityId: entityId,
			}),
		});
	}
	const scopeGroupKeys = new Set<string>();

	for (const plan of selectedPlans) {
		const scopeGroupKey = JSON.stringify([
			plan.entityId ?? null,
			getProductGroupKey({ productId: plan.productId, products }),
		]);
		if (scopeGroupKeys.has(scopeGroupKey)) return true;
		scopeGroupKeys.add(scopeGroupKey);

		if (
			customer &&
			isProductAlreadyEnabled({
				productId: plan.productId,
				customer,
				entityId: plan.entityId,
			})
		) {
			return true;
		}
	}

	return false;
}

export function getAttachProductOptionState({
	product,
	products,
	customer,
	entityId,
	usedGroupKeys,
	allowScopeSelection = false,
}: {
	product: ProductV2;
	products: ProductV2[];
	customer: FullCustomer | null;
	entityId?: string;
	usedGroupKeys: Set<string>;
	allowScopeSelection?: boolean;
}) {
	const groupSelected = usedGroupKeys.has(
		getProductGroupKey({ productId: product.id, products }),
	);
	const alreadyEnabled = customer
		? isProductAlreadyEnabled({
				productId: product.id,
				customer,
				entityId,
			})
		: false;
	const currentlyAttached = Boolean(
		customer &&
			!alreadyEnabled &&
			isProductCurrentlyAttached({
				productId: product.id,
				customer,
				entityId,
			}),
	);
	const requiresDifferentScope = alreadyEnabled || groupSelected;
	let disabledValue: string | undefined;
	if (!allowScopeSelection) {
		if (alreadyEnabled) disabledValue = "Already Enabled";
		if (!disabledValue && groupSelected) {
			disabledValue = "Plan group selected";
		}
	}

	const badgeValue =
		!allowScopeSelection && currentlyAttached
			? "Already Enabled"
			: undefined;

	return {
		disabledValue,
		badgeValue,
		requiresDifferentScope,
	};
}

export function useAttachAdditionalPlans({
	form,
	formValues,
	products,
	customer,
	entityId,
	enabled = false,
}: {
	form: UseAttachForm;
	formValues: AttachForm;
	products: ProductV2[];
	customer: FullCustomer | null;
	entityId?: string;
	enabled?: boolean;
}): UseAttachAdditionalPlansReturn {
	const { productId, additionalPlans } = formValues;

	const additionalProductIds = additionalPlans.flatMap((plan) =>
		plan.productId ? [plan.productId] : [],
	);
	const selectedProductIds = productId
		? [productId, ...additionalProductIds]
		: additionalProductIds;
	const usedGroupKeys = getUsedProductGroupKeys({
		productIds: selectedProductIds,
		products,
	});
	const additionalPlanGroupKeys = getUsedProductGroupKeys({
		productIds: additionalProductIds,
		products,
	});
	const canSelectMultipleScopes =
		enabled && Boolean(customer?.entities?.length);

	const activeProducts = products.filter((product) => !product.archived);
	const hasPendingEmptyPlan = additionalPlans.some((plan) => !plan.productId);
	const isMultiPlan = enabled && additionalPlans.some((plan) => plan.productId);
	const hasInvalidPlanScopes =
		isMultiPlan &&
		hasInvalidAttachPlanScopes({
			productId,
			additionalPlans,
			products,
			customer,
			entityId,
		});
	const canAddPlan =
		enabled &&
		!!productId &&
		!hasPendingEmptyPlan &&
		activeProducts.some(
			(product) =>
				!getAttachProductOptionState({
					product,
					products,
					customer,
					entityId,
					usedGroupKeys,
					allowScopeSelection: canSelectMultipleScopes,
				}).disabledValue,
		);

	const handleAddPlan = useCallback(() => {
		if (!canAddPlan) return;

		form.pushFieldValue("additionalPlans", {
			...EMPTY_ADDITIONAL_PLAN,
			_id: crypto.randomUUID(),
		});
	}, [canAddPlan, form]);

	const indexOfPlan = useCallback(
		({ id }: { id: string }) =>
			form.store.state.values.additionalPlans.findIndex(
				(plan) => plan._id === id,
			),
		[form],
	);

	const handleRemovePlan = useCallback(
		({ id }: { id: string }) => {
			const index = indexOfPlan({ id });
			if (index === -1) return;
			form.removeFieldValue("additionalPlans", index);
		},
		[form, indexOfPlan],
	);

	const handleChangePlanProduct = useCallback(
		({ id, productId: nextProductId }: { id: string; productId: string }) => {
			const index = indexOfPlan({ id });
			if (index === -1) return;
			const nextProduct = products.find(
				(product) => product.id === nextProductId && !product.archived,
			);
			if (!enabled || !nextProduct) return;

			const currentProductId = form.store.state.values.productId;
			const selectedIds = [
				...(currentProductId ? [currentProductId] : []),
				...form.store.state.values.additionalPlans.flatMap((plan) =>
					plan._id !== id && plan.productId ? [plan.productId] : [],
				),
			];
			const selectedGroupKeys = getUsedProductGroupKeys({
				productIds: selectedIds,
				products,
			});
			const optionState = getAttachProductOptionState({
				product: nextProduct,
				products,
				customer,
				entityId,
				usedGroupKeys: selectedGroupKeys,
				allowScopeSelection: canSelectMultipleScopes,
			});
			if (optionState.disabledValue) return;

			form.setFieldValue(`additionalPlans[${index}]`, {
				...EMPTY_ADDITIONAL_PLAN,
				_id: id,
				productId: nextProductId,
			});
		},
		[
			canSelectMultipleScopes,
			customer,
			enabled,
			entityId,
			form,
			indexOfPlan,
			products,
		],
	);

	return {
		isMultiPlan,
		hasInvalidPlanScopes,
		selectedProductIds,
		usedGroupKeys,
		additionalPlanGroupKeys,
		canSelectMultipleScopes,
		canAddPlan,
		handleAddPlan,
		handleRemovePlan,
		handleChangePlanProduct,
	};
}
