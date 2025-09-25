import {
	Dialog,
	DialogContent,
	DialogDescription,
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
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Are you absolutely sure?</DialogTitle>
					<DialogDescription>
						This action cannot be undone. This will permanently delete your
						account and remove your data from our servers.
					</DialogDescription>
				</DialogHeader>

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
