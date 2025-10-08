import type { ProductV2 } from "@autumn/shared";
import type { AxiosInstance } from "axios";
import { type MutableRefObject, useCallback } from "react";
import { useNavigate } from "react-router";
import { useEnv } from "@/utils/envUtils";
import {
	handleBackNavigation,
	handleCreatePlanSuccess,
	handlePlanSelection,
	type OnboardingStep,
} from "../../utils/onboardingUtils";

interface SharedActionsProps {
	step: OnboardingStep;
	baseProduct: ProductV2;
	selectedProductId: string;
	product: ProductV2 | null;
	productCreatedRef: MutableRefObject<{
		created: boolean;
		latestId: string | null;
	}>;
	featureCreatedRef: MutableRefObject<{
		created: boolean;
		latestId: string | null;
	}>;
	axiosInstance: AxiosInstance;
	setBaseProduct: (product: ProductV2) => void;
	setProduct: (product: ProductV2) => void;
	setSelectedProductId: (id: string) => void;
	setSheet: (sheet: string | null) => void;
	setEditingState: (state: {
		type: "plan" | "feature" | null;
		id: string | null;
	}) => void;
	popStep: () => void;
	refetchProducts: () => Promise<unknown>;
}

export const useSharedActions = ({
	step,
	baseProduct,
	selectedProductId,
	product,
	productCreatedRef,
	featureCreatedRef,
	axiosInstance,
	setBaseProduct,
	setProduct,
	setSelectedProductId,
	setSheet,
	setEditingState,
	popStep,
	refetchProducts,
}: SharedActionsProps) => {
	const navigate = useNavigate();
	const env = useEnv();

	// Handle plan selection from dropdown
	const handlePlanSelect = useCallback(
		async (planId: string) => {
			try {
				await handlePlanSelection(
					planId,
					selectedProductId,
					baseProduct,
					setBaseProduct,
					setProduct,
					setSelectedProductId,
					setSheet,
					setEditingState,
					axiosInstance,
				);
			} catch (_) {
				setSelectedProductId(product?.id || "");
			}
		},
		[
			selectedProductId,
			baseProduct,
			setBaseProduct,
			setProduct,
			axiosInstance,
			product?.id,
			setSheet,
			setEditingState,
			setSelectedProductId,
		],
	);

	// Handle back navigation
	const handleBack = useCallback(() => {
		setSheet(null);
		setEditingState({ type: null, id: null });

		handleBackNavigation(
			step,
			productCreatedRef,
			featureCreatedRef,
			baseProduct,
			setBaseProduct,
			setSelectedProductId,
		);

		popStep();
	}, [
		step,
		productCreatedRef,
		featureCreatedRef,
		baseProduct,
		setBaseProduct,
		setSelectedProductId,
		popStep,
		setSheet,
		setEditingState,
	]);

	// Handle create plan success from dialog
	const onCreatePlanSuccess = useCallback(
		async (newProduct: ProductV2) => {
			try {
				await handleCreatePlanSuccess(
					newProduct,
					axiosInstance,
					setBaseProduct,
					setSelectedProductId,
					setSheet,
					setEditingState,
					async () => {
						await refetchProducts();
					},
				);
			} catch (error) {
				console.error("Failed to load new plan:", error);
				const { navigateTo } = await import("@/utils/genUtils");
				navigateTo(`/products/${newProduct.id}`, navigate, env);
			}
		},
		[
			axiosInstance,
			setBaseProduct,
			setSelectedProductId,
			setSheet,
			setEditingState,
			refetchProducts,
			navigate,
			env,
		],
	);

	return {
		handlePlanSelect,
		handleBack,
		onCreatePlanSuccess,
	};
};
