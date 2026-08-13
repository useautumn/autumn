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

	// base_id lives on the products-list entry, not the store product.
	const { isVariant, hasVariants } = useMemo(() => {
		const current = products.find((p) => p.id === product.id);
		return {
			isVariant: !!current?.base_id && current.base_id !== product.id,
			hasVariants: products.some((p) => p.base_id === product.id),
		};
	}, [products, product.id]);

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
