import {
	type Entity,
	type Feature,
	FreeTrialDuration,
	type FrontendProduct,
	type FullCusProduct,
	type FullCustomer,
	getProductItemDisplay,
	isCustomerProductTrialing,
	type ProductItem,
	type ProductV2,
	stripeToAtmnAmount,
	type UpdateSubscriptionV0Params,
} from "@autumn/shared";
import { Check, Copy, PencilSimple } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AxiosError } from "axios";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { AttachProductLineItems } from "@/components/forms/attach-product/attach-product-line-items";
import { AttachProductTotals } from "@/components/forms/attach-product/attach-product-totals";
import { useUpdateSubscriptionPreview } from "@/components/forms/update-subscription/use-update-subscription-preview";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/v2/buttons/Button";
import { IconButton } from "@/components/v2/buttons/IconButton";
import { LoadingShimmerText } from "@/components/v2/LoadingShimmerText";
import { SheetHeader } from "@/components/v2/sheets/InlineSheet";
import { useOrgStripeQuery } from "@/hooks/queries/useOrgStripeQuery";
import { usePrepaidItems } from "@/hooks/stores/useProductStore";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { useSubscriptionById } from "@/hooks/stores/useSubscriptionStore";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useEnv } from "@/utils/envUtils";
import { formatUnixToDateTime } from "@/utils/formatUtils/formatDateUtils";
import { pushPage } from "@/utils/genUtils";
import { getStripeInvoiceLink } from "@/utils/linkUtils";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";

/**
 * TEST SHEET: SubscriptionUpdateTestSheet
 *
 * This is an isolated test sheet for testing the subscription update flow.
 * It calls:
 * - POST /v1/subscriptions/preview_update - to get a billing plan preview
 * - POST /v1/subscriptions/update - to execute the update
 *
 * Usage: Open this sheet with an itemId (cusProduct id) and optional customizedProduct in data
 */

interface PrepaidEditorProps {
	prepaidItems: Array<{
		feature_id?: string | null;
		feature?: { internal_id: string } | undefined;
		billing_units?: number | null;
	}>;
	prepaidOptions: Record<string, number>;
	onPrepaidChange: (featureId: string, quantity: number) => void;
}

function PrepaidEditor({
	prepaidItems,
	prepaidOptions,
	onPrepaidChange,
}: PrepaidEditorProps) {
	if (prepaidItems.length === 0) return null;

	return (
		<div className="border-b border-border">
			<div className="px-4 py-2 border-b border-border">
				<h3 className="text-sm font-medium">Prepaid Quantities</h3>
			</div>
			<div className="px-4 py-3 space-y-2">
				{prepaidItems.map((item) => {
					const featureId = item.feature_id ?? item.feature?.internal_id ?? "";
					const billingUnits = item.billing_units ?? 1;
					const inputId = `prepaid-${featureId}`;
					return (
						<div key={featureId} className="flex items-center gap-3">
							<div className="flex-1">
								<label htmlFor={inputId} className="text-sm text-t-secondary">
									{featureId}
								</label>
								<span className="text-xs text-t-secondary ml-2">
									(billing_units: {billingUnits})
								</span>
							</div>
							<input
								id={inputId}
								type="number"
								min={0}
								value={prepaidOptions[featureId] ?? 0}
								onChange={(e) =>
									onPrepaidChange(featureId, parseInt(e.target.value, 10) || 0)
								}
								className="w-20 px-2 py-1 border border-border rounded text-sm bg-transparent"
							/>
						</div>
					);
				})}
			</div>
		</div>
	);
}

interface FreeTrialEditorProps {
	cusProduct: FullCusProduct;
	trialLength: number | null;
	trialDuration: FreeTrialDuration;
	trialCardRequired: boolean;
	removeTrial: boolean;
	onTrialLengthChange: (length: number | null) => void;
	onTrialDurationChange: (duration: FreeTrialDuration) => void;
	onTrialCardRequiredChange: (required: boolean) => void;
	onRemoveTrialChange: (remove: boolean) => void;
}

function FreeTrialEditor({
	cusProduct,
	trialLength,
	trialDuration,
	trialCardRequired,
	removeTrial,
	onTrialLengthChange,
	onTrialDurationChange,
	onTrialCardRequiredChange,
	onRemoveTrialChange,
}: FreeTrialEditorProps) {
	const isCurrentlyTrialing = isCustomerProductTrialing(cusProduct);

	return (
		<div className="border-b border-border">
			<div className="px-4 py-2 border-b border-border">
				<h3 className="text-sm font-medium">Free Trial</h3>
			</div>
			<div className="px-4 py-3 space-y-3">
				{/* Current Trial Status */}
				<div className="flex items-center gap-2">
					<span className="text-sm text-t-secondary">Current Status:</span>
					{isCurrentlyTrialing ? (
						<span className="text-xs px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded">
							Trialing (ends:{" "}
							{new Date(cusProduct.trial_ends_at!).toLocaleDateString()})
						</span>
					) : (
						<span className="text-xs px-2 py-0.5 bg-gray-500/20 text-gray-400 rounded">
							Not Trialing
						</span>
					)}
				</div>

				{/* Remove Trial (only show if currently trialing) */}
				{isCurrentlyTrialing ? (
					<div className="flex items-center gap-2">
						<input
							id="remove-trial"
							type="checkbox"
							checked={removeTrial}
							onChange={(e) => {
								onRemoveTrialChange(e.target.checked);
								if (e.target.checked) {
									onTrialLengthChange(null); // Clear new trial if removing
								}
							}}
							className="rounded border-border"
						/>
						<label htmlFor="remove-trial" className="text-sm text-red-400">
							Remove Trial (pass free_trial: null)
						</label>
					</div>
				) : null}

				{/* Set New Trial */}
				{!removeTrial ? (
					<>
						<div className="flex items-center gap-3">
							<label
								htmlFor="trial-length"
								className="text-sm text-t-secondary w-24"
							>
								Trial Length
							</label>
							<input
								id="trial-length"
								type="number"
								min={1}
								placeholder="e.g. 7"
								value={trialLength ?? ""}
								onChange={(e) =>
									onTrialLengthChange(
										e.target.value ? parseInt(e.target.value, 10) : null,
									)
								}
								className="w-20 px-2 py-1 border border-border rounded text-sm bg-transparent"
							/>
							<select
								id="trial-duration"
								value={trialDuration}
								onChange={(e) =>
									onTrialDurationChange(e.target.value as FreeTrialDuration)
								}
								className="px-2 py-1 border border-border rounded text-sm bg-transparent"
							>
								<option value={FreeTrialDuration.Day}>Day(s)</option>
								<option value={FreeTrialDuration.Month}>Month(s)</option>
								<option value={FreeTrialDuration.Year}>Year(s)</option>
							</select>
						</div>

						<div className="flex items-center gap-2">
							<input
								id="card-required"
								type="checkbox"
								checked={trialCardRequired}
								onChange={(e) => onTrialCardRequiredChange(e.target.checked)}
								className="rounded border-border"
							/>
							<label
								htmlFor="card-required"
								className="text-sm text-t-secondary"
							>
								Card Required
							</label>
						</div>
					</>
				) : null}

				{/* Preview of what will be sent */}
				<div className="text-xs text-t-secondary mt-2 pt-2 border-t border-border/50">
					{removeTrial ? (
						<span className="text-red-400">
							Will send: free_trial: null (removes trial)
						</span>
					) : trialLength ? (
						<span className="text-green-400">
							Will send: free_trial:{" "}
							{`{ length: ${trialLength}, duration: "${trialDuration}", card_required: ${trialCardRequired} }`}
						</span>
					) : (
						<span className="text-gray-400">
							No free_trial param (undefined) - existing trial preserved
						</span>
					)}
				</div>
			</div>
		</div>
	);
}

