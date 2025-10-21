import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/v2/buttons/Button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/v2/dialogs/Dialog";
import { Input } from "@/components/v2/inputs/Input";
import { useProductStore } from "@/hooks/stores/useProductStore";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useProductQuery } from "../../product/hooks/useProductQuery";
import { updateProduct } from "../../product/utils/updateProduct";

export default function ConfirmNewVersionDialog({
	open,
	setOpen,
	onVersionCreated,
}: {
	open: boolean;
	setOpen: (open: boolean) => void;
	onVersionCreated?: () => void;
}) {
	const axiosInstance = useAxiosInstance();
	const product = useProductStore((s) => s.product);
	const { refetch } = useProductQuery();

	const [confirmText, setConfirmText] = useState("");
	const [isLoading, setIsLoading] = useState(false);

	const onClick = async () => {
		if (confirmText !== product.id) {
			toast.error("Confirmation text is incorrect");
			return;
		}

		setIsLoading(true);
		await updateProduct({
			axiosInstance,
			productId: product.id,
			product,
			onSuccess: async () => {
				await refetch();
				onVersionCreated?.(); // Reset editing state
			},
		});
		setIsLoading(false);
		setOpen(false);
		// toast.success("New version created successfully");
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild></DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Create new version?</DialogTitle>
					<DialogDescription className="text-sm flex flex-col gap-4">
						<p>
							After creating a new version, it will be{" "}
							<span className="font-bold">
								active immediately for new customers
							</span>
							. You can migrate existing customers to the new version after.
						</p>
						<p>
							Type <code className="font-bold">{product.id}</code> to continue.
						</p>
						<Input
							value={confirmText}
							onChange={(e) => setConfirmText(e.target.value)}
							type="text"
							placeholder={product.id}
							className="w-full text-black"
						/>
					</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<Button variant="primary" onClick={onClick} isLoading={isLoading}>
						Create new version
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
