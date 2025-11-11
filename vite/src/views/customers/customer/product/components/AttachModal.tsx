import {
	AttachBranch,
	AttachFunction,
	type Entity,
	ErrCode,
} from "@autumn/shared";
import { ArrowUpRightFromSquare } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { PriceItem } from "@/components/pricing/attach-pricing-dialog";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { useOrgStripeQuery } from "@/hooks/queries/useOrgStripeQuery";
import { cn } from "@/lib/utils";
import { CusService } from "@/services/customers/CusService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useEnv } from "@/utils/envUtils";
import {
	getBackendErr,
	getBackendErrObj,
	getRedirectUrl,
	navigateTo,
	nullish,
} from "@/utils/genUtils";
import { getStripeInvoiceLink } from "@/utils/linkUtils";
import { useProductContext } from "@/views/products/product/ProductContext";
import { useCusQuery } from "../../hooks/useCusQuery";
import { AttachPreviewDetails } from "./AttachPreviewDetails";
import { AttachInfo } from "./attach-preview/AttachInfo";
import { getAttachBody } from "./attachProductUtils";
import { InvoiceCustomerButton } from "./InvoiceCustomerButton";

export const AttachModal = ({
	open,
	setOpen,
}: {
	open: boolean;
	setOpen: (open: boolean) => void;
}) => {
	const { customer, entities } = useCusQuery();
	const { product, entityId, attachState, version } = useProductContext();
	const { stripeAccount } = useOrgStripeQuery();

	const navigation = useNavigate();
	const env = useEnv();
	const axiosInstance = useAxiosInstance();

	const { preview, options, flags } = attachState;
	const [checkoutLoading, setCheckoutLoading] = useState(false);
	const [invoiceLoading] = useState(false);

	const getName = () => {
		const cusName =
			customer?.name || customer?.id || customer.email || customer.internal_id;

		if (entityId) {
			const entity = entities.find(
				(e: Entity) => e.id === entityId || e.internal_id === entityId,
			);
			const entityName = entity?.name || entity?.id || entity?.internal_id;
			return `${cusName} (${entityName})`;
		}

		return cusName;
	};

	const getCusId = () => {
		let cusId = customer.id || customer.internal_id;
		if (entityId) {
			cusId = `${cusId}?entity_id=${entityId}`;
		}
		return cusId;
	};

	const invoiceAllowed = () => {
		if (preview?.branch === AttachBranch.SameCustomEnts || flags.isFree) {
			return false;
		}

		if (preview?.branch === AttachBranch.Downgrade) {
			return false;
		}

		if (preview?.branch === AttachBranch.Renew) {
			return false;
		}

		// const dueToday = preview?.due_today;
		// if (dueToday && dueToday.total == 0) {
		//   return false;
		// }

		return true;
	};

	const getButtonText = () => {
		if (preview?.branch === AttachBranch.Downgrade) {
			return "Confirm Downgrade";
		}

		if (preview?.branch === AttachBranch.SameCustomEnts || flags.isFree) {
			return "Confirm";
		}

		if (flags.isCanceled) {
			return "Renew Plan";
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

	const handleAttachClicked = async ({
		useInvoice,
		enableProductImmediately,
		setLoading,
	}: {
		useInvoice: boolean;
		enableProductImmediately?: boolean;
		setLoading: (loading: boolean) => void;
	}) => {
		const cusId = getCusId();

		for (const option of options) {
			if (
				nullish(option.quantity) &&
				preview?.branch !== AttachBranch.SameCustomEnts &&
				preview?.branch !== AttachBranch.NewVersion
			) {
				toast.error(`Quantity for ${option.feature_name} is required`);
				return;
			}
		}

		try {
			setLoading(true);

			const redirectUrl = getRedirectUrl(`/customers/${cusId}`, env);

			const attachBody = getAttachBody({
				customerId: customer.id || customer.internal_id,
				entityId,
				product,
				optionsInput:
					preview?.branch !== AttachBranch.NewVersion &&
					preview?.branch !== AttachBranch.SameCustomEnts
						? options
						: undefined,
				attachState,
				useInvoice,
				enableProductImmediately,
				successUrl: `${import.meta.env.VITE_FRONTEND_URL}${redirectUrl}`,
				version: product.version,
			});

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
			navigateTo(`/customers/${cusId}`, navigation, env);

			toast.success(data.message || "Successfully attached plan");
			setOpen(false);
		} catch (error) {
			console.log("Error creating product: ", error);
			const errObj = getBackendErrObj(error);

			if (errObj?.code === ErrCode.StripeConfigNotFound) {
				toast.error(errObj?.message);
				const redirectUrl = getRedirectUrl(`/customers/${customer.id}`, env);
				navigateTo(
					`/integrations/stripe?redirect=${redirectUrl}`,
					navigation,
					env,
				);
			} else {
				toast.error(getBackendErr(error, "Error creating plan"));
			}
		} finally {
			setLoading(false);
		}
	};

	const [configOpen] = useState(false);

	const mainWidth = "w-lg";

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogContent className="translate-y-[0%] top-[20%] max-h-[70vh] duration-0 p-0 overflow-y-auto">
				<div className="flex transition-all duration-300 ease-in-out">
					<div
						className={`p-6 pb-2 flex flex-col gap-4 ${mainWidth} rounded-sm`}
					>
						<DialogHeader>
							<DialogTitle className="text-t2 text-md">Attach plan</DialogTitle>
						</DialogHeader>

						<div className="text-sm flex flex-col gap-4">
							<div className="flex flex-col">
								<p className="text-t2 font-semibold mb-2">Details</p>

								<PriceItem>
									<span>Plan</span>
									<span>{product?.name}</span>
								</PriceItem>

								<PriceItem>
									<span>Customer</span>
									<span>{getName()}</span>
								</PriceItem>
							</div>

							{preview && !flags.isFree && <AttachPreviewDetails />}

							<AttachInfo />
						</div>

						<div className="my-2"></div>
					</div>
					<div
						className={`transition-all duration-300 ease-in-out border-l border-zinc-200 overflow-hidden ${
							configOpen ? "max-w-xs opacity-100" : "max-w-0 opacity-0"
						}`}
					>
						<div className="p-6 pb-0 w-xs">
							<p className="text-t2 text-sm font-semibold">Advanced</p>
						</div>
					</div>
				</div>

				<DialogFooter
					className={cn(
						"bg-stone-100 flex items-center h-10 gap-0 border-t border-zinc-200",
						mainWidth,
					)}
				>
					{invoiceAllowed() && (
						<InvoiceCustomerButton
							preview={preview}
							handleAttachClicked={handleAttachClicked}
						/>
					)}
					<Button
						variant="add"
						className="!h-full"
						disableStartIcon={true}
						endIcon={<ArrowUpRightFromSquare size={12} />}
						isLoading={checkoutLoading}
						disabled={invoiceLoading || checkoutLoading}
						onClick={() =>
							handleAttachClicked({
								useInvoice: false,
								setLoading: setCheckoutLoading,
							})
						}
					>
						{getButtonText()}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
