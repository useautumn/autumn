import {
	type ApiPlanV1,
	AppEnv,
	type BillingPreviewChange,
	type BillingPreviewResponse,
} from "@autumn/shared";
import { Badge } from "@autumn/ui";
import {
	ArrowUpRightIcon,
	MinusCircleIcon,
	PlusCircleIcon,
} from "@phosphor-icons/react";
import { format } from "date-fns";
import { Link } from "react-router";
import { LineItemsPreview } from "@/components/v2/LineItemsPreview";
import { PreviewTotalsBlock } from "@/components/v2/preview-totals/PreviewTotalsBlock";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useEnv } from "@/utils/envUtils";
import { InfoBox } from "@/views/onboarding2/integrate/components/InfoBox";
import { BillingCustomizeDiff } from "./BillingCustomizeDiff";
import { billingActionBadges } from "./billingParams";
import { PlanPreviewCard, PlansBackdrop } from "./PlanPreviewCard";

const asString = (value: unknown): string | undefined =>
	typeof value === "string" && value ? value : undefined;

type SchedulePhase = {
	customize?: Record<string, unknown>;
	plans?: { customize?: Record<string, unknown>; plan_id?: string }[];
	starting_after?: string;
	starts_at?: string | number;
};

const phaseTiming = (phase: SchedulePhase, index: number) => {
	if (phase.starting_after) return `after ${phase.starting_after}`;
	if (phase.starts_at === "now" || (index === 0 && !phase.starts_at)) {
		return "now";
	}
	if (typeof phase.starts_at === "number") {
		return format(new Date(phase.starts_at), "MMM d, yyyy");
	}
	return String(phase.starts_at ?? "");
};

/** createSchedule's dated phases as compact rows: timing + plans (+ custom price). */
function SchedulePhases({ phases }: { phases: SchedulePhase[] }) {
	if (phases.length === 0) return null;
	return (
		<div className="flex flex-col gap-1 rounded-lg border border-border bg-card px-3 py-2.5">
			<span className="font-medium text-tertiary-foreground text-xs">
				Phases
			</span>
			{phases.map((phase, index) => (
				<div
					className="flex items-center gap-2 text-xs"
					key={`phase-${phaseTiming(phase, index)}-${index}`}
				>
					<Badge size="sm" variant="muted">
						{index + 1}
					</Badge>
					<span className="text-tertiary-foreground">
						{phaseTiming(phase, index)}
					</span>
					<span className="font-medium text-foreground">
						{(phase.plans ?? [])
							.map((plan) => {
								const price = (
									plan.customize as { price?: { amount?: number } } | undefined
								)?.price;
								return price?.amount != null
									? `${plan.plan_id} ($${price.amount.toLocaleString("en-US")})`
									: plan.plan_id;
							})
							.filter(Boolean)
							.join(", ")}
					</span>
				</div>
			))}
		</div>
	);
}

const changeName = (change: BillingPreviewChange) =>
	change.plan?.name || change.plan_id;

const hasPlan = (
	change: BillingPreviewChange,
): change is BillingPreviewChange & { plan: ApiPlanV1 } => Boolean(change.plan);

/** "Attaching X (and removing Y)" — mirrors the attach sheet's summary line. */
function BillingChangeSummary({
	incoming,
	outgoing,
}: {
	incoming: BillingPreviewChange[];
	outgoing: BillingPreviewChange[];
}) {
	return (
		<span>
			{incoming.length > 0 && (
				<>
					Attaching{" "}
					<PlusCircleIcon
						weight="fill"
						className="mr-1 inline size-3.5 align-middle text-green-500"
					/>
					<span className="font-medium text-foreground">
						{incoming.map(changeName).join(", ")}
					</span>
				</>
			)}
			{outgoing.length > 0 && (
				<>
					{incoming.length > 0 ? " and removing " : "Removing "}
					<MinusCircleIcon
						weight="fill"
						className="mr-1 inline size-3.5 align-middle text-red-500"
					/>
					<span className="font-medium text-foreground">
						{outgoing.map(changeName).join(", ")}
					</span>
				</>
			)}
		</span>
	);
}

