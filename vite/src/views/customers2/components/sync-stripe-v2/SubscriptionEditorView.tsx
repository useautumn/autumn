import type { SyncParamsV1, SyncPhase, SyncProposalV2 } from "@autumn/shared";
import {
	Button,
	SmallSpinner,
	Switch,
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@autumn/ui";
import { ArrowLeftIcon, ArrowSquareOutIcon } from "@phosphor-icons/react";
import { useStore } from "@tanstack/react-form";
import { useCallback, useMemo, useState } from "react";
import type Stripe from "stripe";
import { CustomerStateProvider } from "@/components/forms/customer-state/CustomerStateProvider";
import { CustomerStatePhasePlans } from "@/components/forms/customer-state/components/CustomerStatePhasePlans";
import { CustomerStatePlanEditor } from "@/components/forms/customer-state/components/CustomerStatePlanEditor";
import { CustomerStateUnscheduledPlans } from "@/components/forms/customer-state/components/CustomerStateUnscheduledPlans";
import type { PlanLocation } from "@/components/forms/customer-state/customerStateSchema";
import { useCustomerStateForm } from "@/components/forms/customer-state/useCustomerStateForm";
import { ConfigRow } from "@/components/forms/shared/ConfigRow";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useOrgStripeQuery } from "@/hooks/queries/useOrgStripeQuery";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { useEnv } from "@/utils/envUtils";
import {
	getStripeConnectViewAsLink,
	getStripeSubLink,
	getStripeSubScheduleLink,
} from "@/utils/linkUtils";
import { useAdmin } from "@/views/admin/hooks/useAdmin";
import { useMasterStripeAccount } from "@/views/admin/hooks/useMasterStripeAccount";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { useVerifyStripeQuery } from "@/views/customers2/components/verify-stripe/hooks/useVerifyStripeQuery";
import { useCustomerContext } from "@/views/customers2/customer/CustomerContext";
import { customerStateToSyncParams } from "./customerStateToSyncParams";
import { usePreviewSyncV2 } from "./hooks/usePreviewSyncV2";
import {
	isPlanPriceMissing,
	type StripeItemMark,
	stripeItemMark,
} from "./previewMismatches";
import { syncProposalToCustomerState } from "./syncProposalToCustomerState";

type DisplayItem = {
	key: string;
	name: string;
	priceLabel: string;
	stripePriceId: string;
};

type PhaseSection = {
	phase: SyncPhase;
	displayItems: DisplayItem[];
};

const formatPriceAmount = ({
	unitAmount,
	billingScheme,
	quantity,
}: {
	unitAmount?: number | null;
	billingScheme?: string | null;
	quantity?: number | null;
}): string => {
	if (billingScheme === "tiered") return "tiered";
	if (unitAmount === null || unitAmount === undefined) return "—";
	const amount = `$${(unitAmount / 100).toFixed(2)}`;
	return quantity && quantity > 1 ? `${amount} × ${quantity}` : amount;
};

const itemsFromStripeSubscription = ({
	sub,
}: {
	sub: Stripe.Subscription;
}): DisplayItem[] =>
	sub.items.data.map((item) => {
		const product = item.price?.product;
		const productName =
			typeof product === "object" && product && "name" in product
				? (product as { name: string }).name
				: (item.price?.id ?? "Unknown");
		return {
			key: item.id,
			name: productName,
			stripePriceId: item.price?.id ?? "",
			priceLabel: formatPriceAmount({
				unitAmount: item.price?.unit_amount,
				billingScheme: item.price?.billing_scheme,
				quantity: item.quantity,
			}),
		};
	});

const itemsFromSchedulePhase = ({
	phase,
	phaseIndex,
}: {
	phase: Stripe.SubscriptionSchedule.Phase;
	phaseIndex: number;
}): DisplayItem[] =>
	phase.items.map((item, itemIndex) => {
		const price = item.price as
			| string
			| (Stripe.Price & { product?: string | Stripe.Product })
			| undefined;
		const expanded = typeof price === "object" ? price : null;
		const priceId = typeof price === "string" ? price : (expanded?.id ?? "");
		const product = expanded?.product;
		const productName =
			typeof product === "object" && product && "name" in product
				? product.name
				: priceId || "Unknown";
		return {
			key: `${phaseIndex}:${itemIndex}`,
			name: productName,
			stripePriceId: priceId,
			priceLabel: formatPriceAmount({
				unitAmount: expanded?.unit_amount,
				billingScheme: expanded?.billing_scheme,
				quantity: item.quantity,
			}),
		};
	});

