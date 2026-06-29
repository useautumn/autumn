import { IconButton } from "@autumn/ui";
import { GitForkIcon } from "lucide-react";
import { useMemo } from "react";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { useProductStore } from "@/hooks/stores/useProductStore";
import { useCreateVariant } from "../hooks/useCreateVariant";
import { CreateVariantDialog } from "./CreateVariantDialog";

export const CreateVariantButton = () => {
	const product = useProductStore((s) => s.product);
	const { products } = useProductsQuery();
	const createVariant = useCreateVariant(product);

	const isVariant = !!product.base_internal_product_id;
	// base_id is only populated on products-list entries, not the store product.
	const hasVariants = useMemo(
		() => products.some((p) => p.base_id === product.id),
		[products, product.id],
	);

	if (isVariant || hasVariants) return null;

	return (
		<>
			<IconButton
				onClick={() => createVariant.setOpen(true)}
				aria-label="Create variant"
				variant="secondary"
				iconOrientation="left"
				icon={<GitForkIcon />}
				size="mini"
			>
				Create variant
			</IconButton>
			{createVariant.open && (
				<CreateVariantDialog {...createVariant.dialogProps} />
			)}
		</>
	);
};
