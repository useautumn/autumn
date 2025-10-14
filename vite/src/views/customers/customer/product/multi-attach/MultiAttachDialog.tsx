import type { ProductV2 } from "@autumn/shared";
import type { CheckoutResult } from "autumn-js";
import { ArrowUpRightFromSquare, Loader2, Plus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
	CustomDialogBody,
	CustomDialogContent,
	CustomDialogFooter,
} from "@/components/general/modal-components/DialogContentWrapper";
import FieldLabel from "@/components/general/modal-components/FieldLabel";
import { Button } from "@/components/ui/button";
import { Dialog, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useOrg } from "@/hooks/common/useOrg";
import { useOrgStripeQuery } from "@/hooks/queries/useOrgStripeQuery";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useAxiosSWR } from "@/services/useAxiosSwr";
import { useEnv } from "@/utils/envUtils";
import { formatUnixToDate } from "@/utils/formatUtils/formatDateUtils";
import { getBackendErr } from "@/utils/genUtils";
import { getStripeInvoiceLink } from "@/utils/linkUtils";
import { formatAmount } from "@/utils/product/productItemUtils";
import { useCusQuery } from "../../hooks/useCusQuery";
import { InvoiceCustomerButton } from "../components/InvoiceCustomerButton";
import { getCusProductMinQuantity } from "../utils/getCusProductMinQuantity";
import { MultiAtttachLines } from "./MultiAttachLines";
import { AddRewardButton, MultiAttachRewards } from "./MultiAttachRewards";