interface BillingPlanData {
	autumn?: {
		freeTrialPlan?: {
			freeTrial?: {
				length?: number;
				duration?: string;
			} | null;
			trialEndsAt?: number;
		};
		insertCustomerProducts?: Array<{
			product?: { name?: string };
			status?: string;
			starts_at?: number;
			trial_ends_at?: number;
			customer_entitlements?: Array<{
				feature_id?: string;
				balance?: number;
				next_reset_at?: number;
				entitlement?: { feature?: { name?: string } };
			}>;
		}>;
		updateCustomerProduct?: {
			customerProduct?: { product?: { name?: string } };
			updates?: Record<string, unknown>;
		};
		customPrices?: unknown[];
		customEntitlements?: unknown[];
	};
	stripe?: {
		subscriptionAction?: {
			type?: string;
			stripeSubscriptionId?: string;
			params?: {
				items?: Array<{
					id?: string;
					price?: string;
					quantity?: number;
					deleted?: boolean;
				}>;
				trial_end?: number | "now";
				proration_behavior?: string;
				cancel_at_period_end?: boolean;
			};
		};
		subscriptionScheduleAction?: {
			type?: string;
			stripeSubscriptionScheduleId?: string;
			params?: {
				customer?: string;
				start_date?: number | "now";
				end_behavior?: string;
				phases?: Array<{
					start_date?: number;
					end_date?: number;
					trial_end?: number;
					items?: Array<{
						price?: string;
						quantity?: number;
					}>;
				}>;
			};
		};
		invoiceAction?: {
			addLineParams?: {
				lines?: Array<{
					description?: string;
					amount?: number;
				}>;
			};
		};
		invoiceItemsAction?: {
			createInvoiceItems?: Array<{
				description?: string;
				amount?: number;
				customer?: string;
				subscription?: string;
			}>;
		};
	};
}

interface PreviewResultProps {
	data: unknown;
	isLoading: boolean;
	error: Error | null;
}

