import type { ProductV2 } from "@autumn/shared";
import CreateProductSheet from "@/views/products/products/components/CreateProductSheet";
import { usePendingLicenseLinks } from "./PendingLicenseLinksContext";

/**
 * The create-plan sheet in its license variant: on create, the new plan is
 * staged as a pending link so its card appears (editable) immediately — the
 * link persists on plan save.
 */
export function CreateLicenseSheet({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const { addPendingLink } = usePendingLicenseLinks();

	return (
		<CreateProductSheet
			isLicense
			open={open}
			onOpenChange={onOpenChange}
			onSuccess={async (newProduct: ProductV2) => {
				addPendingLink(newProduct.id);
			}}
		/>
	);
}
