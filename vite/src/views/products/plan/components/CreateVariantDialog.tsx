import {
	Button,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	Input,
} from "@autumn/ui";
import type { ProductV2 } from "@autumn/shared";

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
				<div className="flex flex-col gap-4 py-4">
					<div className="flex flex-col gap-2">
						<label htmlFor="variant-id" className="text-sm font-medium">
							Variant ID
						</label>
						<Input
							id="variant-id"
							value={variantId}
							onChange={(e) => setVariantId(e.target.value)}
							placeholder="e.g. pro_annual, pro_quarterly"
						/>
					</div>
					<div className="flex flex-col gap-2">
						<label htmlFor="variant-name" className="text-sm font-medium">
							Variant name
						</label>
						<Input
							id="variant-name"
							value={variantName}
							onChange={(e) => setVariantName(e.target.value)}
							placeholder="e.g. Pro Annual, Pro Quarterly"
						/>
					</div>
				</div>
				<DialogFooter>
					<Button
						variant="primary"
						onClick={onCreate}
						isLoading={isLoading}
						disabled={isLoading || !variantId.trim() || !variantName.trim()}
						className="w-full"
					>
						Create variant
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