function PreviewResult({ data, isLoading, error }: PreviewResultProps) {
	const billingPlan = data as BillingPlanData | null;
	const [copied, setCopied] = useState(false);

	const handleCopy = () => {
		if (data) {
			navigator.clipboard.writeText(JSON.stringify(data, null, 2));
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		}
	};

	return (
		<div className="border-b border-border">
			<div className="px-4 py-2 border-b border-border flex items-center justify-between">
				<h3 className="text-sm font-medium">Billing Plan Preview</h3>
				{data ? (
					<button
						type="button"
						onClick={handleCopy}
						className="flex items-center gap-1 text-xs text-t-secondary hover:text-t-primary transition-colors"
					>
						{copied ? (
							<>
								<Check size={14} className="text-green-400" />
								<span className="text-green-400">Copied!</span>
							</>
						) : (
							<>
								<Copy size={14} />
								<span>Copy</span>
							</>
						)}
					</button>
				) : null}
			</div>

			{isLoading ? (
				<div className="px-4 py-3 text-sm text-t-secondary">
					Loading preview...
				</div>
			) : null}

			{error ? (
				<div className="px-4 py-3 text-sm text-red-400">
					Error: {error.message}
				</div>
			) : null}

			{!data && !isLoading && !error ? (
				<div className="px-4 py-3 text-sm text-t-secondary">
					No preview data yet
				</div>
			) : null}

			{billingPlan && !isLoading ? (
				<div className="divide-y divide-border">
					{/* Free Trial Plan */}
					{billingPlan.autumn?.freeTrialPlan ? (
						<div className="px-4 py-3 border-l-2 border-l-purple-500">
							<h4 className="text-xs font-semibold text-purple-400 mb-1">
								🎁 Free Trial Plan
							</h4>
							<div className="text-sm space-y-0.5">
								{billingPlan.autumn.freeTrialPlan.freeTrial ? (
									<div>
										<span className="text-t-secondary">Duration: </span>
										<span className="text-purple-400">
											{billingPlan.autumn.freeTrialPlan.freeTrial.length}{" "}
											{billingPlan.autumn.freeTrialPlan.freeTrial.duration}
											{Number(
												billingPlan.autumn.freeTrialPlan.freeTrial.length,
											) > 1
												? "s"
												: ""}
										</span>
									</div>
								) : null}
								{billingPlan.autumn.freeTrialPlan.trialEndsAt ? (
									<div>
										<span className="text-t-secondary">Trial ends at: </span>
										{(() => {
											const trialEndsFormatted = formatUnixToDateTime(
												billingPlan.autumn.freeTrialPlan.trialEndsAt,
											);
											return (
												<span className="text-purple-400">
													{trialEndsFormatted.date} {trialEndsFormatted.time}
												</span>
											);
										})()}
									</div>
								) : null}
							</div>
						</div>
					) : null}

					{/* Insert Customer Products */}
					{billingPlan.autumn?.insertCustomerProducts &&
					billingPlan.autumn.insertCustomerProducts.length > 0 ? (
						<div className="px-4 py-3 border-l-2 border-l-green-500">
							<h4 className="text-xs font-semibold text-green-400 mb-1">
								📥 Inserting Customer Product
							</h4>
							{billingPlan.autumn.insertCustomerProducts.map((cp, index) => {
								const startsAtFormatted = formatUnixToDateTime(cp.starts_at);
								const trialEndsAtFormatted = formatUnixToDateTime(
									cp.trial_ends_at,
								);
								return (
									<div key={index} className="text-sm">
										<div className="font-medium">
											{cp.product?.name || "Unknown Product"}
										</div>
										<div className="mt-1 text-xs text-t-secondary space-y-0.5">
											{cp.status ? (
												<div>
													<span className="font-medium">Status: </span>
													<span className="text-amber-400">{cp.status}</span>
												</div>
											) : null}
											{cp.starts_at ? (
												<div>
													<span className="font-medium">Starts at: </span>
													<span className="text-blue-400">
														{startsAtFormatted.date} {startsAtFormatted.time}
													</span>
												</div>
											) : null}
											{cp.trial_ends_at ? (
												<div>
													<span className="font-medium">Trial ends at: </span>
													<span className="text-purple-400">
														{trialEndsAtFormatted.date}{" "}
														{trialEndsAtFormatted.time}
													</span>
												</div>
											) : null}
											{cp.customer_entitlements &&
											cp.customer_entitlements.length > 0 ? (
												<div>
													<span className="font-medium">Entitlements:</span>
													<div className="pl-2 mt-0.5 space-y-0.5">
														{cp.customer_entitlements.map((ent, entIndex) => {
															const nextResetFormatted = ent.next_reset_at
																? formatUnixToDateTime(ent.next_reset_at)
																: null;
															return (
																<div
																	key={entIndex}
																	className="flex items-center gap-2"
																>
																	<span className="text-t-primary">
																		{ent.entitlement?.feature?.name ||
																			ent.feature_id}
																		: {ent.balance}
																	</span>
																	{nextResetFormatted ? (
																		<span className="text-t-secondary">
																			(resets:{" "}
																			<span className="text-blue-400">
																				{nextResetFormatted.date}{" "}
																				{nextResetFormatted.time}
																			</span>
																			)
																		</span>
																	) : null}
																</div>
															);
														})}
													</div>
												</div>
											) : null}
										</div>
									</div>
								);
							})}
						</div>
					) : null}

					{/* Update Customer Product */}
					{(() => {
						const updateCusProduct = billingPlan.autumn?.updateCustomerProduct;
						if (!updateCusProduct) return null;
						return (
							<div className="px-4 py-3 border-l-2 border-l-amber-500">
								<h4 className="text-xs font-semibold text-amber-400 mb-1">
									✏️ Updating Customer Product
								</h4>
								<div className="text-sm">
									<div className="font-medium">
										{updateCusProduct.customerProduct?.product?.name ||
											"Unknown Product"}
									</div>
									{updateCusProduct.updates ? (
										<div className="mt-1 text-xs text-t-secondary">
											<span className="font-medium">Updates: </span>
											<code className="text-amber-400">
												{JSON.stringify(updateCusProduct.updates)}
											</code>
										</div>
									) : null}
								</div>
							</div>
						);
					})()}

					{/* Stripe Subscription Action */}
					{billingPlan.stripe?.subscriptionAction ? (
						<div className="px-4 py-3 border-l-2 border-l-blue-500">
							<h4 className="text-xs font-semibold text-blue-400 mb-1">
								💳 Stripe Subscription Action
							</h4>
							<div className="text-sm flex items-center gap-3">
								<span>
									<span className="text-t-secondary">Type: </span>
									<span className="font-medium">
										{billingPlan.stripe.subscriptionAction.type || "none"}
									</span>
								</span>
								{billingPlan.stripe.subscriptionAction.stripeSubscriptionId ? (
									<span>
										<span className="text-t-secondary">Sub: </span>
										<code className="text-xs text-blue-400">
											{
												billingPlan.stripe.subscriptionAction
													.stripeSubscriptionId
											}
										</code>
									</span>
								) : null}
							</div>
							{/* Subscription Items */}
							{billingPlan.stripe.subscriptionAction.params?.items &&
							billingPlan.stripe.subscriptionAction.params.items.length > 0 ? (
								<div className="mt-2 space-y-1">
									<div className="text-xs text-t-secondary font-medium">
										Items:
									</div>
									{billingPlan.stripe.subscriptionAction.params.items.map(
										(item, index) => (
											<div
												key={index}
												className={`flex justify-between text-xs pl-2 border-l ${
													item.deleted
														? "border-red-500/30"
														: "border-blue-500/30"
												}`}
											>
												{item.deleted ? (
													<>
														<span className="text-red-400 font-mono">
															{item.id || "Unknown item"}
														</span>
														<span className="text-red-400">🗑️ delete</span>
													</>
												) : (
													<>
														<span className="text-t-primary font-mono">
															{item.price || item.id || "Unknown"}
														</span>
														<span className="text-blue-400">
															qty: {item.quantity ?? 1}
														</span>
													</>
												)}
											</div>
										),
									)}
								</div>
							) : null}
							{/* Other params */}
							{billingPlan.stripe.subscriptionAction.params?.trial_end ? (
								<div className="mt-1 text-xs text-t-secondary">
									<span>Trial ends: </span>
									<span className="text-green-400">
										{billingPlan.stripe.subscriptionAction.params.trial_end ===
										"now"
											? "now"
											: new Date(
													(billingPlan.stripe.subscriptionAction.params
														.trial_end as number) * 1000,
												).toLocaleDateString()}
									</span>
								</div>
							) : null}
							{billingPlan.stripe.subscriptionAction.params ? (
								<details className="mt-1">
									<summary className="text-xs cursor-pointer text-t-secondary hover:text-t-primary">
										View raw params
									</summary>
									<pre className="text-xs bg-t-50 p-2 rounded mt-1 overflow-auto max-h-32">
										{JSON.stringify(
											billingPlan.stripe.subscriptionAction.params,
											null,
											2,
										)}
									</pre>
								</details>
							) : null}
						</div>
					) : null}

					{/* Stripe Subscription Schedule Action */}
					{billingPlan.stripe?.subscriptionScheduleAction ? (
						<div className="px-4 py-3 border-l-2 border-l-cyan-500">
							<h4 className="text-xs font-semibold text-cyan-400 mb-1">
								📅 Stripe Subscription Schedule Action
							</h4>
							<div className="text-sm flex items-center gap-3 flex-wrap">
								<span>
									<span className="text-t-secondary">Type: </span>
									<span className="font-medium">
										{billingPlan.stripe.subscriptionScheduleAction.type ||
											"none"}
									</span>
								</span>
								{billingPlan.stripe.subscriptionScheduleAction
									.stripeSubscriptionScheduleId ? (
									<span>
										<span className="text-t-secondary">Schedule: </span>
										<code className="text-xs text-cyan-400">
											{
												billingPlan.stripe.subscriptionScheduleAction
													.stripeSubscriptionScheduleId
											}
										</code>
									</span>
								) : null}
							</div>
							{/* Schedule-level start_date */}
							{(() => {
								const scheduleParams =
									billingPlan.stripe.subscriptionScheduleAction.params;
								if (!scheduleParams) return null;
								const scheduleStartDate =
									typeof scheduleParams.start_date === "number"
										? formatUnixToDateTime(scheduleParams.start_date * 1000)
										: null;
								return (
									<div className="mt-1 text-xs space-y-0.5">
										{scheduleStartDate ? (
											<div>
												<span className="text-t-secondary">Starts: </span>
												<span className="text-cyan-400">
													{scheduleStartDate.date} {scheduleStartDate.time}
												</span>
											</div>
										) : scheduleParams.start_date === "now" ? (
											<div>
												<span className="text-t-secondary">Starts: </span>
												<span className="text-cyan-400">now</span>
											</div>
										) : null}
										{scheduleParams.end_behavior ? (
											<div>
												<span className="text-t-secondary">End behavior: </span>
												<span className="text-amber-400">
													{scheduleParams.end_behavior}
												</span>
											</div>
										) : null}
									</div>
								);
							})()}
							{/* Phases */}
							{billingPlan.stripe.subscriptionScheduleAction.params?.phases &&
							billingPlan.stripe.subscriptionScheduleAction.params.phases
								.length > 0 ? (
								<div className="mt-2 space-y-3">
									<div className="text-xs text-t-secondary font-medium">
										Phases:
									</div>
									{billingPlan.stripe.subscriptionScheduleAction.params.phases.map(
										(phase, phaseIndex) => {
											const startDate = phase.start_date
												? formatUnixToDateTime(phase.start_date * 1000)
												: null;
											const endDate = phase.end_date
												? formatUnixToDateTime(phase.end_date * 1000)
												: null;
											const trialEnd = phase.trial_end
												? formatUnixToDateTime(phase.trial_end * 1000)
												: null;
											return (
												<div
													key={phaseIndex}
													className="pl-2 border-l border-cyan-500/30"
												>
													<div className="text-xs font-medium text-cyan-400 mb-1">
														Phase {phaseIndex + 1}
														<span className="font-normal text-t-secondary">
															{" "}
															(
															{startDate
																? `${startDate.date} ${startDate.time}`
																: "schedule start"}
															{" → "}
															{endDate
																? `${endDate.date} ${endDate.time}`
																: "ongoing"}
															)
														</span>
													</div>
													{trialEnd ? (
														<div className="text-xs pl-2 mb-0.5">
															<span className="text-t-secondary">
																Trial ends:{" "}
															</span>
															<span className="text-purple-400">
																{trialEnd.date} {trialEnd.time}
															</span>
														</div>
													) : null}
													{phase.items && phase.items.length > 0 ? (
														<div className="space-y-0.5">
															{phase.items.map((item, itemIndex) => (
																<div
																	key={itemIndex}
																	className="flex justify-between text-xs pl-2"
																>
																	<span className="text-t-primary font-mono">
																		{item.price || "Unknown price"}
																	</span>
																	<span className="text-cyan-400">
																		qty: {item.quantity ?? 1}
																	</span>
																</div>
															))}
														</div>
													) : (
														<div className="text-xs text-t-secondary pl-2">
															No items
														</div>
													)}
												</div>
											);
										},
									)}
								</div>
							) : null}
							<details className="mt-1">
								<summary className="text-xs cursor-pointer text-t-secondary hover:text-t-primary">
									View raw params
								</summary>
								<pre className="text-xs bg-t-50 p-2 rounded mt-1 overflow-auto max-h-32">
									{JSON.stringify(
										billingPlan.stripe.subscriptionScheduleAction.params,
										null,
										2,
									)}
								</pre>
							</details>
						</div>
					) : null}

					{/* Stripe Invoice Action */}
					{billingPlan.stripe?.invoiceAction ? (
						<div className="px-4 py-3 border-l-2 border-l-purple-500">
							<h4 className="text-xs font-semibold text-purple-400 mb-1">
								🧾 Stripe Invoice Action
							</h4>

							{/* Immediate Line Items (addLineParams) */}
							{billingPlan.stripe.invoiceAction.addLineParams?.lines &&
							billingPlan.stripe.invoiceAction.addLineParams.lines.length >
								0 ? (
								<div className="mb-2">
									<div className="text-xs text-t-secondary font-medium mb-1">
										Immediate charges:
									</div>
									<div className="space-y-1 pl-2 border-l border-purple-500/30">
										{billingPlan.stripe.invoiceAction.addLineParams.lines.map(
											(
												line: {
													description?: string;
													amount?: number;
												},
												index: number,
											) => {
												const amount = line.amount
													? stripeToAtmnAmount({
															amount: line.amount,
															currency: "usd",
														})
													: 0;
												return (
													<div
														key={index}
														className="flex justify-between text-xs"
													>
														<span className="text-t-primary">
															{line.description || "Line item"}
														</span>
														<span
															className={
																amount >= 0 ? "text-green-400" : "text-red-400"
															}
														>
															${amount.toFixed(2)}
														</span>
													</div>
												);
											},
										)}
									</div>
								</div>
							) : (
								<div className="text-xs text-t-secondary mb-2">
									No immediate line items
								</div>
							)}

							<details className="mt-1">
								<summary className="text-xs cursor-pointer text-t-secondary hover:text-t-primary">
									View raw params
								</summary>
								<pre className="text-xs bg-t-50 p-2 rounded mt-1 overflow-auto max-h-32">
									{JSON.stringify(billingPlan.stripe.invoiceAction, null, 2)}
								</pre>
							</details>
						</div>
					) : null}

					{/* Stripe Invoice Items Action - Deferred charges added to next cycle */}
					{billingPlan.stripe?.invoiceItemsAction?.createInvoiceItems &&
					billingPlan.stripe.invoiceItemsAction.createInvoiceItems.length >
						0 ? (
						<div className="px-4 py-3 border-l-2 border-l-amber-500">
							<h4 className="text-xs font-semibold text-amber-400 mb-1">
								⏱️ Stripe Invoice Items Action (Added to next cycle)
							</h4>
							<div className="space-y-1 pl-2 border-l border-amber-500/30">
								{billingPlan.stripe.invoiceItemsAction.createInvoiceItems.map(
									(
										item: {
											description?: string;
											amount?: number;
											customer?: string;
											subscription?: string;
										},
										index: number,
									) => {
										const amount = item.amount
											? stripeToAtmnAmount({
													amount: item.amount,
													currency: "usd",
												})
											: 0;
										return (
											<div key={index} className="flex justify-between text-xs">
												<span className="text-t-primary">
													{item.description || "Invoice item"}
												</span>
												<span
													className={
														amount >= 0 ? "text-amber-400" : "text-red-400"
													}
												>
													${amount.toFixed(2)}
												</span>
											</div>
										);
									},
								)}
							</div>
							<div className="text-xs text-t-secondary mt-1 italic">
								These items will appear on the customer's next invoice
							</div>
							<details className="mt-1">
								<summary className="text-xs cursor-pointer text-t-secondary hover:text-t-primary">
									View raw params
								</summary>
								<pre className="text-xs bg-t-50 p-2 rounded mt-1 overflow-auto max-h-32">
									{JSON.stringify(
										billingPlan.stripe.invoiceItemsAction,
										null,
										2,
									)}
								</pre>
							</details>
						</div>
					) : null}

					{/* Empty Stripe section indicator */}
					{billingPlan.stripe &&
					!billingPlan.stripe.subscriptionAction &&
					!billingPlan.stripe.invoiceAction &&
					!billingPlan.stripe.invoiceItemsAction ? (
						<div className="px-4 py-2 text-xs text-t-secondary">
							No Stripe actions required
						</div>
					) : null}

					{/* Raw JSON toggle */}
					<details className="px-4 py-2 text-xs">
						<summary className="cursor-pointer text-t-secondary hover:text-t-primary">
							View raw JSON
						</summary>
						<pre className="bg-t-50 p-2 rounded mt-1 overflow-auto max-h-40">
							{JSON.stringify(data, null, 2)}
						</pre>
					</details>
				</div>
			) : null}
		</div>
	);
}

