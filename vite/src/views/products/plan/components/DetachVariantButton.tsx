import { IconButton } from "@autumn/ui";
import { Unlink2Icon } from "lucide-react";
import { useProductStore } from "@/hooks/stores/useProductStore";
import { useDetachVariant } from "../hooks/useDetachVariant";
import { useVariantLinkVisibility } from "../hooks/useVariantLinkVisibility";
import { DetachVariantDialog } from "./DetachVariantDialog";

export const DetachVariantButton = () => {
	const product = useProductStore((s) => s.product);
	const { canDetach } = useVariantLinkVisibility(product);
	const detachVariant = useDetachVariant(product);

	if (!canDetach) return null;

	return (
		<>
			<IconButton
				onClick={() => detachVariant.setOpen(true)}
				aria-label="Detach from base"
				variant="secondary"
				iconOrientation="left"
				icon={<Unlink2Icon />}
				size="mini"
			>
				Detach from base
			</IconButton>
			{detachVariant.open && (
				<DetachVariantDialog {...detachVariant.dialogProps} />
			)}
		</>
	);
};
