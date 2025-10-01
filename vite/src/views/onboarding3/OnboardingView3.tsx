import { useQuery } from "@tanstack/react-query";
import { ArrowLeftIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { IconButton } from "@/components/v2/buttons/IconButton";
import { OnboardingSteps } from "@/components/v2/onboarding/OnboardingSteps";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/v2/selects/Select";
import { SheetHeader } from "@/components/v2/sheets/InlineSheet";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useEnv } from "@/utils/envUtils";
import { navigateTo } from "@/utils/genUtils";
import { ProductContext } from "@/views/products/product/ProductContext";
import { SaveChangesBar } from "../products/plan/components/SaveChangesBar";
import { usePlanData } from "../products/plan/hooks/usePlanData";
import CreatePlanDialog from "../products/products/components/CreatePlanDialog";
import { OnboardingStepRenderer } from "./components/OnboardingStepRenderer";
import { useOnboardingActions } from "./hooks/useOnboardingActions";
import { useOnboardingState } from "./hooks/useOnboardingState";
import { useOnboardingSteps } from "./hooks/useOnboardingSteps";
import { OnboardingPreview } from "./OnboardingPreview";
import {
	getNextStep,
	getStepNumber,
	OnboardingStep,
} from "./utils/OnboardingStep";

export default function OnboardingContent() {
	const navigate = useNavigate();
	const env = useEnv();
	const axiosInstance = useAxiosInstance();
	const { refetch } = useFeaturesQuery();
	const { products, refetch: refetchProducts } = useProductsQuery();

	const {
		baseProduct,
		setBaseProduct: originalSetBaseProduct,
		feature,
		setFeature,
		productCreatedRef,
		featureCreatedRef,
	} = useOnboardingState();

	// Wrap setBaseProduct to log changes
	const setBaseProduct = (newProduct: any) => {
		console.log("[OnboardingView3] setBaseProduct called with:", {
			id: newProduct?.id,
			items: newProduct?.items?.length || 0,
		});
		originalSetBaseProduct(newProduct);
	};

	// HYBRID APPROACH: Use React Query when we have a product ID (Steps 2-4)
	const hasProductId = Boolean(baseProduct?.id && baseProduct.id !== "");

	const productQueryFetcher = async () => {
		if (!hasProductId) return null;
		const response = await axiosInstance.get(
			`/products/${baseProduct.id}/data2`,
		);
		return response.data;
	};

	const { data: queryData, refetch: refetchProduct } = useQuery({
		queryKey: ["onboarding-product", baseProduct?.id],
		queryFn: productQueryFetcher,
		enabled: hasProductId,
	});

	// Choose data source: React Query (Steps 2-4) or custom state (Step 1)
	const originalProduct = hasProductId ? queryData?.product : baseProduct;

	console.log("[OnboardingView3] Data source:", {
		hasProductId,
		usingQuery: hasProductId,
		originalProductId: originalProduct?.id,
		baseProductId: baseProduct?.id,
	});

	const { product, setProduct, diff } = usePlanData({
		originalProduct,
	});

	const { step, pushStep, popStep, validateStep } = useOnboardingSteps();
	const { createProduct, createFeature, createProductItem } =
		useOnboardingActions({
			axiosInstance,
			productCreatedRef,
			featureCreatedRef,
		});

	const [sheet, setSheet] = useState<string | null>(null);
	const [editingState, setEditingState] = useState<{
		type: "plan" | "feature" | null;
		id: string | null;
	}>({ type: null, id: null });
	const [selectedProductId, setSelectedProductId] = useState<string>("");

	useMemo(() => {
		if (product?.id && selectedProductId !== product.id) {
			setSelectedProductId(product.id);
		}
	}, [product?.id, selectedProductId]);

	// Main navigation handler
	const handleNext = async () => {
		if (!validateStep(step, product, feature)) return;

		const nextStep = getNextStep(step);

		// Step 1→2: Create product
		if (step === OnboardingStep.PlanDetails) {
			const createdProduct = await createProduct(product);
			if (!createdProduct) return;
			setBaseProduct(createdProduct);
		}

		// Step 2→3: Create feature, ProductItem, and add to product immediately
		if (step === OnboardingStep.FeatureCreation) {
			const createdFeature = await createFeature(feature);
			if (!createdFeature) return;

			await refetch(); // Refresh features list

			// Create ProductItem and add to product immediately for live editing
			const newItem = createProductItem(createdFeature);
			setFeature(createdFeature);

			// Add or update item in product
			if (product && "items" in product) {
				const existingItems = product.items || [];

				// Check if we already have a feature item (from previous forward navigation)
				const hasFeatureItem = existingItems.length > 0;

				if (hasFeatureItem) {
					// Update existing item's feature_id to match the updated feature
					setProduct({
						...product,
						items: existingItems.map((item, index) =>
							index === existingItems.length - 1
								? { ...item, feature_id: createdFeature.id }
								: item,
						),
					});
				} else {
					// First time: add new item
					setProduct({
						...product,
						items: [...existingItems, newItem],
					});
				}
			}
		}

		// Step 3→4: Just set up playground view
		if (
			step === OnboardingStep.FeatureConfiguration &&
			nextStep === OnboardingStep.Playground
		) {
			setSheet("edit-plan");
			setEditingState({ type: "plan", id: null });
		}

		if (nextStep) {
			pushStep(nextStep);
		} else {
			// Finish onboarding
			navigateTo("/products", navigate, env);
		}
	};

	const handleBack = () => {
		setSheet(null);
		setEditingState({ type: null, id: null });
		popStep();
	};

	const handlePlanSelect = async (planId: string) => {
		if (!planId || planId === selectedProductId) return;

		try {
			const response = await axiosInstance.get(`/products/${planId}/data2`);
			const productData = response.data.product;

			setBaseProduct(productData);
			setSelectedProductId(planId);

			setSheet("edit-plan");
			setEditingState({ type: "plan", id: null });
		} catch (error) {
			console.error("Failed to load selected plan:", error);
			setSelectedProductId(product?.id || "");
		}
	};

	// Get step header based on current step
	const getStepHeader = (currentStep: OnboardingStep) => {
		const stepNum = getStepNumber(currentStep);
		switch (currentStep) {
			case OnboardingStep.PlanDetails:
				return (
					<SheetHeader
						title={`Step ${stepNum}: Create your first plan`}
						description="Think of products like pricing plans that can have a price or be free (eg. Starter plans). They include features that customers on this plan get access to."
						noSeparator={true}
						className="p-0"
					/>
				);
			case OnboardingStep.FeatureCreation:
				return (
					<SheetHeader
						title={`Step ${stepNum}: Create your first feature`}
						description="Create and add the first feature that customers on this plan get access to. One feature for each part of your app you want to gate based on pricing."
						noSeparator={true}
						className="p-0"
					/>
				);
			case OnboardingStep.FeatureConfiguration:
				return (
					<SheetHeader
						title={`Step ${stepNum}: Configure your feature`}
						description="Set up pricing and usage details for your feature"
						noSeparator={true}
						className="p-0"
					/>
				);
			case OnboardingStep.Playground:
				return (
					<div>
						<SheetHeader
							title={`Step ${stepNum}: Finish your setup`}
							description="Review and save your plan when ready"
							noSeparator={true}
							className="p-0"
						/>
						<div className="mt-3 grid grid-cols-2 gap-2 p-0">
							<Select
								value={selectedProductId}
								onValueChange={handlePlanSelect}
							>
								<SelectTrigger>
									<SelectValue placeholder="Select plan" />
								</SelectTrigger>
								<SelectContent>
									{products.map((prod) => (
										<SelectItem key={prod.id} value={prod.id}>
											{prod.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<CreatePlanDialog
								onSuccess={async (newProduct) => {
									try {
										const response = await axiosInstance.get(
											`/products/${newProduct.id}/data2`,
										);
										const productData = response.data.product;

										setBaseProduct(productData);
										setSelectedProductId(newProduct.id);

										setSheet("edit-plan");
										setEditingState({ type: "plan", id: null });

										await refetchProducts();
									} catch (error) {
										console.error("Failed to load new plan:", error);
										navigateTo(`/products/${newProduct.id}`, navigate, env);
									}
								}}
							/>
						</div>
					</div>
				);
			case OnboardingStep.Completion:
				return (
					<SheetHeader
						title={`Step ${stepNum}: Complete!`}
						description="Your plan has been created successfully"
						noSeparator={true}
						className="p-2"
					/>
				);
			default:
				return null;
		}
	};

	// Create a unified refetch function for SaveChangesBar
	const handleRefetch = async () => {
		if (hasProductId) {
			// Use React Query refetch for Steps 2-4
			await refetchProduct();
		} else {
			// For Step 1, fetch the complete product manually
			if (product?.id) {
				try {
					const response = await axiosInstance.get(
						`/products/${product.id}/data2`,
					);
					setBaseProduct(response.data.product);
				} catch (error) {
					console.error("Failed to refetch product:", error);
				}
			}
		}
	};

	return (
		<ProductContext.Provider
			value={{
				setShowNewVersionDialog: () => {},
				product,
				setProduct,
				entityFeatureIds: [],
				setEntityFeatureIds: () => {},
				diff,
				sheet,
				setSheet,
				editingState,
				setEditingState,
				refetch: handleRefetch,
			}}
		>
			<div className="relative w-full h-full flex bg-[#EEEEEE]">
				{/* Exit button */}
				<div className="absolute top-4 left-4 z-10">
					<IconButton
						variant="skeleton"
						size="sm"
						onClick={() => navigateTo("/products", navigate, env)}
						icon={<ArrowLeftIcon className="size-4" />}
					>
						Exit to Dashboard
					</IconButton>
				</div>

				<div className="w-4/5 flex items-center justify-center relative">
					<OnboardingPreview currentStep={getStepNumber(step)} />

					{/* SaveChangesBar as overlay to prevent layout shift */}
					{(step === OnboardingStep.FeatureConfiguration ||
						step === OnboardingStep.Playground) && (
						<div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-10">
							<SaveChangesBar
								isOnboarding={true}
								originalProduct={baseProduct as any}
								setOriginalProduct={setBaseProduct}
							/>
						</div>
					)}
				</div>

				<div className="w-[45%] h-full flex flex-col p-4">
					<div className="rounded-lg h-full flex flex-col p-1">
						<div className="bg-card border-[#D1D1D1] border-[1px] rounded-[12px] shadow-sm flex flex-col p-4">
							<div className="flex items-center justify-center mb-2">
								<OnboardingSteps
									totalSteps={5}
									currentStep={getStepNumber(step)}
									nextText={
										step === OnboardingStep.Completion ? "Finish" : "Next"
									}
									onNext={handleNext}
									onBack={handleBack}
									backDisabled={step === OnboardingStep.PlanDetails}
									nextDisabled={!validateStep(step, product, feature)}
								/>
							</div>
							<div className="flex-1 p-0">{getStepHeader(step)}</div>
						</div>

						<div className="bg-card border-[#D1D1D1] border-[1px] rounded-[12px] shadow-sm h-full mt-1 overflow-y-auto p-0">
							<OnboardingStepRenderer
								step={step}
								feature={feature}
								setFeature={setFeature}
							/>
						</div>
					</div>
				</div>
			</div>
		</ProductContext.Provider>
	);
}