interface UpdateResultProps {
	data: unknown;
	isLoading: boolean;
	error: Error | null;
}

function UpdateResult({ data, isLoading, error }: UpdateResultProps) {
	if (!data && !isLoading && !error) return null;

	return (
		<div className="border-b border-border">
			<div className="px-4 py-2 border-b border-border">
				<h3 className="text-sm font-medium">Update Response</h3>
			</div>
			{isLoading ? (
				<div className="px-4 py-3 text-sm text-t-secondary">Updating...</div>
			) : null}
			{error ? (
				<div className="px-4 py-3 text-sm text-red-400">
					Error: {error.message}
				</div>
			) : null}
			{data !== null && data !== undefined && !isLoading ? (
				<div className="px-4 py-3 border-l-2 border-l-green-500">
					<div className="text-xs text-green-400 mb-1">✓ Success</div>
					<pre className="text-xs bg-t-50 p-2 rounded overflow-auto max-h-60">
						{JSON.stringify(data, null, 2)}
					</pre>
				</div>
			) : null}
		</div>
	);
}

function useSubscriptionUpdatePreview({
	body,
	enabled,
}: {
	body: UpdateSubscriptionV0Params | null;
	enabled: boolean;
}) {
	const axiosInstance = useAxiosInstance();

	// Debounce the body to avoid too many API calls
	const [debouncedBody, setDebouncedBody] = useState(body);

	useEffect(() => {
		const timer = setTimeout(() => {
			setDebouncedBody(body);
		}, 300);
		return () => clearTimeout(timer);
	}, [body]);

	const isDebouncing = JSON.stringify(body) !== JSON.stringify(debouncedBody);

	const query = useQuery({
		queryKey: [
			"subscription-update-preview-test",
			JSON.stringify(debouncedBody),
		],
		queryFn: async () => {
			if (!debouncedBody) return null;
			const response = await axiosInstance.post(
				"/v1/subscriptions/preview_update",
				debouncedBody,
			);
			return response.data;
		},
		enabled: enabled && !!debouncedBody,
		retry: false,
	});

	return {
		...query,
		isLoading: query.isLoading || isDebouncing,
	};
}