/** A billing-action preview (attach / update subscription / create schedule),
 * rendered inline in the chat approval card: what's changing, the attached
 * plan's items, and the charges. Reuses the customer billing-sheet blocks. */
export function BillingPreviewCard({
	params,
	preview,
}: {
	params?: Record<string, unknown> | null;
	preview: BillingPreviewResponse;
}) {
	const { features } = useFeaturesQuery();
	const env = useEnv();
	const featuresById = new Map(
		features.map((feature) => [feature.id, feature]),
	);
	const incoming = preview.incoming ?? [];
	const outgoing = preview.outgoing ?? [];
	const incomingPlans = incoming.filter(hasPlan);
	const badges = billingActionBadges(params);

	const customize =
		params?.customize && typeof params.customize === "object"
			? (params.customize as Record<string, unknown>)
			: undefined;
	const phases = Array.isArray(params?.phases)
		? (params.phases as SchedulePhase[])
		: [];
	const nextCycle = preview.next_cycle;
	const totals = nextCycle
		? [
				{
					amount: nextCycle.total,
					badge: nextCycle.starts_at
						? format(new Date(nextCycle.starts_at), "MMM d, yyyy")
						: undefined,
					label: "Next Cycle",
					variant: "secondary" as const,
				},
			]
		: [];

	const customerId = asString(params?.customer_id) ?? preview.customer_id;
	const entityId = asString(params?.entity_id);
	const customerPath = customerId
		? `${env === AppEnv.Sandbox ? "/sandbox" : ""}/customers/${customerId}`
		: undefined;

	return (
		<div className="flex w-[480px] max-w-full flex-col gap-3">
			{customerPath && (
				<Link
					className="flex w-fit items-center gap-1 text-tertiary-foreground text-xs hover:text-foreground"
					to={customerPath}
				>
					{entityId ? (
						<span>
							Entity{" "}
							<span className="font-medium text-foreground">{entityId}</span> ·
							customer {customerId}
						</span>
					) : (
						<span>
							Customer{" "}
							<span className="font-medium text-foreground">{customerId}</span>
						</span>
					)}
					<ArrowUpRightIcon size={12} />
				</Link>
			)}

			{(incoming.length > 0 || outgoing.length > 0) && (
				<InfoBox variant="success">
					<BillingChangeSummary incoming={incoming} outgoing={outgoing} />
				</InfoBox>
			)}

			{badges.length > 0 && (
				<div className="flex flex-wrap gap-1.5">
					{badges.map((badge) => (
						<Badge
							className={
								badge.active
									? "border-transparent bg-green-500/10 text-green-500"
									: "border-transparent bg-red-500/10 text-red-500"
							}
							key={badge.label}
							size="sm"
							variant="muted"
						>
							{badge.label}
						</Badge>
					))}
				</div>
			)}

			{phases.length > 0 && <SchedulePhases phases={phases} />}

			{customize && (
				<BillingCustomizeDiff
					currentPlan={outgoing.find(hasPlan)?.plan}
					customize={customize}
				/>
			)}

			{incomingPlans.length > 0 && (
				<PlansBackdrop>
					{incomingPlans.map((change) => (
						<PlanPreviewCard
							key={change.plan_id}
							featuresById={featuresById}
							plan={change.plan}
						/>
					))}
				</PlansBackdrop>
			)}

			<div className="overflow-hidden rounded-lg border border-border bg-card">
				<LineItemsPreview
					currency={preview.currency}
					filterZeroAmounts
					lineItems={preview.line_items}
					totals={totals}
					withSeparator={false}
				/>
				{/* LineItemsPreview brings its own SheetSection padding — a second
				    stacked section doubles the gap, so pad the totals directly. */}
				<div className="px-4 pt-1 pb-4">
					<PreviewTotalsBlock previewData={preview} />
				</div>
			</div>
		</div>
	);
}
