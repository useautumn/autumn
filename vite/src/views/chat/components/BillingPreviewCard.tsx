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
import { Link } from "react-router";
import { LineItemsPreview } from "@/components/v2/LineItemsPreview";
import { PreviewTotalsBlock } from "@/components/v2/preview-totals/PreviewTotalsBlock";
import { SheetSection } from "@/components/v2/sheets/SharedSheetComponents";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useEnv } from "@/utils/envUtils";
import { InfoBox } from "@/views/onboarding2/integrate/components/InfoBox";
import { billingActionBadges } from "./billingParams";
import { PlanPreviewCard, PlansBackdrop } from "./PlanPreviewCard";

const asString = (value: unknown): string | undefined =>
	typeof value === "string" && value ? value : undefined;

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
					withSeparator={false}
				/>
				<SheetSection withSeparator={false}>
					<PreviewTotalsBlock previewData={preview} />
				</SheetSection>
			</div>
		</div>
	);
}
