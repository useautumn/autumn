import { CreateProductSchema, type ProductV2 } from "@autumn/shared";
import { ClockIcon, PlusIcon, SquareIcon } from "@phosphor-icons/react";
import type { AxiosError } from "axios";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/v2/buttons/Button";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { ProductService } from "@/services/products/ProductService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import { useProductContext } from "@/views/products/product/ProductContext";
import { ManagePlan } from "../../products/plan/components/ManagePlan";
import { PlanSheets } from "../../products/plan/PlanEditorView";

interface OnboardingPlaygroundProps {
	onProductCreated?: () => void;
}

type PlaygroundSheets = "edit-plan" | "edit-feature" | "new-feature" | null;

export const OnboardingPlayground = ({
	onProductCreated,
}: OnboardingPlaygroundProps) => {
	const { product, setProduct, setEditingState } = useProductContext();
	const axiosInstance = useAxiosInstance();
	const { refetch: refetchProducts } = useProductsQuery();
	const [hasCreatedProduct, setHasCreatedProduct] = useState(false);
	const [isCreating, setIsCreating] = useState(false);
	const [sheet, setSheet] = useState<PlaygroundSheets>(null);
	const [showPlayground, setShowPlayground] = useState(false);

	// Create the product when entering this step
	useEffect(() => {
		const createProduct = async () => {
			if (!product || hasCreatedProduct || isCreating) return;

			setIsCreating(true);
			try {
				const result = CreateProductSchema.safeParse({
					name: product.name,
					id: product.id,
					description: product.description,
					items: product.items || [],
				});

				if (result.error) {
					console.error("Product validation error:", result.error);
					toast.error("Invalid product data");
					return;
				}

				const createdProduct = await ProductService.createProduct(
					axiosInstance,
					result.data,
				);

				// Update the product with the created product data (includes internal_id, etc.)
				setProduct(createdProduct.data as ProductV2);

				toast.success(`Product "${product.name}" created successfully!`);
				setHasCreatedProduct(true);
				await refetchProducts();
				onProductCreated?.();
			} catch (error: unknown) {
				console.error("Failed to create product:", error);
				toast.error(
					getBackendErr(error as AxiosError, "Failed to create product"),
				);
			} finally {
				setIsCreating(false);
			}
		};

		createProduct();
	}, [
		product,
		axiosInstance,
		hasCreatedProduct,
		isCreating,
		refetchProducts,
		onProductCreated,
		setProduct,
	]);

	const handlePreviewPlans = () => {
		setShowPlayground(!showPlayground);
	};

	const handleAddPlan = () => {
		setEditingState({ type: "plan", id: null });
		setSheet("edit-plan");
		setShowPlayground(true);
	};

	const handleEditCurrentPlan = () => {
		setEditingState({ type: "plan", id: product?.id || null });
		setSheet("edit-plan");
		setShowPlayground(true);
	};

	if (showPlayground) {
		return (
			<div className="h-full w-full flex">
				{/* Main playground area - reuse ManagePlan component */}
				<div className="flex-1 h-full">
					<div className="p-4 border-b bg-white">
						<div className="flex items-center justify-between">
							<h3 className="text-lg font-medium">Plan Playground</h3>
							<Button
								variant="secondary"
								onClick={() => setShowPlayground(false)}
								size="sm"
							>
								← Back to Setup
							</Button>
						</div>
					</div>
					<div className="h-[calc(100%-80px)]">
						<ManagePlan />
					</div>
				</div>

				{/* Sheets sidebar - reuse from PlanEditorView */}
				{sheet && (
					<div className="w-full min-w-xs max-w-md bg-card z-50 border-l shadow-sm flex flex-col overflow-y-auto h-full">
						<PlanSheets
							sheet={sheet as "edit-plan" | "edit-feature" | "new-feature"}
						/>
					</div>
				)}
			</div>
		);
	}

	return (
		<div className="p-4 space-y-4">
			{/* Status Display */}
			{isCreating ? (
				<div className="text-center text-gray-500 p-4 bg-blue-50 rounded-lg">
					Creating your product...
				</div>
			) : hasCreatedProduct ? (
				<div className="text-center text-green-600 p-4 bg-green-50 rounded-lg">
					✅ Product "{product?.name}" has been created successfully!
				</div>
			) : null}

			{/* Action Buttons */}
			<div className="space-y-2">
				<Button
					variant="secondary"
					onClick={handlePreviewPlans}
					disabled={!hasCreatedProduct}
					className="w-full justify-start"
				>
					<SquareIcon className="w-4 h-4 mr-2" />
					Preview Plans
				</Button>

				<div className="flex gap-2">
					<Button
						variant="secondary"
						onClick={handleEditCurrentPlan}
						disabled={!hasCreatedProduct}
						className="flex-1 justify-start"
					>
						<ClockIcon className="w-4 h-4 mr-2" />
						{product?.name || "Pro Plan"}
					</Button>

					<Button
						variant="secondary"
						onClick={handleAddPlan}
						disabled={!hasCreatedProduct}
						className="flex-1 justify-start"
					>
						<PlusIcon className="w-4 h-4 mr-2" />
						Add Plan
					</Button>
				</div>
			</div>

			{/* Instructions */}
			<div className="text-sm text-gray-500 text-center p-4 bg-gray-50 rounded-lg">
				Use this space to experiment and create additional plans or features.
				This is your sandbox environment where you can manage your plans just
				like in the main interface.
			</div>
		</div>
	);
};
