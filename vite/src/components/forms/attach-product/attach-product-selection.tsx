import { PencilSimpleIcon } from "@phosphor-icons/react";
import { useEffect } from "react";
import { useNavigate } from "react-router";
import { IconButton } from "@/components/v2/buttons/IconButton";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { useHasChanges } from "@/hooks/stores/useProductStore";
import { useAttachProductStore } from "@/hooks/stores/useSubscriptionStore";
import { pushPage } from "@/utils/genUtils";
import type { UseAttachProductForm } from "./use-attach-product-form";

interface AttachProductSelectionProps {
	form: UseAttachProductForm;
	customerId: string;
}

export function AttachProductSelection({
	form,
	customerId,
}: AttachProductSelectionProps) {
	const { products } = useProductsQuery();
	const activeProducts = products.filter((p) => !p.archived);
	const navigate = useNavigate();
	const setCustomizedProduct = useAttachProductStore(
		(s) => s.setCustomizedProduct,
	);
	const productId = form.state.values.productId;
	const customizedProduct = useAttachProductStore((s) => s.customizedProduct);
	const hasChanges = useHasChanges();

	//reset customized product to prevent any stale edited products (from SubscriptionDetailSheet)
	useEffect(() => {
		// Only reset if productId is not undefined/null (meaning user changed it)
		if (productId !== undefined && customizedProduct?.id !== productId) {
			setCustomizedProduct(null);
		}
	}, [productId, setCustomizedProduct]);

	const handleCustomize = ({ productId }: { productId: string }) => {
		if (!productId || !customerId) {
			return;
		}

		pushPage({
			path: `/customers/${customerId}/${productId}`,
			navigate,
		});
	};

	return (
		<div className="space-y-4">
			<div className="grid grid-cols-[1fr_auto] gap-2">
				<form.AppField name="productId">
					{(field) => (
						<field.SelectField
							label=""
							options={activeProducts.map((p) => ({
								label: p.name,
								value: p.id,
							}))}
							placeholder="Select Product"
							hideFieldInfo
							selectValueAfter={
								hasChanges && productId ? (
									<span className="text-xs bg-green-500/10 text-green-500 px-1 py-0 rounded-md">
										Custom
									</span>
								) : undefined
							}
						/>
					)}
				</form.AppField>

				<div className="flex items-center gap-2">
					<form.Subscribe selector={(state) => state.values.productId}>
						{(productId) => (
							<IconButton
								size="sm"
								variant="secondary"
								className="size-6 disabled:pointer-events-none disabled:opacity-50 w-fit"
								icon={<PencilSimpleIcon />}
								onClick={() => handleCustomize({ productId })}
								disabled={!productId}
								type="button"
							>
								Customize
							</IconButton>
						)}
					</form.Subscribe>
				</div>
			</div>
		</div>
	);
}
