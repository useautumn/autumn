import type { Entity, FullCusProduct } from "@autumn/shared";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/v2/buttons/Button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/v2/dialogs/Dialog";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/v2/selects/Select";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";

const CUSTOMER_LEVEL_VALUE = "__customer__";

export const TransferProductDialog = ({
	cusProduct,
	open,
	setOpen,
}: {
	cusProduct: FullCusProduct;
	open: boolean;
	setOpen: (open: boolean) => void;
}) => {
	const { customer, refetch } = useCusQuery();
	const axiosInstance = useAxiosInstance();
	const [loading, setLoading] = useState(false);
	const [selectedValue, setSelectedValue] = useState<string>("");

	const filteredEntities = customer.entities.filter((entity: Entity) =>
		cusProduct.internal_entity_id
			? entity.internal_id !== cusProduct.internal_entity_id
			: entity.id !== cusProduct.entity_id,
	);

	// Check if product is currently on an entity
	const isOnEntity = !!cusProduct.entity_id || !!cusProduct.internal_entity_id;

	useEffect(() => {
		if (open) {
			setSelectedValue("");
		}
	}, [open]);

	const handleTransfer = async () => {
		if (!selectedValue) {
			toast.error("Please select a destination");
			return;
		}

		setLoading(true);

		try {
			const fromEntity = customer.entities.find((e: Entity) =>
				cusProduct.internal_entity_id
					? e.internal_id === cusProduct.internal_entity_id
					: e.id === cusProduct.entity_id,
			);

			const isMovingToCustomer = selectedValue === CUSTOMER_LEVEL_VALUE;
			const toEntity = isMovingToCustomer
				? null
				: customer.entities.find(
						(e: Entity) => e.internal_id === selectedValue,
					);

			await axiosInstance.post(
				`/v1/customers/${cusProduct.customer_id}/transfer`,
				{
					customer_product_id: cusProduct.id,
					from_entity_id: fromEntity?.internal_id,
					to_entity_id: isMovingToCustomer ? null : toEntity?.internal_id,
					product_id: cusProduct.product_id,
				},
			);

			await refetch();
			toast.success("Plan transferred successfully");
			setOpen(false);
		} catch (error) {
			console.log(error);
			toast.error(getBackendErr(error, "Failed to transfer plan"));
		} finally {
			setLoading(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogContent
				className="w-full max-w-[calc(100vw-2rem)] sm:max-w-md bg-card"
				onClick={(e) => e.stopPropagation()}
			>
				<DialogHeader>
					<DialogTitle>Transfer Plan</DialogTitle>
				</DialogHeader>

				<div className="flex flex-col gap-3">
					<p className="text-sm text-muted-foreground">
						{isOnEntity
							? "Transfer this plan to another entity or move it back to the customer level."
							: "Transfer this plan to an entity."}
					</p>

					<Select
						value={selectedValue}
						onValueChange={setSelectedValue}
						items={{
							...(isOnEntity
								? { [CUSTOMER_LEVEL_VALUE]: "Move to Customer" }
								: {}),
							...Object.fromEntries(
								filteredEntities.map((entity: Entity) => [
									entity.internal_id,
									entity.name || entity.internal_id,
								]),
							),
						}}
					>
						<SelectTrigger>
							<SelectValue placeholder="Select destination" />
						</SelectTrigger>
						<SelectContent>
							{/* Move to Customer option - only show if product is currently on an entity */}
							{isOnEntity && (
								<SelectItem value={CUSTOMER_LEVEL_VALUE}>
									<span className="font-medium">Move to Customer</span>
								</SelectItem>
							)}

							{/* Entity options */}
							{filteredEntities.map((entity: Entity) => (
								<SelectItem
									key={entity.id || entity.internal_id}
									value={entity.internal_id}
								>
									<div className="flex gap-2 items-center min-w-0">
										{entity.name && (
											<span className="truncate max-w-[120px]">
												{entity.name}
											</span>
										)}
										<span className="truncate text-tertiary-foreground font-mono text-xs">
											{entity.internal_id}
										</span>
									</div>
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				<DialogFooter>
					<Button
						onClick={handleTransfer}
						isLoading={loading}
						disabled={!selectedValue}
					>
						Transfer
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
