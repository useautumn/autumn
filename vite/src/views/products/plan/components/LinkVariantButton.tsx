import { IconButton } from "@autumn/ui";
import { Link2Icon } from "lucide-react";
import { useProductStore } from "@/hooks/stores/useProductStore";
import { useLinkVariant } from "../hooks/useLinkVariant";
import { useVariantLinkVisibility } from "../hooks/useVariantLinkVisibility";
import { LinkVariantDialog } from "./LinkVariantDialog";

export const LinkVariantButton = () => {
	const product = useProductStore((s) => s.product);
	const { canLink } = useVariantLinkVisibility(product);
	const linkVariant = useLinkVariant(product);

	if (!canLink) return null;

	return (
		<>
			<IconButton
				onClick={() => linkVariant.setOpen(true)}
				aria-label="Link as variant of"
				variant="secondary"
				iconOrientation="left"
				icon={<Link2Icon />}
				size="mini"
			>
				Link as variant of…
			</IconButton>
			{linkVariant.open && <LinkVariantDialog {...linkVariant.dialogProps} />}
		</>
	);
};