interface SubscriptionUpdateParams {
	body: UpdateSubscriptionV0Params;
	useInvoice?: boolean;
	enableProductImmediately?: boolean;
}

function useSubscriptionUpdate({
	customerId,
	onInvoiceCreated,
}: {
	customerId?: string;
	onInvoiceCreated?: (invoiceLink: string) => void;
}) {
	const axiosInstance = useAxiosInstance();
	const queryClient = useQueryClient();
	const { closeSheet } = useSheetStore();

	return useMutation({
		mutationFn: async ({
			body,
			useInvoice,
			enableProductImmediately,
		}: SubscriptionUpdateParams) => {
			const requestBody = {
				...body,
				invoice: useInvoice,
				enable_product_immediately: useInvoice
					? enableProductImmediately
					: undefined,
				finalize_invoice: useInvoice ? false : undefined,
				force_checkout:
					useInvoice && enableProductImmediately === false ? true : undefined,
			};

			const response = await axiosInstance.post(
				"/v1/subscriptions/update",
				requestBody,
			);
			return response.data;
		},
		onSuccess: (data) => {
			if (data?.invoice) {
				onInvoiceCreated?.(data.invoice);
				toast.success("Invoice created successfully");
			} else if (data?.checkout_url) {
				toast.success("Redirecting to checkout...");
				window.open(data.checkout_url, "_blank");
			} else {
				toast.success("Subscription updated successfully");
			}
			closeSheet();
			if (customerId) {
				queryClient.invalidateQueries({ queryKey: ["customer", customerId] });
			}
		},
		onError: (error) => {
			toast.error(
				(error as AxiosError<{ message: string }>)?.response?.data?.message ??
					"Failed to update subscription",
			);
			console.error("Update failed:", error);
		},
	});
}

