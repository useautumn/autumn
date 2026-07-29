import type { ProductV2 } from "@autumn/shared";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	FormLabel,
	Input,
	ShortcutButton,
} from "@autumn/ui";
import { useCallback, useEffect } from "react";
import { useAutoSlug } from "@/hooks/common/useAutoSlug";
import { slugify } from "@/utils/formatUtils/formatTextUtils";

interface CreateVariantDialogProps {
	open: boolean;
	setOpen: (open: boolean) => void;
	product: ProductV2;
	variantId: string;
	setVariantId: (id: string) => void;
	variantName: string;
	setVariantName: (name: string) => void;
	isLoading: boolean;
	onCreate: () => void;
}

type VariantSlugState = { id: string; name: string };

export function CreateVariantDialog({
	open,
	setOpen,
	product,
	variantId,
	setVariantId,
	variantName,
	setVariantName,
	isLoading,
	onCreate,
}: CreateVariantDialogProps) {
	const setSlugState = useCallback(
		(
			updater:
				| VariantSlugState
				| ((prev: VariantSlugState) => VariantSlugState),
		) => {
			const prev: VariantSlugState = { id: variantId, name: variantName };
			const next = typeof updater === "function" ? updater(prev) : updater;
			if (next.name !== prev.name) setVariantName(next.name);
			if (next.id !== prev.id) setVariantId(next.id);
		},
		[variantId, variantName, setVariantId, setVariantName],
	);

	const { setSource, setTarget, resetAutoSlug } = useAutoSlug<
		VariantSlugState,
		"name",
		"id"
	>({
		setState: setSlugState,
		sourceKey: "name",
		targetKey: "id",
	});

	// The hook lives outside DialogContent, so re-enable auto-slug on each open.
	useEffect(() => {
		if (open) resetAutoSlug();
	}, [open, resetAutoSlug]);

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle>Create variant</DialogTitle>
					<DialogDescription>
						Create a new plan variant from {product.name}. The variant will
						inherit all features and pricing from this plan. You can change the
						price after creation.
					</DialogDescription>
				</DialogHeader>
				<div className="grid grid-cols-2 gap-2 py-4">
					<div>
						<FormLabel>Variant name</FormLabel>
						<Input
							id="variant-name"
							value={variantName}
							onChange={(e) => setSource(e.target.value)}
							placeholder="e.g. Pro Annual"
						/>
					</div>
					<div>
						<FormLabel>Variant ID</FormLabel>
						<Input
							id="variant-id"
							value={variantId}
							onChange={(e) => setTarget(slugify(e.target.value))}
							placeholder="fills automatically"
						/>
					</div>
				</div>
				<DialogFooter>
					<ShortcutButton
						variant="primary"
						metaShortcut="enter"
						onClick={onCreate}
						isLoading={isLoading}
						disabled={isLoading || !variantId.trim() || !variantName.trim()}
						className="w-full justify-center"
					>
						Create variant
					</ShortcutButton>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
