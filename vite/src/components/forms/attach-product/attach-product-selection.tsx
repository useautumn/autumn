import { PencilSimpleIcon } from "@phosphor-icons/react";
import { useNavigate } from "react-router";
import { IconButton } from "@/components/v2/buttons/IconButton";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
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

	const handleCustomize = ({ productId }: { productId: string }) => {
		if (!productId || !customerId) {
			return;
		}

		pushPage({
			path: `/customers/${customerId}/${productId}`,
			queryParams: {
				returnTo: "attach-product",
			},
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