function SheetContent({
	cusProduct,
	productV2,
	customizedProduct,
}: {
	cusProduct: FullCusProduct;
	productV2: ProductV2;
	customizedProduct: FrontendProduct | undefined;
}) {
	const navigate = useNavigate();
	const { customer, features } = useCusQuery();
	const customerId = customer?.id ?? customer?.internal_id;
	const entityId = cusProduct?.entity_id ?? undefined;

	// Stripe + invoice handling
	const { stripeAccount } = useOrgStripeQuery();
	const env = useEnv();

	const product = customizedProduct?.id ? customizedProduct : productV2;
	const { prepaidItems } = usePrepaidItems({ product });

	// Get display info for custom items
	const getItemDisplay = (item: ProductItem) => {
		return getProductItemDisplay({
			item,
			features: (features as Feature[]) ?? [],
			currency: "usd",
		});
	};

	// Handle Edit Plan - navigates to plan editor
	const handleEditPlan = () => {
		if (!cusProduct || !customer) return;

		const entity = (customer as FullCustomer).entities?.find(
			(e: Entity) =>
				e.internal_id === cusProduct.internal_entity_id ||
				e.id === cusProduct.entity_id,
		);

		pushPage({
			path: `/customers/${customer.id || customer.internal_id}/${cusProduct.product_id}`,
			queryParams: {
				id: cusProduct.id,
				entity_id: entity ? entity.id || entity.internal_id : undefined,
				version: String(cusProduct.product.version),
			},
			navigate,
		});
	};

	// Get initial prepaid values from the current subscription
	// Divide by billing_units to show values in "billing units" (e.g., 200 instead of 20000)
	const initialPrepaidOptions = useMemo(() => {
		return cusProduct.options.reduce(
			(acc, option) => {
				// Find the corresponding prepaid item to get billing_units
				const prepaidItem = prepaidItems.find(
					(item) =>
						(item.feature_id ?? item.feature?.internal_id) ===
						option.feature_id,
				);
				const billingUnits = prepaidItem?.billing_units ?? 1;
				// Divide by billing_units so input shows "200" not "20000"
				acc[option.feature_id] = Math.round(option.quantity / billingUnits);
				return acc;
			},
			{} as Record<string, number>,
		);
	}, [cusProduct.options, prepaidItems]);

	const [prepaidOptions, setPrepaidOptions] = useState<Record<string, number>>(
		initialPrepaidOptions,
	);

	const [planCustomStartDate, _setPlanCustomStartDate] = useState<
		number | null
	>(null);
	const [planCustomEndDate, _setPlanCustomEndDate] = useState<number | null>(
		null,
	);
	const [billingCycleAnchor, _setBillingCycleAnchor] = useState<number | null>(
		null,
	);

	// Free trial state
	const [trialLength, setTrialLength] = useState<number | null>(null);
	const [trialDuration, setTrialDuration] = useState<FreeTrialDuration>(
		FreeTrialDuration.Day,
	);
	const [trialCardRequired, setTrialCardRequired] = useState(true);
	const [removeTrial, setRemoveTrial] = useState(false);

	// Version update state
	const [targetVersion, setTargetVersion] = useState<number | null>(null);

	const handlePrepaidChange = (featureId: string, quantity: number) => {
		setPrepaidOptions((prev) => ({
			...prev,
			[featureId]: quantity,
		}));
	};

	// Build the request body
	const requestBody = useMemo<UpdateSubscriptionV0Params | null>(() => {
		if (!customerId) return null;

		const body: UpdateSubscriptionV0Params = {
			customer_id: customerId,
			product_id: product?.id,
			entity_id: entityId,
			customer_product_id: cusProduct.id ?? cusProduct.internal_product_id,
		};

		// Add options only if they have changed from initial values
		// Multiply by billing_units to match what useUpdateSubscriptionBodyBuilder does
		if (prepaidItems.length > 0) {
			const options = prepaidItems
				.map((item) => {
					const featureId = item.feature_id ?? item.feature?.internal_id ?? "";
					const inputQuantity = prepaidOptions[featureId];
					const initialQuantity = initialPrepaidOptions[featureId];
					const billingUnits = item.billing_units ?? 1;
					// Only include if changed from initial value
					if (
						inputQuantity !== undefined &&
						inputQuantity !== null &&
						featureId &&
						inputQuantity !== initialQuantity
					) {
						// Multiply by billing_units - input is in "billing units", API expects total quantity
						return {
							feature_id: featureId,
							quantity: inputQuantity * billingUnits,
						};
					}
					return null;
				})
				.filter(Boolean);

			if (options.length > 0) {
				body.options = options as Array<{
					feature_id: string;
					quantity: number;
				}>;
			}
		}

		// Add custom items if we have a customized product
		if (customizedProduct?.items) {
			body.items = customizedProduct.items;
		}

		// Add free trial logic:
		// 1. If removeTrial is true, pass null to remove the trial
		// 2. If trialLength is set, use the new trial settings
		// 3. If customizedProduct has free_trial, use that
		// 4. Otherwise, don't include free_trial (undefined = preserve existing)
		if (removeTrial) {
			body.free_trial = null;
		} else if (trialLength) {
			body.free_trial = {
				length: trialLength,
				duration: trialDuration,
				card_required: trialCardRequired,
			};
		}

		// Add custom plan dates if set (epoch milliseconds)
		if (planCustomStartDate) {
			body.plan_custom_start_date = planCustomStartDate;
		}
		if (planCustomEndDate) {
			body.plan_custom_end_date = planCustomEndDate;
		}
		if (billingCycleAnchor) {
			body.billing_cycle_anchor = billingCycleAnchor;
		}

		// Add version if set (for version updates)
		if (targetVersion !== null) {
			body.version = targetVersion;
		}

		return body;
	}, [
		customerId,
		product?.id,
		entityId,
		cusProduct.id,
		cusProduct.internal_product_id,
		prepaidItems,
		prepaidOptions,
		initialPrepaidOptions,
		customizedProduct?.items,
		customizedProduct?.free_trial,
		planCustomStartDate,
		planCustomEndDate,
		billingCycleAnchor,
		removeTrial,
		trialLength,
		trialDuration,
		trialCardRequired,
		targetVersion,
	]);

	// Preview query - fires when body changes
	const previewQuery = useSubscriptionUpdatePreview({
		body: requestBody,
		enabled: !!requestBody,
	});

	// Compute freeTrial value for preview
	const previewFreeTrial = useMemo(() => {
		if (removeTrial) {
			return null;
		}
		if (trialLength) {
			return {
				length: trialLength,
				duration: trialDuration,
				card_required: trialCardRequired,
				unique_fingerprint: false,
			};
		}
		return undefined;
	}, [removeTrial, trialLength, trialDuration, trialCardRequired]);

	// Checkout preview query with free trial support
	const checkoutPreviewQuery = useUpdateSubscriptionPreview({
		customerId,
		product,
		entityId,
		prepaidOptions: prepaidOptions ?? undefined,
		version: product?.version,
		freeTrial: previewFreeTrial,
	});

	// Update mutation with invoice handling
	const updateMutation = useSubscriptionUpdate({
		customerId,
		onInvoiceCreated: (stripeInvoice) => {
			const invoiceLink = getStripeInvoiceLink({
				stripeInvoice,
				env,
				accountId: stripeAccount?.id,
			});
			window.open(invoiceLink, "_blank");
		},
	});

	const handleConfirm = () => {
		if (!requestBody) return;
		updateMutation.mutate({ body: requestBody, useInvoice: false });
	};

	const handleInvoiceUpdate = ({
		enableProductImmediately,
	}: {
		enableProductImmediately: boolean;
	}) => {
		if (!requestBody) return;
		updateMutation.mutate({
			body: requestBody,
			useInvoice: true,
			enableProductImmediately,
		});
	};

	return (
		<div className="flex flex-col h-full">
			<SheetHeader
				title="Subscription Update Test"
				description={`Testing update for ${cusProduct.product.name}`}
			>
				<IconButton
					variant="primary"
					onClick={handleEditPlan}
					icon={<PencilSimple size={16} weight="duotone" />}
				>
					Edit Plan
				</IconButton>
			</SheetHeader>

			<div className="flex-1 overflow-y-auto">
				{/* Current Customer Product Options */}
				{cusProduct.options && cusProduct.options.length > 0 ? (
					<div className="border-b border-border">
						<div className="px-4 py-2 border-b border-border">
							<h3 className="text-sm font-medium">Current Options</h3>
						</div>
						<div className="px-4 py-3 space-y-1">
							{cusProduct.options.map((option) => (
								<div
									key={option.feature_id}
									className="flex justify-between text-sm"
								>
									<span className="text-t-secondary">{option.feature_id}</span>
									<span className="font-mono">{option.quantity}</span>
								</div>
							))}
						</div>
					</div>
				) : null}

				{/* Request Body Display */}
				<div className="border-b border-border">
					<div className="px-4 py-2 border-b border-border">
						<h3 className="text-sm font-medium">Request Body</h3>
					</div>
					<div className="px-4 py-3 text-sm space-y-1">
						<div>
							<span className="text-t-secondary">customer_id: </span>
							<code className="text-xs">{requestBody?.customer_id}</code>
						</div>
						<div>
							<span className="text-t-secondary">product_id: </span>
							<code className="text-xs">{requestBody?.product_id}</code>
						</div>
						{requestBody?.entity_id ? (
							<div>
								<span className="text-t-secondary">entity_id: </span>
								<code className="text-xs">{requestBody.entity_id}</code>
							</div>
						) : null}
						{requestBody?.options && requestBody.options.length > 0 ? (
							<div>
								<span className="text-t-secondary">options: </span>
								<code className="text-xs">
									{requestBody.options
										.map((o) => `${o.feature_id}: ${o.quantity}`)
										.join(", ")}
								</code>
							</div>
						) : null}
						{requestBody?.items && requestBody.items.length > 0 ? (
							<div>
								<span className="text-t-secondary">items: </span>
								<div className="mt-1 pl-3 space-y-1">
									{requestBody.items.map((item, index) => {
										const display = getItemDisplay(item as ProductItem);
										return (
											<div
												key={index}
												className="text-xs border-l-2 border-l-purple-500 pl-2"
											>
												<span className="text-t-primary">
													{display.primary_text}
												</span>
												{display.secondary_text ? (
													<span className="text-t-secondary ml-1">
														{display.secondary_text}
													</span>
												) : null}
											</div>
										);
									})}
								</div>
							</div>
						) : null}
						{requestBody?.free_trial === null ? (
							<div>
								<span className="text-t-secondary">free_trial: </span>
								<span className="text-xs text-red-400">
									null (removing trial)
								</span>
							</div>
						) : requestBody?.free_trial ? (
							<div>
								<span className="text-t-secondary">free_trial: </span>
								<span className="text-xs">
									<span className="text-green-400">
										{requestBody.free_trial.length}{" "}
										{requestBody.free_trial.duration}
										{Number(requestBody.free_trial.length) > 1 ? "s" : ""}
									</span>
									<span className="text-t-secondary ml-2">
										(card_required:{" "}
										{requestBody.free_trial.card_required ? "true" : "false"})
									</span>
								</span>
							</div>
						) : null}
						{requestBody?.plan_custom_start_date ? (
							<div>
								<span className="text-t-secondary">
									plan_custom_start_date:{" "}
								</span>
								<code className="text-xs text-amber-400">
									{requestBody.plan_custom_start_date}
								</code>
							</div>
						) : null}
						{requestBody?.plan_custom_end_date ? (
							<div>
								<span className="text-t-secondary">plan_custom_end_date: </span>
								<code className="text-xs text-amber-400">
									{requestBody.plan_custom_end_date}
								</code>
							</div>
						) : null}
						{requestBody?.billing_cycle_anchor ? (
							<div>
								<span className="text-t-secondary">billing_cycle_anchor: </span>
								<code className="text-xs text-cyan-400">
									{requestBody.billing_cycle_anchor}
								</code>
							</div>
						) : null}
						<details className="mt-2">
							<summary className="text-xs cursor-pointer text-t-secondary hover:text-t-primary">
								View raw JSON
							</summary>
							<pre className="text-xs bg-t-50 p-2 rounded mt-1 overflow-auto max-h-32">
								{JSON.stringify(requestBody, null, 2)}
							</pre>
						</details>
					</div>
				</div>

				{/* Prepaid Editor */}
				<PrepaidEditor
					prepaidItems={prepaidItems}
					prepaidOptions={prepaidOptions}
					onPrepaidChange={handlePrepaidChange}
				/>

				{/* Free Trial Editor */}
				<FreeTrialEditor
					cusProduct={cusProduct}
					trialLength={trialLength}
					trialDuration={trialDuration}
					trialCardRequired={trialCardRequired}
					removeTrial={removeTrial}
					onTrialLengthChange={setTrialLength}
					onTrialDurationChange={setTrialDuration}
					onTrialCardRequiredChange={setTrialCardRequired}
					onRemoveTrialChange={setRemoveTrial}
				/>

				{/* Version Update Editor */}
				<div className="border-b border-border">
					<div className="px-4 py-2 border-b border-border">
						<h3 className="text-sm font-medium">Version Update</h3>
					</div>
					<div className="px-4 py-3 space-y-3">
						<div className="flex items-center gap-2">
							<span className="text-sm text-t-secondary">Current Version:</span>
							<span className="text-xs px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded font-mono">
								{cusProduct.product.version}
							</span>
						</div>
						<div className="flex items-center gap-3">
							<label
								htmlFor="target-version"
								className="text-sm text-t-secondary"
							>
								Target Version:
							</label>
							<input
								id="target-version"
								type="number"
								min={1}
								placeholder="e.g. 2"
								value={targetVersion ?? ""}
								onChange={(e) => {
									const value = e.target.value;
									setTargetVersion(value === "" ? null : parseInt(value, 10));
								}}
								className="w-20 px-2 py-1 border border-border rounded text-sm bg-transparent font-mono"
							/>
							{targetVersion !== null && (
								<button
									type="button"
									onClick={() => setTargetVersion(null)}
									className="text-xs text-t-secondary hover:text-t-primary"
								>
									Clear
								</button>
							)}
						</div>
						<div className="text-xs text-t-secondary mt-2 pt-2 border-t border-border/50">
							{targetVersion !== null ? (
								<span className="text-green-400">
									Will send: version: {targetVersion}
								</span>
							) : (
								<span className="text-gray-400">
									No version param (quantity update only)
								</span>
							)}
						</div>
					</div>
				</div>

				{/* Checkout Preview Response (same as SubscriptionUpdateSheet) */}
				<div className="border-b border-border">
					<div className="px-4 py-2 border-b border-border">
						<h3 className="text-sm font-medium">Checkout Preview Response</h3>
					</div>
					{checkoutPreviewQuery.isLoading ? (
						<LoadingShimmerText
							text="Calculating totals"
							className="py-4 px-6"
						/>
					) : (
						<div className="py-4">
							<AttachProductLineItems previewData={checkoutPreviewQuery.data} />
							<AttachProductTotals previewData={checkoutPreviewQuery.data} />
						</div>
					)}
				</div>

				{/* Preview Result */}
				<PreviewResult
					data={previewQuery.data}
					isLoading={previewQuery.isLoading}
					error={previewQuery.error as Error | null}
				/>

				{/* Update Result */}
				<UpdateResult
					data={updateMutation.data}
					isLoading={updateMutation.isPending}
					error={updateMutation.error as Error | null}
				/>
			</div>

			{/* Footer Actions */}
			<div className="p-4 border-t flex flex-col gap-2">
				{/* Send an Invoice Button with Dropdown */}
				<Popover>
					<PopoverTrigger asChild>
						<Button
							variant="secondary"
							className="w-full"
							disabled={!requestBody || updateMutation.isPending}
						>
							Send an Invoice
						</Button>
					</PopoverTrigger>
					<PopoverContent className="w-80 p-0" align="start">
						<div className="flex flex-col">
							<button
								type="button"
								onClick={() =>
									handleInvoiceUpdate({ enableProductImmediately: true })
								}
								className="px-4 py-3 text-left text-sm hover:bg-accent"
							>
								<div className="font-medium">Enable plan immediately</div>
								<div className="text-xs text-muted-foreground">
									Enable the plan immediately and redirect to Stripe to finalize
									the invoice
								</div>
							</button>
							<button
								type="button"
								onClick={() =>
									handleInvoiceUpdate({ enableProductImmediately: false })
								}
								className="px-4 py-3 text-left text-sm hover:bg-accent border-t"
							>
								<div className="font-medium">Enable plan after payment</div>
								<div className="text-xs text-muted-foreground">
									Generate an invoice link for the customer. The plan will be
									enabled after they pay the invoice
								</div>
							</button>
						</div>
					</PopoverContent>
				</Popover>

				{/* Confirm Update Button */}
				<Button
					variant="primary"
					className="w-full"
					onClick={handleConfirm}
					disabled={!requestBody || updateMutation.isPending}
				>
					{updateMutation.isPending ? "Updating..." : "Confirm Update"}
				</Button>

				{/* Refresh Preview Button */}
				<Button
					variant="secondary"
					className="w-full"
					onClick={() => previewQuery.refetch()}
					disabled={!requestBody || previewQuery.isLoading}
				>
					Refresh Preview
				</Button>
			</div>
		</div>
	);
}

