import {
	type FrontendProduct,
	FreeTrialDuration,
	productV2ToFrontendProduct,
	type SyncParamsV1,
	type SyncPhase,
	type SyncPlanInstance,
	type SyncProposalV2,
} from "@autumn/shared";
import {
	ArrowLeftIcon,
	ArrowSquareOutIcon,
	PlusIcon,
} from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import type Stripe from "stripe";
import { buildCustomize } from "@/components/forms/create-schedule/hooks/useCreateScheduleRequestBody";
import { ConfigRow } from "@/components/forms/shared/ConfigRow";
import {
	getProductWithSupportedPlanFormValues,
	getSupportedPlanFormPatchFromDraftProduct,
} from "@/components/forms/shared/utils/planCustomizationUtils";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/v2/buttons/Button";
import { InlinePlanEditor } from "@/components/v2/inline-custom-plan-editor/InlinePlanEditor";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useOrgStripeQuery } from "@/hooks/queries/useOrgStripeQuery";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { useEnv } from "@/utils/envUtils";
import {
	getStripeConnectViewAsLink,
	getStripeSubLink,
} from "@/utils/linkUtils";
import { useAdmin } from "@/views/admin/hooks/useAdmin";
import { useMasterStripeAccount } from "@/views/admin/hooks/useMasterStripeAccount";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { useCustomerContext } from "@/views/customers2/customer/CustomerContext";
import { type DraftPlan, SyncPlanRow } from "./SyncPlanRow";
import { applyCustomizeToProduct } from "./syncPlanRowUtils";

