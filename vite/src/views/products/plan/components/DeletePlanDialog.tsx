import { Button } from "@/components/v2/buttons/Button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/v2/dialogs/Dialog";
import { useProductContext } from "../../product/ProductContext";

export const DeletePlanDialog = ({
	open,
	setOpen,
}: {
	open: boolean;
	setOpen: (open: boolean) => void;
}) => {
	const { product } = useProductContext();
	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogContent className="max-w-sm">
				<DialogHeader>
					<DialogTitle>Delete {product.name}</DialogTitle>
					<DialogDescription>
						Are you sure you want to delete this plan? This action cannot be
						undone.
					</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<Button variant="secondary" onClick={() => setOpen(false)}>
						Cancel
					</Button>
					<Button variant="destructive" onClick={() => setOpen(false)}>
						Delete
					</Button>
				</DialogFooter>

				{/* <div className="flex items-center gap-2">
					<LabelInput
						label="Plan name"
						value={product.name}
						readOnly
						placeholder={product.name}
					/>
				</div> */}
			</DialogContent>
		</Dialog>
	);
};