/**
 * Main sheet component.
 *
 * To use this sheet, you need to:
 * 1. Add "subscription-update-test" to the SheetType union in useSheetStore.ts
 * 2. Add a case for it in CustomerSheets.tsx
 * 3. Or, for quick testing, temporarily replace SubscriptionUpdateSheet import
 *
 * Example trigger:
 * setSheet({
 *   type: "subscription-update-test",
 *   itemId: cusProduct.id,
 *   data: { customizedProduct: product } // optional
 * })
 */
export function SubscriptionUpdateTestSheet() {
	const itemId = useSheetStore((s) => s.itemId);
	const sheetData = useSheetStore((s) => s.data);

	const { cusProduct, productV2 } = useSubscriptionById({ itemId });

	const customizedProduct = sheetData?.customizedProduct as
		| FrontendProduct
		| undefined;

	if (!cusProduct) {
		return (
			<div className="flex flex-col h-full">
				<SheetHeader
					title="Subscription Update Test"
					description="Loading..."
				/>
				<div className="p-4 text-sm text-t-secondary">
					No customer product found for itemId: {itemId}
				</div>
			</div>
		);
	}

	if (!productV2) {
		return (
			<div className="flex flex-col h-full">
				<SheetHeader
					title="Subscription Update Test"
					description="Loading product..."
				/>
			</div>
		);
	}

	return (
		<SheetContent
			cusProduct={cusProduct}
			productV2={productV2}
			customizedProduct={customizedProduct}
		/>
	);
}
