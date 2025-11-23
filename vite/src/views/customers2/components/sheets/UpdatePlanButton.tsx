import {
	AttachBranch,
	AttachFunction,
	type Entity,
	type FullCusProduct,
	type ProductV2,
} from "@autumn/shared";
import { CheckCircle } from "@phosphor-icons/react";
import { ArrowUpRightFromSquare } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { PriceItem } from "@/components/pricing/attach-pricing-dialog";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/v2/buttons/Button";
import { useOrgStripeQuery } from "@/hooks/queries/useOrgStripeQuery";
import { CusService } from "@/services/customers/CusService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useEnv } from "@/utils/envUtils";
import { getBackendErr } from "@/utils/genUtils";
import { getStripeInvoiceLink } from "@/utils/linkUtils";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";

interface UpdatePlanButtonProps {
	cusProduct: FullCusProduct;
	editedProduct: ProductV2;
	onSuccess?: () => void;
}

export function UpdatePlanButton({
	cusProduct,
	editedProduct,
	onSuccess,
}: UpdatePlanButtonProps) {
	const { customer, entities, refetch } = useCusQuery();
	const { stripeAccount } = useOrgStripeQuery();
	const axiosInstance = useAxiosInstance();
	const env = useEnv();

	const [previewLoading, setPreviewLoading] = useState(false);
	const [modalOpen, setModalOpen] = useState(false);
	const [preview, setPreview] = useState<any>(null);
	const [attachLoading, setAttachLoading] = useState(false);

	const entity = entities?.find(
		(e: Entity) =>
			e.internal_id === cusProduct.internal_entity_id ||
			e.id === cusProduct.entity_id,
	);

	const handlePreviewClick = async () => {
		setPreviewLoading(true);

		try {
			const attachBody = {
				customer_id: customer.id || customer.internal_id,
				product_id: editedProduct.id,
				entity_id: entity ? entity.id || entity.internal_id : undefined,
				is_custom: true,
				items: editedProduct.items,
				free_trial: editedProduct.free_trial || undefined,
			};

			const res = await axiosInstance.post("/v1/attach/preview", attachBody);
			setPreview(res.data);
			setModalOpen(true);
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to preview plan update"));
			console.error("Preview error:", error);
		} finally {
			setPreviewLoading(false);
		}
	};

	const handleUpdatePlan = async ({
		useInvoice,
		enableProductImmediately,
	}: {
		useInvoice: boolean;
		enableProductImmediately?: boolean;
	}) => {
		setAttachLoading(true);

		try {
			const attachBody = {
				customer_id: customer.id || customer.internal_id,
				product_id: editedProduct.id,
				entity_id: entity ? entity.id || entity.internal_id : undefined,
				is_custom: true,
				items: editedProduct.items,
				free_trial: editedProduct.free_trial || undefined,
				invoice: useInvoice,
				enable_product_immediately: useInvoice
					? enableProductImmediately
					: undefined,
				finalize_invoice: useInvoice ? false : undefined,
			};

			const { data } = await CusService.attach(axiosInstance, attachBody);

			if (data.checkout_url) {
				window.open(data.checkout_url, "_blank");
			} else if (data.invoice) {
				window.open(
					getStripeInvoiceLink({
						stripeInvoice: data.invoice,
						env,
						accountId: stripeAccount?.id,
					}),
					"_blank",
				);
			}

			toast.success(data.message || "Plan updated successfully");

			// Refetch customer data
			await refetch();

			// Close modal and call success callback
			setModalOpen(false);
			onSuccess?.();
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to update plan"));
			console.error("Update plan error:", error);
		} finally {
			setAttachLoading(false);
		}
	};

	const getName = () => {
		const cusName =
			customer?.name || customer?.id || customer.email || customer.internal_id;

		if (entity) {
			const entityName = entity?.name || entity?.id || entity?.internal_id;
			return `${cusName} (${entityName})`;
		}

		return cusName;
	};

	const invoiceAllowed = () => {
		if (preview?.branch === AttachBranch.SameCustomEnts) {
			return false;
		}

		if (preview?.branch === AttachBranch.Downgrade) {
			return false;
		}

		if (preview?.branch === AttachBranch.Renew) {
			return false;
		}

		return true;
	};

	const getButtonText = () => {
		if (preview?.branch === AttachBranch.Downgrade) {
			return "Confirm Downgrade";
		}

		if (preview?.branch === AttachBranch.SameCustomEnts) {
			return "Confirm";
		}

		if (preview?.func === AttachFunction.CreateCheckout) {
			return "Checkout Page";
		}

		const dueToday = preview?.due_today;

		if (dueToday && dueToday.total === 0) {
			return "Confirm";
		}

		return "Charge Customer";
	};

	return (
		<>
			<Button
				variant="primary"
				onClick={handlePreviewClick}
				isLoading={previewLoading}
			>
				<CheckCircle size={16} weight="duotone" />
				Update Plan
			</Button>

			<Dialog open={modalOpen} onOpenChange={setModalOpen}>
				<DialogContent className="w-xl bg-card max-h-[90vh] overflow-y-auto">
					<DialogHeader>
						<DialogTitle>Update Plan for {getName()}</DialogTitle>
					</DialogHeader>

					{preview && (
						<div className="space-y-4">
							<div className="space-y-2">
								<p className="text-sm font-medium text-t2">Details</p>
								<PriceItem>
									<span>Plan</span>
									<span>{editedProduct?.name}</span>
								</PriceItem>
								<PriceItem>
									<span>Customer</span>
									<span>{getName()}</span>
								</PriceItem>
							</div>

							{preview?.due_today && (
								<div className="space-y-2">
									<p className="text-sm font-medium text-t2">Due Today</p>
									<div className="space-y-1">
										{preview.due_today.line_items?.map(
											(item: any, index: number) => (
												<PriceItem key={index}>
													<span>{item.description}</span>
													<span>
														{new Intl.NumberFormat("en-US", {
															style: "currency",
															currency: preview.due_today.currency || "USD",
														}).format((item.amount || 0) / 100)}
													</span>
												</PriceItem>
											),
										)}
										<PriceItem>
											<span className="font-semibold">Total</span>
											<span className="font-semibold">
												{new Intl.NumberFormat("en-US", {
													style: "currency",
													currency: preview.due_today.currency || "USD",
												}).format((preview.due_today.total || 0) / 100)}
											</span>
										</PriceItem>
									</div>
								</div>
							)}

							{preview?.branch && (
								<div className="space-y-2">
									<p className="text-sm text-t3">
										Branch:{" "}
										<span className="font-medium">{preview.branch}</span>
									</p>
								</div>
							)}
						</div>
					)}

					<DialogFooter className="gap-2">
						{preview?.func === AttachFunction.CreateCheckout && (
							<Button
								onClick={() =>
									handleUpdatePlan({
										useInvoice: false,
										enableProductImmediately: true,
									})
								}
								isLoading={attachLoading}
								variant="primary"
								className="gap-2"
							>
								{getButtonText()}
								<ArrowUpRightFromSquare size={16} />
							</Button>
						)}

						{invoiceAllowed() && (
							<>
								<Button
									onClick={() =>
										handleUpdatePlan({
											useInvoice: true,
											enableProductImmediately: false,
										})
									}
									isLoading={attachLoading}
									variant="secondary"
								>
									Invoice (After Payment)
								</Button>
								<Button
									onClick={() =>
										handleUpdatePlan({
											useInvoice: true,
											enableProductImmediately: true,
										})
									}
									isLoading={attachLoading}
									variant="primary"
								>
									Invoice (Immediate)
								</Button>
							</>
						)}

						{!invoiceAllowed() &&
							preview?.func !== AttachFunction.CreateCheckout && (
								<Button
									onClick={() =>
										handleUpdatePlan({
											useInvoice: true,
											enableProductImmediately: true,
										})
									}
									isLoading={attachLoading}
									variant="primary"
								>
									{getButtonText()}
								</Button>
							)}
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
