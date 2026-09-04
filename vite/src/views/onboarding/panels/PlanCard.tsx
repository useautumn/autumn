import { productV2ToFrontendProduct } from "@autumn/shared";
import { ArrowUpRightIcon, UserFocusIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { Link } from "react-router";
import { PlanTypeBadges } from "@/components/v2/badges/PlanTypeBadges";
import { PlanItemLabel } from "@/components/v2/PlanItemLabel";
import { pushPage } from "@/utils/genUtils";
import { getBasePriceDisplay } from "@/utils/product/basePriceDisplayUtils";
import { type PlanCardModel, visiblePlanItems } from "./catalogGrouping";
import { PlanVariantSelect } from "./PlanVariantSelect";

export function PlanCard({
	card,
	currency,
}: {
	card: PlanCardModel;
	currency?: string;
}) {
	const options = [card.plan, ...card.variants];
	const [selectedId, setSelectedId] = useState(card.plan.id);
	const plan = options.find((option) => option.id === selectedId) ?? card.plan;

	// Items follow the selection — a variant's whole point is that its terms differ.
	const isBase = plan.id === card.plan.id;
	const { items, hiddenItemCount } = isBase
		? { items: card.items, hiddenItemCount: card.hiddenItemCount }
		: visiblePlanItems({ items: plan.items ?? [] });

	const price = getBasePriceDisplay({
		product: productV2ToFrontendProduct({ product: plan }),
		currency,
	});

	return (
		<div className="flex h-full min-w-0 flex-col gap-2 rounded-lg border bg-interactive-secondary p-3">
			<div className="flex min-w-0 items-start gap-1.5">
				<div className="flex min-w-0 flex-col gap-0.5">
					<Link
						to={pushPage({ path: `/products/${plan.id}` })}
						className="group flex min-w-0 items-center gap-1 rounded-sm"
					>
						<span className="truncate text-xs font-medium text-foreground">
							{card.plan.name}
						</span>
						<ArrowUpRightIcon
							size={10}
							className="shrink-0 text-subtle opacity-0 transition-opacity group-hover:opacity-100"
						/>
					</Link>
					<div className="flex items-center gap-1.5">
						<span className="text-xs text-tertiary-foreground">
							{price.displayText}
						</span>
						{/* Add-on is implied by the section label, so it's suppressed here. */}
						<PlanTypeBadges product={{ ...plan, is_add_on: false }} size="sm" />
					</div>
				</div>

				{card.variants.length > 0 && (
					<div className="ml-auto shrink-0">
						<PlanVariantSelect
							options={options}
							selectedId={selectedId}
							onSelect={setSelectedId}
						/>
					</div>
				)}
			</div>

			{(items.length > 0 || card.licenses.length > 0) && (
				<div className="flex min-w-0 flex-col gap-1">
					{items.map((item, index) => (
						<div
							key={`${item.feature_id ?? "price"}-${index}`}
							className="flex min-w-0 items-center gap-1.5"
						>
							<PlanItemLabel item={item} compact />
						</div>
					))}

					{card.licenses.map((license) => (
						<div
							key={license.id}
							className="flex min-w-0 items-center gap-1.5 text-tiny text-tertiary-foreground"
						>
							<UserFocusIcon
								size={12}
								weight="duotone"
								className="shrink-0 text-blue-500"
							/>
							<span className="truncate">
								{license.included > 0
									? `${license.included} × ${license.name}`
									: license.name}
							</span>
						</div>
					))}

					{hiddenItemCount > 0 && (
						<span className="text-tiny text-subtle">
							+{hiddenItemCount} more
						</span>
					)}
				</div>
			)}
		</div>
	);
}
