import type { Entity } from "@autumn/shared";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/v2/buttons/Button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/v2/dialogs/Dialog";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { useCustomerContext } from "../CustomerContext";

export const DeleteEntity = ({
	open,
	setOpen,
	entity,
}: {
	open: boolean;
	setOpen: (open: boolean) => void;
	entity: Entity | null | undefined;
}) => {
	const { customer, refetch } = useCusQuery();
	const { setEntityId } = useCustomerContext();
	const navigate = useNavigate();
	const location = useLocation();
	const [isDeleting, setIsDeleting] = useState(false);

	const axiosInstance = useAxiosInstance();

	const handleDeleteClicked = async () => {
		if (!entity || !customer?.id) return;

		setIsDeleting(true);
		try {
			await axiosInstance.delete(
				`/v1/customers/${customer.id}/entities/${entity.id || entity.internal_id}`,
			);

			await refetch();
			setOpen(false);

			// Clear the selection
			const params = new URLSearchParams(location.search);
			params.delete("entity_id");
			navigate(`${location.pathname}?${params.toString()}`);
			setEntityId(null);

			toast.success("Entity deleted successfully");
		} catch (error) {
			console.log(error);
			toast.error(getBackendErr(error, "Failed to delete entity"));
		} finally {
			setIsDeleting(false);
		}
	};

	if (!entity) return null;

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogContent className="w-[400px] bg-card">
				<DialogHeader>
					<DialogTitle>Delete Entity</DialogTitle>
				</DialogHeader>
				<div className="flex flex-col gap-4 overflow-hidden">
					<p className="text-sm text-t2">
						Are you sure you want to delete this entity? This action cannot be
						undone.
					</p>
					<div className="flex flex-col gap-2 bg-secondary p-3 rounded-lg border shrink-0">
						{entity.name && (
							<div className="flex gap-2">
								<span className="text-t3 text-sm font-medium">Name:</span>
								<span className="text-t1 text-sm truncate">{entity.name}</span>
							</div>
						)}
						<div className="flex gap-2">
							<span className="text-t3 text-sm font-medium">ID:</span>
							<span className="text-t1 text-sm font-mono truncate">
								{entity.id || entity.internal_id}
							</span>
						</div>
						{entity.feature_id && (
							<div className="flex gap-2">
								<span className="text-t3 text-sm font-medium">Feature:</span>
								<span className="text-t1 text-sm truncate">
									{entity.feature_id}
								</span>
							</div>
						)}
					</div>
				</div>

				<DialogFooter>
					<Button
						onClick={() => setOpen(false)}
						variant="secondary"
						disabled={isDeleting}
					>
						Cancel
					</Button>
					<Button
						onClick={handleDeleteClicked}
						isLoading={isDeleting}
						variant="destructive"
					>
						Delete
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