const generateKey = () =>
	`p_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

type DisplayItem = {
	key: string;
	name: string;
	priceLabel: string;
};

type PhaseSection = {
	phase: SyncPhase;
	displayItems: DisplayItem[];
};

const formatPriceAmount = ({
	unitAmount,
	billingScheme,
}: {
	unitAmount?: number | null;
	billingScheme?: string | null;
}): string => {
	if (billingScheme === "tiered") return "tiered";
	if (unitAmount === null || unitAmount === undefined) return "—";
	return `$${(unitAmount / 100).toFixed(2)}`;
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
			priceLabel: formatPriceAmount({
				unitAmount: item.price?.unit_amount,
				billingScheme: item.price?.billing_scheme,
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
			priceLabel: formatPriceAmount({
				unitAmount: expanded?.unit_amount,
				billingScheme: expanded?.billing_scheme,
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
						return findScheduleStartDateMs({ phase: schedulePhase }) <=
							Date.now();
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

const seedDraftPlansByPhase = ({
	proposal,
}: {
	proposal: SyncProposalV2;
}): DraftPlan[][] =>
	proposal.phases.map((phase) =>
		phase.plans.map((plan) => ({ ...plan, _key: generateKey() })),
	);

export function SubscriptionEditorView({
	proposal,
	customerId,
	onBack,
	onSubmit,
	isSubmitting,
}: {
	proposal: SyncProposalV2;
	customerId: string;
	onBack: () => void;
	onSubmit: (params: SyncParamsV1) => void;
	isSubmitting: boolean;
}) {
	const { products } = useProductsQuery();
	const { features } = useFeaturesQuery();
	const { customer } = useCusQuery();
	const entities = customer?.entities ?? [];

	const env = useEnv();
	const { stripeAccount } = useOrgStripeQuery();
	const { isAdmin } = useAdmin();
	const { masterStripeAccount } = useMasterStripeAccount();
	const { setIsInlineEditorOpen } = useCustomerContext();

	const handleOpenStripe = () => {
		const subId = proposal.stripe_subscription_id;
		if (!subId) return;
		const stripeAccountId = stripeAccount?.id;
		const masterStripeAccountId = masterStripeAccount?.id;
		const url =
			isAdmin && masterStripeAccountId && stripeAccountId
				? getStripeConnectViewAsLink({
						masterAccountId: masterStripeAccountId,
						connectedAccountId: stripeAccountId,
						env,
						path: `subscriptions/${subId}`,
					})
				: getStripeSubLink({
						subscriptionId: subId,
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

	const [draftPlansByPhase, setDraftPlansByPhase] = useState<DraftPlan[][]>(
		() => seedDraftPlansByPhase({ proposal }),
	);
	const [expirePrevious, setExpirePrevious] = useState<boolean>(true);
	const [editing, setEditing] = useState<{
		phaseIndex: number;
		planIndex: number;
	} | null>(null);

	const handlePlanChange = (
		phaseIndex: number,
		planIndex: number,
		next: DraftPlan,
	) => {
		setDraftPlansByPhase((prev) =>
			prev.map((plans, idx) => {
				if (idx !== phaseIndex) return plans;
				const updated = [...plans];
				updated[planIndex] = next;
				return updated;
			}),
		);
	};

	const handleAddPlan = (phaseIndex: number) => {
		setDraftPlansByPhase((prev) =>
			prev.map((plans, idx) => {
				if (idx !== phaseIndex) return plans;
				return [
					...plans,
					{
						_key: generateKey(),
						plan_id: "",
						quantity: 1,
						expire_previous: expirePrevious,
					},
				];
			}),
		);
	};

	const handleRemove = (phaseIndex: number, planIndex: number) => {
		setDraftPlansByPhase((prev) =>
			prev.map((plans, idx) => {
				if (idx !== phaseIndex) return plans;
				return plans.filter((_, i) => i !== planIndex);
			}),
		);
	};

	const handleStartCustomize = (phaseIndex: number, planIndex: number) => {
		setEditing({ phaseIndex, planIndex });
		setIsInlineEditorOpen(true);
	};

	const handleCancelCustomize = () => {
		setEditing(null);
		setIsInlineEditorOpen(false);
	};

	const editingProduct: FrontendProduct | null = useMemo(() => {
		if (editing === null || !products) return null;
		const plan = draftPlansByPhase[editing.phaseIndex]?.[editing.planIndex];
		if (!plan?.plan_id) return null;
		const productV2 = products.find((p) => p.id === plan.plan_id);
		if (!productV2) return null;

		const baseProduct = productV2ToFrontendProduct({ product: productV2 });
		const customize = plan.customize;
		if (!customize) return baseProduct;

		const customizedV2 = applyCustomizeToProduct({
			product: productV2,
			customize,
		});

		return getProductWithSupportedPlanFormValues({
			baseProduct,
			formValues: {
				items: customizedV2.items,
				version: undefined,
				trialLength: null,
				trialDuration: FreeTrialDuration.Day,
				trialEnabled: false,
				trialCardRequired: false,
			},
		});
	}, [editing, draftPlansByPhase, products]);

	const handleCustomizeSave = (draftProduct: FrontendProduct) => {
		if (editing === null || !products) {
			handleCancelCustomize();
			return;
		}
		const plan = draftPlansByPhase[editing.phaseIndex]?.[editing.planIndex];
		if (!plan?.plan_id) {
			handleCancelCustomize();
			return;
		}
		const productV2 = products.find((p) => p.id === plan.plan_id);
		if (!productV2) {
			handleCancelCustomize();
			return;
		}

		const baseProduct = productV2ToFrontendProduct({ product: productV2 });
		const patch = getSupportedPlanFormPatchFromDraftProduct({
			baseProduct,
			draftProduct,
		});

		const nextCustomize = patch.items
			? buildCustomize({ items: patch.items, features: features ?? [] })
			: undefined;

		const { phaseIndex, planIndex } = editing;
		setDraftPlansByPhase((prev) =>
			prev.map((plans, idx) => {
				if (idx !== phaseIndex) return plans;
				const updated = [...plans];
				updated[planIndex] = { ...plan, customize: nextCustomize };
				return updated;
			}),
		);
		handleCancelCustomize();
	};

	const handleSubmit = () => {
		const phases: SyncPhase[] = phaseSections
			.map((section, phaseIndex) => {
				const validPlans = (draftPlansByPhase[phaseIndex] ?? []).filter((p) =>
					Boolean(p.plan_id),
				);
				const planInstances: SyncPlanInstance[] = validPlans.map(
					({ _key: _ignore, ...rest }) => ({
						...rest,
						expire_previous: expirePrevious,
					}),
				);
				return { starts_at: section.phase.starts_at, plans: planInstances };
			})
			.filter((phase) => phase.plans.length > 0);

		if (phases.length === 0) return;

		const params: SyncParamsV1 = {
			customer_id: customerId,
			stripe_subscription_id: proposal.stripe_subscription_id,
			stripe_schedule_id: proposal.stripe_schedule_id,
			phases,
		};
		onSubmit(params);
	};

	const totalPlanInstances = draftPlansByPhase
		.flat()
		.filter((p) => p.plan_id)
		.reduce((acc, p) => acc + (p.quantity ?? 1), 0);

	return (
		<div className="flex flex-col flex-1 overflow-hidden">
			<div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
				<button
					type="button"
					onClick={onBack}
					className="flex items-center gap-1 text-xs text-t3 hover:text-t1"
				>
					<ArrowLeftIcon size={14} /> Back to subscriptions
				</button>

				<div className="space-y-1">
					<div className="text-xs text-t3">Stripe subscription</div>
					<div className="flex items-center gap-1.5">
						<code className="text-xs font-mono text-t1">
							{proposal.stripe_subscription_id}
						</code>
						{proposal.stripe_subscription_id && (
							<button
								type="button"
								onClick={handleOpenStripe}
								className="text-t4 hover:text-t2 transition-colors"
								aria-label="Open in Stripe"
							>
								<ArrowSquareOutIcon size={13} />
							</button>
						)}
					</div>
				</div>

				{phaseSections.map((section, phaseIndex) => {
					const phasePlans = draftPlansByPhase[phaseIndex] ?? [];
					const usedPlanIds = new Set(
						phasePlans.map((p) => p.plan_id).filter(Boolean) as string[],
					);

					return (
						<div
							key={`phase-${phaseIndex}-${section.phase.starts_at}`}
							className="space-y-3 pt-3 border-t border-border/40 first:pt-0 first:border-t-0"
						>
							{isMultiPhase && (
								<div className="flex items-center justify-between">
									<div className="text-xs font-medium text-t1">
										Phase {phaseIndex + 1}
									</div>
									<div className="text-xs text-t3">
										{formatPhaseStart(section.phase.starts_at)}
									</div>
								</div>
							)}

							{section.displayItems.length > 0 && (
								<div className="space-y-1">
									<div className="text-xs text-t3">Subscription items</div>
									<div className="space-y-1">
										{section.displayItems.map((item) => (
											<div
												key={item.key}
												className="flex items-center justify-between text-xs"
											>
												<span className="text-t1">{item.name}</span>
												<span className="text-t3">{item.priceLabel}</span>
											</div>
										))}
									</div>
								</div>
							)}

							<div className="space-y-2">
								<div className="text-xs text-t3">Autumn plans</div>
								{phasePlans.map((plan, planIndex) => (
									<SyncPlanRow
										key={plan._key}
										plan={plan}
										products={products ?? []}
										usedPlanIds={
											new Set(
												Array.from(usedPlanIds).filter(
													(id) => id !== plan.plan_id,
												),
											)
										}
										entities={entities}
										onChange={(next) =>
											handlePlanChange(phaseIndex, planIndex, next)
										}
										onRemove={() => handleRemove(phaseIndex, planIndex)}
										onCustomize={() =>
											handleStartCustomize(phaseIndex, planIndex)
										}
									/>
								))}
								<button
									type="button"
									onClick={() => handleAddPlan(phaseIndex)}
									className="flex items-center gap-1 text-xs text-t4 hover:text-t2 transition-colors py-1"
								>
									<PlusIcon size={11} />
									Add plan
								</button>
							</div>
						</div>
					);
				})}

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
			</div>

			<div className="flex items-center gap-2 px-4 py-3 border-t border-border/40">
				<Button variant="secondary" onClick={onBack} className="flex-1">
					Cancel
				</Button>
				<Button
					onClick={handleSubmit}
					disabled={totalPlanInstances === 0 || isSubmitting}
					isLoading={isSubmitting}
					className="flex-1"
				>
					Sync {totalPlanInstances}{" "}
					{totalPlanInstances === 1 ? "plan" : "plans"}
				</Button>
			</div>

			{editingProduct && (
				<InlinePlanEditor
					product={editingProduct}
					onSave={handleCustomizeSave}
					onCancel={handleCancelCustomize}
					isOpen={editing !== null}
				/>
			)}
		</div>
	);
}
