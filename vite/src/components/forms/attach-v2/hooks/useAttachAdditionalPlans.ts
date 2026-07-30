import type { FullCustomer, ProductV2 } from "@autumn/shared";
import {
	isProductAlreadyEnabled,
	isProductCurrentlyAttached,
} from "@autumn/shared";
import { useCallback } from "react";
import { getProductGroupKey } from "@/components/forms/shared/utils/planGroupUtils";
import { resolvePlanEntityId } from "@/components/forms/shared/utils/resolvePlanEntityId";
import { type AttachForm, EMPTY_ADDITIONAL_PLAN } from "../attachFormSchema";
import type { UseAttachForm } from "./useAttachForm";

export interface UseAttachAdditionalPlansReturn {
	isMultiPlan: boolean;
	hasInvalidPlanScopes: boolean;
	selectedPlanCount: number;
	canAddPlan: boolean;
	getProductOptionState: (params: {
		product: ProductV2;
		planId?: string;
		entityId?: string;
	}) => AttachProductOptionState;
	handleAddPlan: () => void;
	handleRemovePlan: (params: { id: string }) => void;
	handleChangePlanProduct: (params: { id: string; productId: string }) => void;
}

type AttachPlanSelection = {
	id?: string;
	productId: string;
	entityId?: string;
};

type AttachProductOptionState = {
	disabledValue: string | undefined;
	badgeValue: string | undefined;
	requiresDifferentScope: boolean;
};

const getAttachPlanSelections = ({
	productId,
	additionalPlans,
	entityId,
}: Pick<AttachForm, "productId" | "additionalPlans"> & {
	entityId?: string;
}): AttachPlanSelection[] => [
	...(productId ? [{ productId, entityId }] : []),
	...additionalPlans.flatMap((plan) =>
		plan.productId
			? [
					{
						id: plan._id,
						productId: plan.productId,
						entityId: resolvePlanEntityId({
							planEntityId: plan.entityId,
							defaultEntityId: entityId,
						}),
					},
				]
			: [],
	),
];

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
	const selectedPlans = getAttachPlanSelections({
		productId,
		additionalPlans,
		entityId,
	});
	const productsById = new Map(products.map((product) => [product.id, product]));

	for (const [index, plan] of selectedPlans.entries()) {
		const product = productsById.get(plan.productId);
		if (!product) return true;
		const optionState = getAttachProductOptionState({
			product,
			products,
			customer,
			entityId: plan.entityId,
			selectedPlans: selectedPlans.slice(0, index),
		});
		if (optionState.disabledValue) return true;
	}

	return false;
}

export function getAttachProductOptionState({
	product,
	products,
	customer,
	entityId,
	selectedPlans,
	allowScopeSelection = false,
}: {
	product: ProductV2;
	products: ProductV2[];
	customer: FullCustomer | null;
	entityId?: string;
	selectedPlans: AttachPlanSelection[];
	allowScopeSelection?: boolean;
}): AttachProductOptionState {
	const productGroupKey = getProductGroupKey({
		productId: product.id,
		products,
	});
	const groupSelected = selectedPlans.some(
		(plan) =>
			plan.entityId === entityId &&
			getProductGroupKey({ productId: plan.productId, products }) ===
				productGroupKey,
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
		!allowScopeSelection && currentlyAttached ? "Already Enabled" : undefined;

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

	const canSelectMultipleScopes =
		enabled && Boolean(customer?.entities?.length);
	const selectedPlans = getAttachPlanSelections({
		productId,
		additionalPlans,
		entityId,
	});
	const getProductOptionState = ({
		product,
		planId,
		entityId: planEntityId,
	}: {
		product: ProductV2;
		planId?: string;
		entityId?: string;
	}) =>
		getAttachProductOptionState({
			product,
			products,
			customer,
			entityId: planEntityId,
			selectedPlans: selectedPlans.filter((plan) =>
				planId === undefined ? plan.id !== undefined : plan.id !== planId,
			),
			allowScopeSelection: canSelectMultipleScopes,
		});

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
			(product) => !getProductOptionState({ product, entityId }).disabledValue,
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

			const currentValues = form.store.state.values;
			const optionState = getAttachProductOptionState({
				product: nextProduct,
				products,
				customer,
				entityId,
				selectedPlans: getAttachPlanSelections({
					productId: currentValues.productId,
					additionalPlans: currentValues.additionalPlans,
					entityId,
				}).filter((plan) => plan.id !== id),
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
		selectedPlanCount: selectedPlans.length,
		canAddPlan,
		getProductOptionState,
		handleAddPlan,
		handleRemovePlan,
		handleChangePlanProduct,
	};
}
