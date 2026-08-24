import type { ProductV2 } from "@autumn/shared";
import {
	Button,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@autumn/ui";
import { useProductStore } from "@/hooks/stores/useProductStore";
import {
	allVersionsScopeLabel,
	DELETE_PLAN_SCOPE_LABELS,
	DELETE_THIS_VERSION_WARNING,
	type DeletePlanScope,
} from "./deletePlanScope";
import { useDeletePlanDialog } from "./useDeletePlanDialog";

export const DeletePlanDialog = ({
	propProduct,
	open,
	setOpen,
	dropdownOpen,
	onDeleteSuccess,
}: {
	propProduct?: ProductV2;
	open: boolean;
	setOpen: (open: boolean) => void;
	dropdownOpen?: boolean;
	onDeleteSuccess?: () => Promise<void>;
}) => {
	const storeProduct = useProductStore((s) => s.product);
	const product = propProduct ?? storeProduct;
	const {
		archived,
		canChooseScope,
		isLoading,
		isPending,
		previewError,
		reasons,
		removeThisVersion,
		scope,
		setScope,
		titleAction,
		willArchive,
		willArchiveAll,
		handleConfirm,
		handleOpenChange,
	} = useDeletePlanDialog({
		product,
		open,
		dropdownOpen,
		onDeleteSuccess,
		setOpen,
	});

	if (isLoading && !archived) return null;

	const scopeLabels: Record<DeletePlanScope, string> = {
		...DELETE_PLAN_SCOPE_LABELS,
		all: allVersionsScopeLabel({ willArchiveAll }),
	};

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent
				className="bg-background"
				onClick={(e) => e.stopPropagation()}
			>
				<DialogHeader className="max-w-full">
					<DialogTitle className="truncate max-w-[400px]">
						{titleAction} {product.name}
					</DialogTitle>
					<DialogDescription asChild>
						<div className="max-w-[400px] wrap-break-word space-y-2">
							{archived && (
								<p>
									Are you sure you want to unarchive {product.name}? This will
									make it visible in your list of plans.
								</p>
							)}
							{!archived && previewError && <p>{previewError}</p>}
							{!archived &&
								!previewError &&
								reasons.map((reason) => (
									<p key={reason.message}>{reason.message}</p>
								))}
							{!archived && !previewError && reasons.length === 0 && (
								<p>
									{removeThisVersion
										? DELETE_THIS_VERSION_WARNING
										: "Are you sure you want to delete this plan? This action cannot be undone."}
								</p>
							)}
						</div>
					</DialogDescription>
				</DialogHeader>

				{canChooseScope && !archived && (
					<Select
						value={scope}
						onValueChange={(value) =>
							setScope(value === "all" ? "all" : "version")
						}
						items={scopeLabels}
					>
						<SelectTrigger className="w-6/12">
							<SelectValue placeholder="Select a version" />
						</SelectTrigger>
						<SelectContent>
							{Object.entries(scopeLabels).map(([value, label]) => (
								<SelectItem key={value} value={value}>
									{label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				)}

				<DialogFooter>
					<Button variant="secondary" onClick={() => setOpen(false)}>
						Cancel
					</Button>
					<Button
						variant={archived || willArchive ? "primary" : "destructive"}
						onClick={handleConfirm}
						isLoading={isPending}
						disabled={Boolean(previewError)}
					>
						{titleAction}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
