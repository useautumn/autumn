import { IconButton } from "@autumn/ui";
import { GitForkIcon } from "lucide-react";
import { useProductStore } from "@/hooks/stores/useProductStore";
import { useCreateVariant } from "../hooks/useCreateVariant";
import { useVariantLinkVisibility } from "../hooks/useVariantLinkVisibility";
import { CreateVariantDialog } from "./CreateVariantDialog";

export const CreateVariantButton = () => {
	const product = useProductStore((s) => s.product);
	const { isVariant, hasVariants } = useVariantLinkVisibility(product);
	const createVariant = useCreateVariant(product);

	// Unlike linking, creating a variant stays available on archived plans.
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
