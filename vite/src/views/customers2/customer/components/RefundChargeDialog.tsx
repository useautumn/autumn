import {
	AppEnv,
	type CustomerRefundPreviewResponse,
	type CustomerRefundResponse,
	formatAmount,
	type RefundableChargeRow,
	type RefundMode,
	type RefundReason,
} from "@autumn/shared";
import { ArrowLeft } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PaginationState, RowSelectionState } from "@tanstack/react-table";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/v2/buttons/Button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/v2/dialogs/Dialog";
import { Input } from "@/components/v2/inputs/Input";
import { SearchableSelect } from "@/components/v2/selects/SearchableSelect";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useOrgStripeQuery } from "@/hooks/queries/useOrgStripeQuery";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import { getStripeInvoiceLink, getStripeSubLink } from "@/utils/linkUtils";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { InfoBox } from "@/views/onboarding2/integrate/components/InfoBox";
import { RefundChargeTable } from "./RefundChargeTable";
import type {
	RefundAmountsByChargeId,
	RefundDialogStage,
	RefundPreviewSummary,
} from "./refundChargeTypes";

const REFUND_REASON_OPTIONS: RefundReason[] = [
	"requested_by_customer",
	"duplicate",
	"fraudulent",
];

const STAGE_ANIMATION = {
	initial: { opacity: 0, y: 8 },
	animate: { opacity: 1, y: 0 },
	exit: { opacity: 0, y: -8 },
	transition: { duration: 0.2, ease: "easeOut" },
};

const formatMoney = ({
	amount,
	currency,
}: {
	amount: number;
	currency: string;
}) => {
	return formatAmount({
		amount,
		currency,
		minFractionDigits: 2,
		amountFormatOptions: {
			currencyDisplay: "narrowSymbol",
		},
	});
};

const reasonLabel = (reason: RefundReason) => {
	return reason
		.replaceAll("_", " ")
		.replace(/^./, (char) => char.toUpperCase());
};

const getSourceLink = ({
	charge,
	env,
	accountId,
}: {
	charge: RefundableChargeRow;
	env: AppEnv;
	accountId?: string;
}) => {
	if (charge.invoiceId) {
		return getStripeInvoiceLink({
			stripeInvoice: charge.invoiceId,
			env,
			accountId,
		});
	}
	if (charge.subscriptionId) {
		return getStripeSubLink({
			subscriptionId: charge.subscriptionId,
			env,
			accountId,
		});
	}
	return charge.stripeUrl;
};

const getCurrencyMismatchMessage = ({
	charges,
}: {
	charges: RefundableChargeRow[];
}) => {
	const currencies = [
		...new Set(charges.map((charge) => charge.currency.toUpperCase())),
	];
	if (currencies.length <= 1) return null;
	return `Selected charges must all use the same currency. Current selection: ${currencies.join(", ")}`;
};

const buildFullAmounts = ({ charges }: { charges: RefundableChargeRow[] }) => {
	return Object.fromEntries(
		charges.map((charge) => [
			charge.chargeId,
			charge.refundableAmount.toString(),
		]),
	);
};

