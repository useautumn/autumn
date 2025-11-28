import { PencilSimpleIcon } from "@phosphor-icons/react";
import { useStore } from "@tanstack/react-form";
import { useNavigate } from "react-router";
import { IconButton } from "@/components/v2/buttons/IconButton";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { pushPage } from "@/utils/genUtils";
import { useAttachProductFormContext } from "./attach-product-form-context";

export function AttachProductSelection() {
	const form = useAttachProductFormContext();
	const { customerId, productId } = useStore(
		form.store,
		(state) => state.values,
	);
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
		<div className="grid grid-cols-[1fr_auto] gap-2">
			<form.AppField name="productId">
				{(field) => (
					<field.SelectField
						options={activeProducts.map((p) => ({
							label: p.name,
							value: p.id,
						}))}
						placeholder="Select Product"
						hideFieldInfo
					/>
				)}
			</form.AppField>

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
		</div>
	);
}
