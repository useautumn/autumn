import {
	type AddPlanOp,
	formatAmount,
	formatInterval,
	type Operations,
	type UpdatePlanOp,
} from "@autumn/shared";
import { Separator } from "@autumn/ui";
import { CurrencyCircleDollarIcon, GitBranchIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { SubscriptionItemRow } from "@/components/forms/update-subscription-v2/components/SubscriptionItemRow";
import { ItemStatusDot } from "@/components/v2/ItemStatusDot";
import { FeatureIconCluster } from "@/components/v2/PlanItemLabel";
import { useOrg } from "@/hooks/common/useOrg";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import {
	filterToProductItem,
	getFilterSummary,
	type ItemFilter,
} from "../operations/operationItemUtils";
import { extractPlanIds } from "../operations/UpdatePlanOpForm";
import { migrationItemToProductItem } from "./migrationItemUtils";

/** Full-width row matching SubscriptionItemRow, with an amber dot for an edited value. */
function EditedRow({ icon, text }: { icon: ReactNode; text: ReactNode }) {
	return (
		<div className="flex items-center flex-1 min-w-0 h-10 px-3 rounded-xl input-base gap-2">
			<div className="flex flex-row items-center flex-1 gap-2 min-w-0 overflow-hidden">
				{icon}
				<p className="whitespace-nowrap truncate flex-1 min-w-0 text-body">
					{text}
				</p>
			</div>
			<span className="size-2 rounded-full shrink-0 bg-amber-500" />
		</div>
	);
}

/** A removal is a filter (feature + optional interval/billing method), not a
 * concrete item, so it has no quantity — show the matched feature, not "0". */
function RemovedFilterRow({ filter }: { filter: ItemFilter }) {
	const { features } = useFeaturesQuery();
	return (
		<div className="flex items-center gap-2">
			<div className="flex items-center flex-1 min-w-0 gap-2 py-1 opacity-50">
				<div className="flex flex-row items-center flex-1 gap-2 min-w-0 overflow-hidden">
					<FeatureIconCluster item={filterToProductItem(filter)} />
					<p className="whitespace-nowrap truncate flex-1 min-w-0 text-body">
						{getFilterSummary(filter, features)}
					</p>
				</div>
				<ItemStatusDot state="removed" />
			</div>
		</div>
	);
}

export function OperationsPreview({ operations }: { operations: Operations }) {
	const { products } = useProductsQuery({ allVersions: true });
	const { features } = useFeaturesQuery();
	const { org } = useOrg();
	const currency = org?.default_currency ?? "USD";
	const ops = operations.customer ?? [];

	if (ops.length === 0) return null;

	const planName = (id: string) =>
		products.find((p) => p.id === id)?.name ?? id;

	return (
		<div className="flex flex-col gap-3 min-w-0">
			<Separator />
			<div className="flex flex-col gap-3 min-w-0 max-h-72 overflow-y-auto">
				{ops.map((op, index) => {
					if (op.type === "add_plan") {
						const addOp = op as AddPlanOp;
						return (
							<div key={`op-${index}`} className="flex items-center gap-2">
								<span className="text-sm font-medium text-foreground">
									Add plan
								</span>
								<span className="text-xs text-tertiary-foreground">
									{planName(addOp.plan_id)}
								</span>
							</div>
						);
					}

					const updateOp = op as UpdatePlanOp;
					const planIds = extractPlanIds(updateOp.plan_filter.plan_id);
					const customize = updateOp.customize;
					const addItems = customize?.add_items ?? [];
					const removeItems = customize?.remove_items ?? [];

					return (
						<div key={`op-${index}`} className="flex flex-col gap-2 min-w-0">
							<div className="flex items-center gap-2 min-w-0">
								<span className="text-sm font-medium text-foreground whitespace-nowrap shrink-0">
									{planIds.length > 1 ? "Update plans" : "Update plan"}
								</span>
								{planIds.length > 0 && (
									<span className="text-xs text-tertiary-foreground truncate min-w-0">
										{planIds.map(planName).join(", ")}
									</span>
								)}
							</div>

							{updateOp.version !== undefined && (
								<EditedRow
									icon={
										<GitBranchIcon
											size={16}
											weight="duotone"
											className="text-violet-500 shrink-0"
										/>
									}
									text={`v${updateOp.version}`}
								/>
							)}

							{customize?.price !== undefined && (
								<EditedRow
									icon={
										<CurrencyCircleDollarIcon
											size={16}
											weight="duotone"
											className="text-yellow-500 shrink-0"
										/>
									}
									text={`${formatAmount({
										currency,
										amount: customize.price?.amount ?? 0,
										amountFormatOptions: {
											style: "currency",
											currencyDisplay: "narrowSymbol",
										},
									})} ${formatInterval({
										interval: customize.price?.interval ?? "month",
										intervalCount: 1,
									})}`}
								/>
							)}

							{addItems.map((item, idx) => (
								<SubscriptionItemRow
									key={`add-${idx}`}
									item={migrationItemToProductItem(item, features)}
									isCreated
								/>
							))}

							{removeItems.map((item, idx) => (
								<RemovedFilterRow
									key={`remove-${idx}`}
									filter={item as ItemFilter}
								/>
							))}
						</div>
					);
				})}
			</div>
		</div>
	);
}