export const RefundChargeDialog = ({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) => {
	const axiosInstance = useAxiosInstance();
	const { customer, refetch } = useCusQuery();
	const { stripeAccount } = useOrgStripeQuery();
	const queryClient = useQueryClient();
	const buildQueryKey = useQueryKeyFactory();
	const customerId = customer?.id || customer?.internal_id;
	const [stage, setStage] = useState<RefundDialogStage>("list");
	const [selectedChargeIds, setSelectedChargeIds] = useState<string[]>([]);
	const [pagination, setPagination] = useState<PaginationState>({
		pageIndex: 0,
		pageSize: 5,
	});
	const [mode, setMode] = useState<RefundMode>("full");
	const [reason, setReason] = useState<RefundReason>("requested_by_customer");
	const [amountsByChargeId, setAmountsByChargeId] =
		useState<RefundAmountsByChargeId>({});
	const [listError, setListError] = useState<string | null>(null);
	const [refundError, setRefundError] = useState<string | null>(null);
	const [resultMessage, setResultMessage] = useState<string | null>(null);

	const refundablesQuery = useQuery({
		queryKey: buildQueryKey([
			"customer-refundables",
			customerId,
			pagination.pageIndex,
			pagination.pageSize,
		]),
		queryFn: async () => {
			const { data } = await axiosInstance.get(
				`/v1/customers/${customerId}/refundables`,
				{
					params: {
						offset: pagination.pageIndex * pagination.pageSize,
						limit: pagination.pageSize,
					},
				},
			);
			return data as {
				list: RefundableChargeRow[];
				has_more: boolean;
				total: number;
			};
		},
		enabled: open && Boolean(customerId),
	});

	const pageCharges = refundablesQuery.data?.list ?? [];
	const rowSelection = useMemo<RowSelectionState>(() => {
		return Object.fromEntries(
			pageCharges
				.filter((charge) => selectedChargeIds.includes(charge.chargeId))
				.map((charge) => [charge.chargeId, true]),
		);
	}, [pageCharges, selectedChargeIds]);
	const selectedCount = selectedChargeIds.length;

	const previewQuery = useQuery({
		queryKey: buildQueryKey([
			"customer-refund-preview",
			customerId,
			selectedChargeIds.slice().sort().join(","),
			mode,
			reason,
			JSON.stringify(amountsByChargeId),
		]),
		queryFn: async () => {
			const { data } = await axiosInstance.post(
				`/v1/customers/${customerId}/refunds/preview`,
				{
					charge_ids: selectedChargeIds,
					mode,
					amounts_by_charge_id:
						mode === "custom"
							? Object.fromEntries(
									Object.entries(amountsByChargeId).map(
										([chargeId, amount]) => [chargeId, Number(amount)],
									),
								)
							: undefined,
					reason,
				},
			);
			return data as CustomerRefundPreviewResponse;
		},
		enabled: open && stage === "refund" && selectedChargeIds.length > 0,
		retry: false,
	});

	const refundCharges = previewQuery.data?.charges ?? [];
	const currencyMismatchMessage = useMemo(
		() => getCurrencyMismatchMessage({ charges: refundCharges }),
		[refundCharges],
	);

	useEffect(() => {
		if (!open) {
			setStage("list");
			setSelectedChargeIds([]);
			setPagination({ pageIndex: 0, pageSize: 5 });
			setMode("full");
			setReason("requested_by_customer");
			setAmountsByChargeId({});
			setListError(null);
			setRefundError(null);
			setResultMessage(null);
		}
	}, [open]);

	useEffect(() => {
		if (mode !== "full" || refundCharges.length === 0) return;
		setAmountsByChargeId(buildFullAmounts({ charges: refundCharges }));
	}, [mode, refundCharges]);

	const refundMutation = useMutation({
		mutationFn: async () => {
			const { data } = await axiosInstance.post(
				`/v1/customers/${customerId}/refunds`,
				{
					charge_ids: selectedChargeIds,
					mode,
					amounts_by_charge_id:
						mode === "custom"
							? Object.fromEntries(
									Object.entries(amountsByChargeId).map(
										([chargeId, amount]) => [chargeId, Number(amount)],
									),
								)
							: undefined,
					reason,
				},
			);
			return data as CustomerRefundResponse;
		},
		onSuccess: async (data) => {
			const failedRefunds = data.refunds.filter(
				(refund) => refund.status === "failed",
			);
			const succeededCount = data.refunds.length - failedRefunds.length;

			if (failedRefunds.length > 0) {
				toast.warning(
					`${succeededCount} refund${succeededCount === 1 ? "" : "s"} succeeded, ${failedRefunds.length} failed`,
				);
				setResultMessage(
					failedRefunds
						.map(
							(refund) =>
								refund.errorMessage || `Refund failed for ${refund.chargeId}`,
						)
						.join("\n"),
				);
			} else {
				toast.success("Stripe refund issued");
				setResultMessage("Stripe refund issued");
			}
			setStage("list");
			setSelectedChargeIds([]);
			setPagination({ pageIndex: 0, pageSize: 5 });
			setMode("full");
			setReason("requested_by_customer");
			setAmountsByChargeId({});
			setListError(null);
			setRefundError(null);
			await Promise.all([
				refetch(),
				refundablesQuery.refetch(),
				queryClient.invalidateQueries({
					queryKey: buildQueryKey(["customer", customerId]),
				}),
			]);
		},
		onError: (error) => {
			setRefundError(getBackendErr(error, "Failed to issue Stripe refund"));
		},
	});

	const summary: RefundPreviewSummary | null =
		previewQuery.data?.summary ?? null;
	const canContinue = selectedChargeIds.length > 0;
	const canIssueRefund =
		Boolean(summary) &&
		summary.totalRefundAmount > 0 &&
		!currencyMismatchMessage &&
		!refundMutation.isPending;

	const handleContinue = () => {
		if (selectedChargeIds.length === 0) {
			setListError("Select at least one charge to refund");
			return;
		}
		setListError(null);
		setRefundError(null);
		setResultMessage(null);
		setStage("refund");
	};

	const handleAmountChange = ({
		chargeId,
		value,
	}: {
		chargeId: string;
		value: string;
	}) => {
		setAmountsByChargeId((current) => ({
			...current,
			[chargeId]: value,
		}));
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-5xl gap-0 overflow-hidden bg-card p-0">
				<AnimatePresence mode="wait" initial={false}>
					{stage === "list" ? (
						<motion.div
							key="refund-list"
							{...STAGE_ANIMATION}
							className="flex flex-col"
						>
							<div className="border-b border-border px-6 py-5">
								<DialogHeader className="gap-1 text-left">
									<DialogTitle>Refund charge</DialogTitle>
									<DialogDescription>
										Select one or more successful Stripe charges to refund for
										this customer
									</DialogDescription>
								</DialogHeader>
							</div>
							<div className="space-y-4 px-6 py-5">
								{(resultMessage || listError || refundablesQuery.error) && (
									<InfoBox variant="warning">
										{resultMessage ||
											listError ||
											getBackendErr(
												refundablesQuery.error,
												"Failed to load refundable charges",
											)}
									</InfoBox>
								)}
								<RefundChargeTable
									charges={pageCharges}
									rowSelection={rowSelection}
									onRowSelectionChange={(updater) => {
										setListError(null);
										const nextSelection =
											typeof updater === "function"
												? updater(rowSelection)
												: updater;
										const pageChargeIds = new Set(
											pageCharges.map((charge) => charge.chargeId),
										);
										setSelectedChargeIds((current) => {
											const nextSelected = current.filter(
												(chargeId) => !pageChargeIds.has(chargeId),
											);
											for (const charge of pageCharges) {
												if (nextSelection[charge.chargeId]) {
													nextSelected.push(charge.chargeId);
												}
											}
											return [...new Set(nextSelected)];
										});
									}}
									emptyText={
										refundablesQuery.isLoading
											? "Loading refundable Stripe charges..."
											: "No refundable Stripe charges found"
									}
									pagination={pagination}
									onPaginationChange={setPagination}
									rowCount={refundablesQuery.data?.total ?? pageCharges.length}
								/>
							</div>
							<DialogFooter className="border-t border-border px-6 py-4 sm:justify-between">
								<div className="text-sm text-t3">
									{selectedCount > 0
										? `${selectedCount} charge${selectedCount === 1 ? "" : "s"} selected`
										: "Select charges to continue"}
								</div>
								<div className="flex flex-col-reverse gap-2 sm:flex-row">
									<Button
										variant="secondary"
										onClick={() => onOpenChange(false)}
									>
										Close
									</Button>
									<Button
										variant="primary"
										onClick={handleContinue}
										disabled={!canContinue}
									>
										Continue
									</Button>
								</div>
							</DialogFooter>
						</motion.div>
					) : (
						<motion.div
							key="refund-config"
							{...STAGE_ANIMATION}
							className="flex flex-col"
						>
							<div className="border-b border-border px-6 py-5">
								<DialogHeader className="gap-1 text-left">
									<button
										type="button"
										onClick={() => setStage("list")}
										className="mb-2 inline-flex items-center gap-1 text-sm text-t3 transition-colors hover:text-foreground"
									>
										<ArrowLeft size={14} />
										Back
									</button>
									<DialogTitle>Refund charge</DialogTitle>
									<DialogDescription>
										Configure Stripe refund amounts for the selected charges
									</DialogDescription>
								</DialogHeader>
							</div>
							<div className="space-y-4 px-6 py-5">
								<div className="grid gap-4 md:grid-cols-2">
									<div className="space-y-1.5">
										<span className="text-sm font-medium text-foreground">
											Refund mode
										</span>
										<SearchableSelect<RefundMode>
											value={mode}
											onValueChange={(value) => setMode(value as RefundMode)}
											options={["full", "custom"]}
											getOptionValue={(option) => option}
											getOptionLabel={(option) =>
												option === "full" ? "Full" : "Custom"
											}
										/>
									</div>
									<div className="space-y-1.5">
										<span className="text-sm font-medium text-foreground">
											Refund reason
										</span>
										<SearchableSelect<RefundReason>
											value={reason}
											onValueChange={(value) =>
												setReason(value as RefundReason)
											}
											options={REFUND_REASON_OPTIONS}
											getOptionValue={(option) => option}
											getOptionLabel={reasonLabel}
										/>
									</div>
								</div>
								<InfoBox variant="warning">
									This issues Stripe refunds only. It does not automatically
									cancel subscriptions or revoke Autumn access.
								</InfoBox>
								{currencyMismatchMessage && (
									<InfoBox variant="warning">{currencyMismatchMessage}</InfoBox>
								)}
								{refundError && (
									<InfoBox variant="warning">{refundError}</InfoBox>
								)}
								{previewQuery.error && (
									<InfoBox variant="warning">
										{getBackendErr(
											previewQuery.error,
											"Failed to preview refund",
										)}
									</InfoBox>
								)}
								<div className="overflow-hidden rounded-lg border border-border">
									<table className="w-full border-collapse text-sm">
										<thead className="bg-card">
											<tr className="border-b border-border text-left text-xs text-t4">
												<th className="px-4 py-2 font-medium">Source</th>
												<th className="px-4 py-2 font-medium">Created</th>
												<th className="px-4 py-2 font-medium">Paid</th>
												<th className="px-4 py-2 font-medium">
													Already refunded
												</th>
												<th className="px-4 py-2 font-medium">Refundable</th>
												<th className="px-4 py-2 font-medium">Refund now</th>
											</tr>
										</thead>
										<tbody className="divide-y bg-interactive-secondary">
											{refundCharges.map((charge) => {
												const sourceLink = getSourceLink({
													charge,
													env: customer?.env ?? AppEnv.Sandbox,
													accountId: stripeAccount?.id,
												});
												return (
													<tr key={charge.chargeId} className="text-t3">
														<td className="px-4 py-3 align-top">
															<div className="flex max-w-[240px] flex-col gap-1">
																<span className="truncate text-t2">
																	{charge.sourceLabel}
																</span>
																{sourceLink && (
																	<button
																		type="button"
																		onClick={() =>
																			window.open(sourceLink, "_blank")
																		}
																		className="text-left text-xs text-t4 underline-offset-2 hover:text-foreground hover:underline"
																	>
																		Open source in Stripe
																	</button>
																)}
															</div>
														</td>
														<td className="px-4 py-3 align-top text-sm text-t3">
															{new Date(charge.createdAt).toLocaleDateString()}
														</td>
														<td className="px-4 py-3 align-top text-sm text-t2">
															{formatMoney({
																amount: charge.amountPaid,
																currency: charge.currency,
															})}
														</td>
														<td className="px-4 py-3 align-top text-sm text-t3">
															{formatMoney({
																amount: charge.refundedAmount,
																currency: charge.currency,
															})}
														</td>
														<td className="px-4 py-3 align-top text-sm font-medium text-t2">
															{formatMoney({
																amount: charge.refundableAmount,
																currency: charge.currency,
															})}
														</td>
														<td className="px-4 py-3 align-top">
															<Input
																type="number"
																min="0"
																step="0.01"
																disabled={mode === "full"}
																value={
																	mode === "full"
																		? charge.refundableAmount.toString()
																		: (amountsByChargeId[charge.chargeId] ??
																			"0")
																}
																onChange={(event) =>
																	handleAmountChange({
																		chargeId: charge.chargeId,
																		value: event.target.value,
																	})
																}
																className="h-9 min-w-[110px]"
															/>
														</td>
													</tr>
												);
											})}
										</tbody>
									</table>
								</div>
								<div className="grid gap-3 rounded-lg border border-border bg-card p-4 md:grid-cols-4">
									<div>
										<div className="text-xs text-t4">Selected charges</div>
										<div className="mt-1 text-sm font-medium text-t2">
											{summary?.chargeCount ?? selectedChargeIds.length}
										</div>
									</div>
									<div>
										<div className="text-xs text-t4">Refunding now</div>
										<div className="mt-1 text-sm font-medium text-t2">
											{summary
												? formatMoney({
														amount: summary.totalRefundAmount,
														currency: summary.currency,
													})
												: "—"}
										</div>
									</div>
									<div>
										<div className="text-xs text-t4">Already refunded</div>
										<div className="mt-1 text-sm font-medium text-t2">
											{summary
												? formatMoney({
														amount: summary.totalRefundedAmount,
														currency: summary.currency,
													})
												: "—"}
										</div>
									</div>
									<div>
										<div className="text-xs text-t4">Refundable balance</div>
										<div className="mt-1 text-sm font-medium text-t2">
											{summary
												? formatMoney({
														amount: summary.totalRefundableAmount,
														currency: summary.currency,
													})
												: "—"}
										</div>
									</div>
								</div>
							</div>
							<DialogFooter className="border-t border-border px-6 py-4 sm:justify-between">
								<Button variant="secondary" onClick={() => setStage("list")}>
									Back
								</Button>
								<Button
									variant="primary"
									onClick={() => refundMutation.mutate()}
									isLoading={refundMutation.isPending}
									disabled={!canIssueRefund}
								>
									Issue refund
								</Button>
							</DialogFooter>
						</motion.div>
					)}
				</AnimatePresence>
			</DialogContent>
		</Dialog>
	);
};
