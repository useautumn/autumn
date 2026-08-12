import type { ProductV2 } from "@autumn/shared";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	FormLabel,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
	ShortcutButton,
} from "@autumn/ui";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";

interface LinkVariantDialogProps {
	open: boolean;
	setOpen: (open: boolean) => void;
	product: ProductV2;
	basePlanId: string;
	setBasePlanId: (id: string) => void;
	isLoading: boolean;
	onLink: () => void;
}

export function LinkVariantDialog({
	open,
	setOpen,
	product,
	basePlanId,
	setBasePlanId,
	isLoading,
	onLink,
}: LinkVariantDialogProps) {
	const { products } = useProductsQuery();

	const basePlanOptions = products.filter(
		(candidate) =>
			candidate.id !== product.id && !candidate.base_id && !candidate.archived,
	);

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle>Link as variant</DialogTitle>
					<DialogDescription>
						Link {product.name} as a variant of an existing plan.
					</DialogDescription>
				</DialogHeader>
				<div className="py-4">
					<FormLabel>Base plan</FormLabel>
					<Select value={basePlanId} onValueChange={setBasePlanId}>
						<SelectTrigger className="w-full" aria-label="Base plan">
							<SelectValue placeholder="Select base plan" />
						</SelectTrigger>
						<SelectContent>
							{basePlanOptions.map((basePlan) => (
								<SelectItem key={basePlan.id} value={basePlan.id}>
									{basePlan.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<p className="mt-2 text-xs text-tertiary-foreground">
						Once linked, edits to the base plan can propagate here and shared
						settings become managed by the base.
					</p>
				</div>
				<DialogFooter>
					<ShortcutButton
						variant="primary"
						metaShortcut="enter"
						onClick={onLink}
						isLoading={isLoading}
						disabled={isLoading || !basePlanId}
						className="w-full justify-center"
					>
						Link as variant
					</ShortcutButton>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