const formatPhaseStart = (startsAt: SyncPhase["starts_at"]): string => {
	if (startsAt === "now") return "Starts now";
	return `Starts ${new Date(startsAt).toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
		year: "numeric",
	})}`;
};

const findScheduleStartDateMs = ({
	phase,
}: {
	phase: Stripe.SubscriptionSchedule.Phase;
}) => phase.start_date * 1000;

const buildPhaseSections = ({
	proposal,
}: {
	proposal: SyncProposalV2;
}): PhaseSection[] => {
	const sub = proposal.stripe_subscription;
	const schedule = proposal.stripe_schedule;

	return proposal.phases.map((phase): PhaseSection => {
		// Map proposal phase → schedule phase by start_date when a schedule
		// exists, since the backend filters out phases with zero plans and
		// indices may not align. Fall back to subscription items for the
		// current phase when no schedule is attached.
		const matchingSchedulePhase = schedule
			? schedule.phases.find((schedulePhase) => {
					if (phase.starts_at === "now") {
						const endMs = schedulePhase.end_date
							? schedulePhase.end_date * 1000
							: Number.POSITIVE_INFINITY;
						return (
							findScheduleStartDateMs({ phase: schedulePhase }) <= Date.now() &&
							Date.now() < endMs
						);
					}
					return (
						findScheduleStartDateMs({ phase: schedulePhase }) ===
						phase.starts_at
					);
				})
			: undefined;

		if (matchingSchedulePhase && schedule) {
			const phaseIndex = schedule.phases.indexOf(matchingSchedulePhase);
			return {
				phase,
				displayItems: itemsFromSchedulePhase({
					phase: matchingSchedulePhase,
					phaseIndex,
				}),
			};
		}

		if (phase.starts_at === "now" && sub) {
			return { phase, displayItems: itemsFromStripeSubscription({ sub }) };
		}

		return { phase, displayItems: [] };
	});
};

const STRIPE_ITEM_MARKS: Record<
	StripeItemMark,
	{ label: string; className: string }
> = {
	linked: { label: "Linked", className: "bg-green-500" },
	links_on_sync: { label: "Links on sync", className: "bg-amber-500" },
	out_of_sync: { label: "Out of sync", className: "bg-red-500" },
};

function StripeItemMarkDot({ mark }: { mark: StripeItemMark | undefined }) {
	if (!mark) return null;
	const { label, className } = STRIPE_ITEM_MARKS[mark];
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<span
					role="img"
					aria-label={label}
					className={`size-1.5 shrink-0 rounded-full ${className}`}
				/>
			</TooltipTrigger>
			<TooltipContent side="top">{label}</TooltipContent>
		</Tooltip>
	);
}

type SubscriptionEditorProps = {
	proposal: SyncProposalV2;
	customerId: string;
	onBack: () => void;
	onSubmit: (params: SyncParamsV1) => void;
	isSubmitting: boolean;
};

/** The draft is seeded once off the customer's saved plans, so wait for them. */
export function SubscriptionEditorView(props: SubscriptionEditorProps) {
	const { isLoading } = useCusQuery();
	if (isLoading) {
		return (
			<div className="flex items-center justify-center py-12">
				<SmallSpinner size={20} className="text-tertiary-foreground" />
			</div>
		);
	}
	return <SubscriptionEditor {...props} />;
}

