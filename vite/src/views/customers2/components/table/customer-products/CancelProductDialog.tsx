import { CusProductStatus, type FullCusProduct } from "@autumn/shared";
import { useState } from "react";
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
import { formatUnixToDateTime } from "@/utils/formatUtils/formatDateUtils";
import { getBackendErr } from "@/utils/genUtils";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";

export const CancelProductDialog = ({
	cusProduct,
	open,
	setOpen,
}: {
	cusProduct: FullCusProduct;
	open: boolean;
	setOpen: (open: boolean) => void;
}) => {
	const axiosInstance = useAxiosInstance();
	const { customer, refetch } = useCusQuery();
	const [immediateLoading, setImmediateLoading] = useState(false);
	const [endOfCycleLoading, setEndOfCycleLoading] = useState(false);

	const handleClicked = async (cancelImmediately?: boolean) => {
		if (cancelImmediately) {
			setImmediateLoading(true);
		} else {
			setEndOfCycleLoading(true);
		}

		const entity = customer.entities.find(
			(e: any) => e.internal_id === cusProduct.internal_entity_id,
		);

		try {
			await axiosInstance.post(`/v1/subscriptions/update`, {
				customer_id: customer.id || customer.internal_id,
				product_id: cusProduct.product.id,
				entity_id: entity?.id || entity?.internal_id,
				cancel: cancelImmediately ? "immediately" : "end_of_cycle",
				customer_product_id: cusProduct.id,
			});
			await refetch();
			setOpen(false);
			toast.success("Plan cancelled");
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to cancel plan"));
		} finally {
			if (cancelImmediately) {
				setImmediateLoading(false);
			} else {
				setEndOfCycleLoading(false);
			}
		}
	};

	const isDefault = cusProduct.product.is_default;
	const isScheduled = cusProduct.status === CusProductStatus.Scheduled;
	const hasSubscription =
		cusProduct.subscription_ids && cusProduct.subscription_ids.length > 0;

	const currentMain = customer.customer_products.find(
		(cp: any) =>
			!cp.is_add_on &&
			cp.product_id !== cusProduct.product_id &&
			cp.product.group === cusProduct.product.group &&
			(cp.status === CusProductStatus.Active ||
				cp.status === CusProductStatus.PastDue) &&
			cp.internal_entity_id === cusProduct.internal_entity_id,
	);

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogContent
				className="w-md bg-card"
				onClick={(e) => e.stopPropagation()}
			>
				<DialogHeader>
					<DialogTitle>Cancel Plan</DialogTitle>
				</DialogHeader>

				<div className="mb-2 text-sm">
					{isScheduled ? (
						<p className="text-t2">
							This plan is scheduled to start on{" "}
							{formatUnixToDateTime(cusProduct.starts_at).date}.
							{currentMain
								? ` Are you sure you want to remove this schedule and renew the current plan (${currentMain.product.name})?`
								: " Are you sure you want to remove this schedule?"}
						</p>
					) : isDefault ? (
						<p className="text-t2">
							This is the default plan. Cancelling it means this customer will
							be left without a plan. You can re-enable manually afterwards.
						</p>
					) : (
						<p className="text-t2">
							Are you sure you want to cancel this plan? This action cannot be
							undone.
						</p>
					)}
				</div>

				<DialogFooter>
					<div className="flex gap-2">
						{isScheduled ? (
							<Button
								onClick={() => handleClicked(true)}
								variant="destructive"
								isLoading={immediateLoading}
							>
								Cancel scheduled plan
							</Button>
						) : isDefault ? (
							<Button
								onClick={() => handleClicked(true)}
								variant="destructive"
								isLoading={immediateLoading}
							>
								Cancel default plan
							</Button>
						) : (
							<>
								{hasSubscription && (
									<Button
										onClick={() => handleClicked(false)}
										variant="secondary"
										isLoading={endOfCycleLoading}
									>
										Cancel at end of cycle
									</Button>
								)}
								<Button
									variant="destructive"
									onClick={() => handleClicked(true)}
									isLoading={immediateLoading}
									disabled={immediateLoading || endOfCycleLoading}
								>
									Cancel immediately
								</Button>
							</>
						)}
					</div>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