export const MultiAttachDialog = ({
	open,
	setOpen,
}: {
	open: boolean;
	setOpen: (open: boolean) => void;
}) => {
	// const { customer, cusMutate, products, org } = useCustomerContext();
	const { org } = useOrg();
	const { customer, products, refetch } = useCusQuery();
	const { stripeAccount } = useOrgStripeQuery();
	const env = useEnv();

	const axiosInstance = useAxiosInstance();

	const [attachRewards, setAttachRewards] = useState<any[]>([]);
	const [checkoutLoading, setCheckoutLoading] = useState(false);
	const [productOptions, setProductOptions] = useState<any[]>([]);
	const [checkoutResult, setCheckoutResult] = useState<CheckoutResult | null>(
		null,
	);
	const [attachLoading, setAttachLoading] = useState(false);

	const defaultCurrency = org?.default_currency || "usd";

	const { data: subData } = useAxiosSWR({
		url: `/customers/${customer.id}/sub`,
	});

	const subDiscounts = subData?.sub?.discounts || [];

	const getDefaultProductOptions = () => {
		return [{ product_id: null, quantity: 1 }];
	};

	useEffect(() => {
		setProductOptions(getDefaultProductOptions());
		setCheckoutResult(null);
	}, [open]);

	useEffect(() => {
		if (open) {
			handleChange();
		}
	}, [productOptions, attachRewards]);

	const isValidAttach = () => {
		if (productOptions.length === 0) {
			return false;
		}

		for (const option of productOptions) {
			if (!option.product_id) {
				return false;
			}

			if (isNaN(parseFloat(option.quantity))) {
				return false;
			}
		}

		for (const reward of attachRewards) {
			if (!reward.reward_id) {
				return false;
			}
		}

		return true;
	};

	const handleChange = async () => {
		if (isValidAttach()) {
			setCheckoutLoading(true);
			try {
				const { data } = await axiosInstance.post("/v1/checkout", {
					customer_id: customer.id,
					products: productOptions,
					reward: attachRewards.map((r) => r.reward_id),
				});

				setCheckoutResult(data);
			} catch (error) {
				toast.error(getBackendErr(error, "Failed to preview checkout"));
			} finally {
				setCheckoutLoading(false);
			}
		}
	};

	const handleAttachClicked = async ({
		enableProductImmediately,
		useInvoice,
		setLoading,
	}: {
		enableProductImmediately: false;
		useInvoice: boolean;
		setLoading: (loading: boolean) => void;
	}) => {
		if (checkoutResult?.url && !useInvoice) {
			window.open(checkoutResult.url, "_blank");
			// setOpen(false);
			return;
		}

		for (const option of productOptions) {
			if (!option.product_id) {
				toast.error("Can't leave product empty");
				return;
			}
		}

		setLoading(true);

		try {
			const { data } = await axiosInstance.post("/v1/attach", {
				customer_id: customer.id,
				products: productOptions,
				invoice: useInvoice,
				enable_product_immediately: useInvoice
					? enableProductImmediately
					: undefined,
				finalize_invoice: useInvoice ? false : undefined,
				reward: attachRewards?.map((r) => r.reward_id) || [],
			});

			if (data.invoice) {
				window.open(
					getStripeInvoiceLink({
						stripeInvoice: data.invoice,
						env,
						accountId: stripeAccount?.id,
					}),
					"_blank",
				);
			}

			await refetch();
			toast.success("Products attached successfully");
			setOpen(false);
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to attach products"));
			console.log(error);
		} finally {
			setLoading(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<CustomDialogContent className="w-lg">
				<CustomDialogBody>
					<div className="flex flex-col gap-0">
						<div className="flex flex-col gap-4">
							<DialogHeader className="p-0">
								<DialogTitle>Attach Products</DialogTitle>
							</DialogHeader>
							<div className="grid grid-cols-10 gap-2">
								<FieldLabel className="col-span-7 mb-0">Products</FieldLabel>
								<FieldLabel className="col-span-3 mb-0">Quantity</FieldLabel>
								{productOptions.map((option, index) => (
									<>
										<Select
											onValueChange={(value) => {
												setProductOptions((prev) => {
													const newOptions = [...prev];

													const minQuantity = getCusProductMinQuantity({
														customer,
														productId: value,
													});

													newOptions[index] = {
														product_id: value,
														quantity: Math.max(
															newOptions[index].quantity,
															minQuantity,
														),
													};
													return newOptions;
												});
											}}
											value={option.product_id || undefined}
										>
											<SelectTrigger className="col-span-7">
												<SelectValue placeholder="Select Product" />
											</SelectTrigger>
											<SelectContent className="max-h-[300px] overflow-y-auto">
												{products
													.filter(
														(p: ProductV2) =>
															!productOptions
																.map((o, i) =>
																	i !== index ? o.product_id : null,
																)
																.includes(p.id),
													)
													.map((product: ProductV2) => (
														<SelectItem key={product.id} value={product.id}>
															{product.name}
														</SelectItem>
													))}
											</SelectContent>
										</Select>
										<div className="col-span-3 flex items-center gap-1">
											<Input
												type="number"
												className="w-full"
												value={option.quantity}
												onChange={(e) => {
													setProductOptions((prev) => {
														const newOptions = [...prev];
														newOptions[index] = {
															product_id: newOptions[index].product_id,
															quantity: parseInt(e.target.value),
														};
														return newOptions;
													});
												}}
											/>
											<Button
												size="sm"
												className="w-6 !h-6 text-t3"
												isIcon
												variant="ghost"
												startIcon={<X size={12} />}
												onClick={() => {
													if (productOptions.length === 1) {
														toast.error("Must attach at least one product");
														return;
													}
													setProductOptions((prev) => {
														const newOptions = [...prev];
														newOptions.splice(index, 1);
														return newOptions;
													});
												}}
											/>
										</div>
									</>
								))}
							</div>
							<div className="flex justify-start items-center gap-2">
								<Button
									size="sm"
									className="w-fit"
									variant="secondary"
									startIcon={<Plus size={12} />}
									onClick={() => {
										setProductOptions((prev) => [
											...prev,
											{ product_id: null, quantity: 1 },
										]);
									}}
								>
									New Product
								</Button>
								{attachRewards.length === 0 && subDiscounts.length === 0 && (
									<AddRewardButton setAttachRewards={setAttachRewards} />
								)}
								{checkoutLoading && (
									<div className="flex justify-start items-center h-full">
										<Loader2 className="w-4 h-4 text-t3 animate-spin" />
									</div>
								)}
							</div>
						</div>
						<MultiAttachRewards
							attachRewards={attachRewards}
							setAttachRewards={setAttachRewards}
							sub={subData?.sub}
						/>
						{checkoutResult && (
							<div className="flex flex-col gap-2 text-sm mt-4">
								<MultiAtttachLines checkoutResult={checkoutResult} />

								<div className="flex w-full items-center gap-2 font-bold justify-start pr-1 text-t2">
									<p>Total:</p>
									<p>
										{formatAmount({
											defaultCurrency,
											amount: checkoutResult.total,
											maxFractionDigits: 2,
										})}
									</p>
								</div>
								{checkoutResult.next_cycle && (
									<div className="flex justify-between text-muted-foreground text-sm">
										<div>
											<p>
												Due next cycle (
												{formatUnixToDate(checkoutResult.next_cycle?.starts_at)}
												)
											</p>
										</div>
										<p>
											{formatAmount({
												amount: checkoutResult.next_cycle?.total,
												defaultCurrency,
											})}
										</p>
									</div>
								)}
							</div>
						)}
					</div>
				</CustomDialogBody>

				<CustomDialogFooter>
					<InvoiceCustomerButton
						handleAttachClicked={handleAttachClicked}
						disabled={checkoutLoading}
						checkoutAllowed={!!checkoutResult?.url && checkoutResult.total > 0}
					/>

					<Button
						variant="add"
						isLoading={attachLoading}
						onClick={() => {
							handleAttachClicked({
								useInvoice: false,
								enableProductImmediately: false,
								setLoading: setAttachLoading,
							});
						}}
						endIcon={<ArrowUpRightFromSquare size={12} />}
						disabled={checkoutLoading || attachLoading}
						disableStartIcon
					>
						{checkoutResult?.url ? "Checkout Page" : "Attach Products"}
					</Button>
				</CustomDialogFooter>
			</CustomDialogContent>
		</Dialog>
	);
};