function SubscriptionEditor({
	proposal,
	customerId,
	onBack,
	onSubmit,
	isSubmitting,
}: SubscriptionEditorProps) {
	const { products } = useProductsQuery();
	const { features } = useFeaturesQuery();
	const { customer } = useCusQuery();
	const entities = customer?.entities ?? [];

	const env = useEnv();
	const { stripeAccount } = useOrgStripeQuery();
	const { isAdmin } = useAdmin();
	const { masterStripeAccount } = useMasterStripeAccount();
	const { entityId } = useCustomerContext();

	const handleOpenStripe = () => {
		const subId = proposal.stripe_subscription_id;
		const scheduleId = proposal.stripe_schedule_id;
		if (!subId && !scheduleId) return;
		const stripeAccountId = stripeAccount?.id;
		const masterStripeAccountId = masterStripeAccount?.id;
		const path = subId
			? `subscriptions/${subId}`
			: `subscription_schedules/${scheduleId}`;
		const url =
			isAdmin && masterStripeAccountId && stripeAccountId
				? getStripeConnectViewAsLink({
						masterAccountId: masterStripeAccountId,
						connectedAccountId: stripeAccountId,
						env,
						path,
					})
				: subId
					? getStripeSubLink({
							subscriptionId: subId,
							env,
							accountId: stripeAccountId,
						})
					: getStripeSubScheduleLink({
							scheduledId: scheduleId!,
							env,
							accountId: stripeAccountId,
						});
		window.open(url, "_blank");
	};

	const phaseSections = useMemo(
		() => buildPhaseSections({ proposal }),
		[proposal],
	);
	const isMultiPhase =
		(proposal.stripe_schedule?.phases.length ?? 0) > 1 &&
		phaseSections.length > 1;
	const isNotStartedSchedule =
		!proposal.stripe_subscription_id && Boolean(proposal.stripe_schedule_id);

	const [nowMs] = useState(Date.now);
	const [initialValues] = useState(() =>
		syncProposalToCustomerState({
			proposal,
			customerProducts: customer?.customer_products ?? [],
			entities,
			contextEntityId: entityId,
			products,
			features,
		}),
	);
	const form = useCustomerStateForm({ initialValues });
	const formValues = useStore(form.store, (state) => state.values);
	const [expirePrevious, setExpirePrevious] = useState<boolean>(true);
	const [carryOverUsage, setCarryOverUsage] = useState<boolean>(true);

	const syncParams = customerStateToSyncParams({
		customerId,
		proposal,
		formValues,
		products,
		features,
		expirePrevious,
		carryOverUsage,
	});
	const { mismatches: previewMismatches } = usePreviewSyncV2({
		params: syncParams,
	});
	const { subscriptions: verifiedSubscriptions } = useVerifyStripeQuery();
	const todayMismatches = verifiedSubscriptions.find(
		(subscription) =>
			subscription.stripe_subscription_id === proposal.stripe_subscription_id,
	)?.mismatches;

	const handleIsPlanNotFound = useCallback(
		(location: PlanLocation) => {
			const isUnscheduled = location.location === "unscheduled";
			const plan = isUnscheduled
				? formValues.unscheduledPlans[location.planIndex]
				: formValues.phases[location.phaseIndex]?.plans[location.planIndex];
			// Unscheduled plans bill alongside the first phase.
			const phase = proposal.phases[isUnscheduled ? 0 : location.phaseIndex];
			if (!plan?.productId || !phase) return false;
			return isPlanPriceMissing({
				previewMismatches,
				planId: plan.productId,
				startsAt: phase.starts_at,
			});
		},
		[formValues, proposal, previewMismatches],
	);

	const totalPlanInstances = [
		...(syncParams?.phases ?? []).flatMap((phase) => phase.plans),
		...(syncParams?.unscheduled_plans ?? []),
	].reduce((total, plan) => total + (plan.quantity ?? 1), 0);

	return (
		<CustomerStateProvider
			form={form}
			nowMs={nowMs}
			// Unscheduled plans ride on a live subscription across its phases.
			canMakeUnscheduled={
				isMultiPhase && Boolean(proposal.stripe_subscription_id)
			}
			isPlanNotFound={handleIsPlanNotFound}
		>
			<div className="flex flex-col flex-1 overflow-hidden">
				<div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
					<button
						type="button"
						onClick={onBack}
						className="flex items-center gap-1 text-xs text-tertiary-foreground hover:text-foreground"
					>
						<ArrowLeftIcon size={14} /> Back to subscriptions
					</button>

					<div className="space-y-1">
						<div className="text-xs text-tertiary-foreground">
							{proposal.stripe_subscription_id
								? "Stripe subscription"
								: "Stripe schedule"}
						</div>
						<div className="flex items-center gap-1.5">
							<code className="text-xs font-mono text-foreground">
								{proposal.stripe_subscription_id ?? proposal.stripe_schedule_id}
							</code>
							{(proposal.stripe_subscription_id ||
								proposal.stripe_schedule_id) && (
								<button
									type="button"
									onClick={handleOpenStripe}
									className="text-subtle hover:text-muted-foreground transition-colors"
									aria-label="Open in Stripe"
								>
									<ArrowSquareOutIcon size={13} />
								</button>
							)}
						</div>
					</div>

					{phaseSections.map((section, phaseIndex) => (
						<div
							key={`phase-${phaseIndex}-${section.phase.starts_at}`}
							className="space-y-3 pt-3 border-t border-border/40 first:pt-0 first:border-t-0"
						>
							{isMultiPhase && (
								<div className="flex items-center justify-between">
									<div className="text-xs font-medium text-foreground">
										Phase {phaseIndex + 1}
									</div>
									<div className="text-xs text-tertiary-foreground">
										{formatPhaseStart(section.phase.starts_at)}
									</div>
								</div>
							)}

							{section.displayItems.length > 0 && (
								<div className="space-y-1">
									<div className="text-xs text-tertiary-foreground">
										Subscription items
									</div>
									<div className="space-y-1">
										{section.displayItems.map((item) => (
											<div
												key={item.key}
												className="flex items-center justify-between text-xs"
											>
												<span className="flex min-w-0 items-center gap-1.5 text-foreground">
													<span className="truncate">{item.name}</span>
													<StripeItemMarkDot
														mark={stripeItemMark({
															todayMismatches,
															previewMismatches,
															stripePriceId: item.stripePriceId,
															startsAt: section.phase.starts_at,
														})}
													/>
												</span>
												<span className="text-tertiary-foreground">
													{item.priceLabel}
												</span>
											</div>
										))}
									</div>
								</div>
							)}

							<div className="space-y-2">
								<div className="text-xs text-tertiary-foreground">
									Autumn plans
								</div>
								<CustomerStatePhasePlans phaseIndex={phaseIndex} />
							</div>
						</div>
					))}

					<div className="pt-3 border-t border-border/40 empty:hidden">
						<CustomerStateUnscheduledPlans />
					</div>

					<ConfigRow
						title="Expire current plans"
						description="End any active customer products in the same group when the sync runs."
						action={
							<Switch
								checked={expirePrevious}
								onCheckedChange={(checked) => setExpirePrevious(!!checked)}
							/>
						}
					/>
					{expirePrevious && (
						<ConfigRow
							title="Carry over usage"
							description="Move the expired plan's used balances onto the new plan for any shared feature."
							action={
								<Switch
									checked={carryOverUsage}
									onCheckedChange={(checked) => setCarryOverUsage(!!checked)}
								/>
							}
						/>
					)}
					{isNotStartedSchedule && (
						<ConfigRow
							title="Enable plan immediately"
							description="Grant access now while billing still starts when the Stripe schedule begins."
							action={
								<Switch
									checked={formValues.enablePlanImmediately}
									onCheckedChange={(checked) =>
										form.setFieldValue("enablePlanImmediately", !!checked)
									}
								/>
							}
						/>
					)}
				</div>

				<div className="flex items-center gap-2 px-4 py-3 border-t border-border/40">
					<Button variant="secondary" onClick={onBack} className="flex-1">
						Cancel
					</Button>
					<Button
						onClick={() => syncParams && onSubmit(syncParams)}
						disabled={!syncParams || isSubmitting}
						isLoading={isSubmitting}
						className="flex-1"
					>
						Sync {totalPlanInstances}{" "}
						{totalPlanInstances === 1 ? "plan" : "plans"}
					</Button>
				</div>

				<CustomerStatePlanEditor />
			</div>
		</CustomerStateProvider>
	);
}
