import type { ApiPlanItemV1, ApiPlanV1, Feature } from "@autumn/shared";
import { composeMatchKey } from "@autumn/shared";
import { Card, CardContent, CardHeader } from "@autumn/ui";
import { type ReactNode, useState } from "react";
import { ItemStatusDot } from "@/components/v2/ItemStatusDot";
import { cn } from "@/lib/utils";
import { getFeatureIconConfig } from "@/views/products/features/utils/getFeatureIcon";
import { PlanItemSheet } from "./PlanItemSheet";

/** Item/price changes to overlay on the card as status dots. `added_items`
 * are new-or-changed item snapshots; `removed_items` render struck-through. */
export type PlanPreviewDiff = {
	added_items?: ApiPlanItemV1[];
	removed_items?: ApiPlanItemV1[];
	price?: ApiPlanV1["price"];
};

const isBareAmount = (value: string) =>
	/^-?[\d,]+(?:\.\d+)?$/.test(value.trim());

const featureDisplayName = (feature: Feature | undefined, featureId: string) =>
	feature?.display?.plural ?? feature?.name ?? featureId;

const itemPrimaryText = (item: ApiPlanItemV1, feature: Feature | undefined) => {
	const primaryText =
		item.display?.primary_text ??
		(item.unlimited ? "Unlimited" : `${item.included}`);
	if (!isBareAmount(primaryText)) return primaryText;
	return `${primaryText.trim()} ${featureDisplayName(feature, item.feature_id)}`;
};

/** One plan item row: feature icon + truncated primary text with the secondary
 * on its own line, and a trailing green/red status dot when it changed. */
const PlanItemRow = ({
	feature,
	item,
	status,
}: {
	feature?: Feature;
	item: ApiPlanItemV1;
	status?: "added" | "removed";
}) => {
	const [open, setOpen] = useState(false);
	const config = getFeatureIconConfig(
		feature?.type,
		feature?.config?.usage_type,
		14,
	);
	const removed = status === "removed";
	return (
		<>
			<button
				type="button"
				onClick={() => setOpen(true)}
				className="flex items-start gap-2 text-left text-xs hover:opacity-80"
			>
				{/* h-4 matches the primary line height so the icon centers on line 1. */}
				<span
					className={cn(
						"flex h-4 shrink-0 items-center",
						config.color,
						removed && "opacity-50",
					)}
				>
					{config.icon}
				</span>
				<span className="flex min-w-0 flex-1 flex-col leading-tight">
					<span
						className={cn(
							"truncate",
							removed
								? "text-tertiary-foreground line-through"
								: "text-foreground",
						)}
					>
						{itemPrimaryText(item, feature)}
					</span>
					{item.display?.secondary_text && (
						<span
							className={cn(
								"truncate text-[11px] text-tertiary-foreground",
								removed && "line-through",
							)}
						>
							{item.display.secondary_text}
						</span>
					)}
				</span>
				{status && (
					<span className="flex h-4 shrink-0 items-center">
						<ItemStatusDot state={status === "added" ? "new" : "removed"} />
					</span>
				)}
			</button>
			<PlanItemSheet
				feature={feature}
				item={item}
				onOpenChange={setOpen}
				open={open}
			/>
		</>
	);
};

/** Dotted backdrop the pricing cards sit on — shared by the catalog + billing
 * previews. */
export const PlansBackdrop = ({ children }: { children: ReactNode }) => (
	<div
		className="flex flex-wrap justify-center gap-2 rounded-xl border border-border/50 bg-card p-3 [--dot-color:rgba(0,0,0,0.15)] dark:[--dot-color:rgba(255,255,255,0.12)]"
		style={{
			backgroundImage:
				"radial-gradient(circle, var(--dot-color) 1px, transparent 1px)",
			backgroundSize: "16px 16px",
		}}
	>
		{children}
	</div>
);

/** A pricing card rendered directly off ApiPlanV1 — the server already resolves
 * each item's display text and the base price. Pass `diff` (from a catalog
 * preview) to mark changed/removed items with status dots. */
export const PlanPreviewCard = ({
	featuresById,
	plan,
	diff,
}: {
	featuresById: Map<string, Feature>;
	plan: ApiPlanV1;
	diff?: PlanPreviewDiff | null;
}) => {
	const priceText = plan.price?.display?.primary_text ?? "Free";
	const priceSecondary =
		plan.price?.display?.secondary_text ??
		(plan.price?.interval ? `per ${plan.price.interval}` : null);

	// Anything in added_items is new or changed (diffPlanV1 models a change as
	// remove-old + add-new); removed_items are full current-plan items for display.
	const addedKeys = new Set((diff?.added_items ?? []).map(composeMatchKey));
	const removed = diff?.removed_items ?? [];
	const priceChanged = diff != null && diff.price !== undefined;

	return (
		<Card className="flex w-[270px] flex-col gap-0 rounded-xl bg-interactive-secondary dark:bg-background">
			<CardHeader>
				<div className="flex items-center gap-2">
					<span className="font-medium text-foreground text-sm">
						{plan.name || plan.id}
					</span>
					{plan.auto_enable && (
						<span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-tertiary-foreground">
							Auto-enable
						</span>
					)}
				</div>
				<div className="flex items-center gap-1.5 pt-1">
					<div className="flex items-baseline gap-1">
						<span className="font-semibold text-foreground text-lg">
							{priceText}
						</span>
						{priceSecondary && (
							<span className="text-tertiary-foreground text-xs">
								{priceSecondary}
							</span>
						)}
					</div>
					{priceChanged && (
						<ItemStatusDot state={diff?.price === null ? "removed" : "new"} />
					)}
				</div>
			</CardHeader>
			<CardContent className="flex flex-col gap-1.5 pt-1">
				{plan.items.map((item) => (
					<PlanItemRow
						key={composeMatchKey(item)}
						feature={featuresById.get(item.feature_id)}
						item={item}
						status={addedKeys.has(composeMatchKey(item)) ? "added" : undefined}
					/>
				))}
				{removed.map((item) => (
					<PlanItemRow
						key={`removed-${composeMatchKey(item)}`}
						feature={featuresById.get(item.feature_id)}
						item={item}
						status="removed"
					/>
				))}
			</CardContent>
		</Card>
	);
};
