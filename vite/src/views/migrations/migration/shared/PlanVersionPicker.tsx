import {
	Checkbox,
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@autumn/ui";
import { PackageIcon, XIcon } from "@phosphor-icons/react";
import { PlanVersionScopeItems } from "@/components/plans/PlanVersionScopeItems";
import {
	planScopeIncludesVersion,
	planScopeIsWholePlan,
	toggleWholePlan,
} from "@/components/plans/planScopeSelection";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { normalizePlanKeys, parsePlanKey } from "@/lib/planSelectionKeys";
import { cn } from "@/lib/utils";
import { getVersionCounts } from "@/utils/productUtils";

const MAX_VISIBLE_CHIPS = 3;

/**
 * Multi-select plan picker. A selection is either a whole plan (any version,
 * key `"<id>"`) or a specific version (key `"<id>:<v>"`). Whole-plan and
 * specific-version picks are mutually exclusive per plan.
 */
export function PlanVersionPicker({
	values,
	onChange,
	className,
	defaultOpen = false,
}: {
	values: string[];
	onChange: (next: string[]) => void;
	className?: string;
	defaultOpen?: boolean;
}) {
	const { products } = useProductsQuery();
	const versionCounts = getVersionCounts(products);
	const selectedKeys = normalizePlanKeys(values);

	const uniquePlans = products.filter(
		(plan, index) => products.findIndex((p) => p.id === plan.id) === index,
	);
	const nameById = new Map(uniquePlans.map((plan) => [plan.id, plan.name]));

	const isWhole = (planId: string) =>
		planScopeIsWholePlan({ selectedKeys, planId });

	const toggleWhole = (planId: string) =>
		onChange(toggleWholePlan({ selectedKeys, planId }));

	const removeKey = (key: string) =>
		onChange(selectedKeys.filter((existing) => existing !== key));

	const chipLabel = (key: string) => {
		const { planId, version } = parsePlanKey(key);
		const name = nameById.get(planId) ?? planId;
		return version === undefined ? name : `${name} v${version}`;
	};

	return (
		<div className={cn("min-w-0", className)}>
			<DropdownMenu defaultOpen={defaultOpen}>
				<DropdownMenuTrigger className="flex h-8 w-full min-w-0 cursor-pointer items-center gap-1.5 overflow-hidden rounded-xl px-3 input-base input-state-open-tiny text-sm">
					{selectedKeys.length === 0 ? (
						<span className="text-tertiary-foreground">Select plans...</span>
					) : (
						<>
							{selectedKeys.slice(0, MAX_VISIBLE_CHIPS).map((key) => (
								<span
									className="flex h-4.5 max-w-48 shrink-0 items-center gap-0.5 rounded border border-border bg-accent px-1 text-[10px] text-foreground"
									key={key}
								>
									<span className="shrink-0 [&_svg]:size-3">
										<PackageIcon
											className="text-tertiary-foreground"
											size={12}
											weight="duotone"
										/>
									</span>
									<span className="truncate">{chipLabel(key)}</span>
									<span
										className="ml-0.5 cursor-pointer text-tertiary-foreground hover:text-destructive"
										onClick={(e) => {
											e.stopPropagation();
											removeKey(key);
										}}
										onPointerDown={(e) => e.stopPropagation()}
									>
										<XIcon size={10} />
									</span>
								</span>
							))}
							{selectedKeys.length > MAX_VISIBLE_CHIPS && (
								<span className="shrink-0 px-1 text-sm text-tertiary-foreground">
									+{selectedKeys.length - MAX_VISIBLE_CHIPS}
								</span>
							)}
						</>
					)}
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start" className="w-64">
					{uniquePlans.length === 0 ? (
						<div className="px-2 py-3 text-center text-sm text-tertiary-foreground">
							No plans found
						</div>
					) : (
						<div className="max-h-72 overflow-y-auto">
							{uniquePlans.map((plan) => {
								const versionCount = versionCounts?.[plan.id] || 1;
								if (versionCount === 1)
									return (
										<DropdownMenuItem
											className="flex cursor-pointer items-center gap-2 font-medium"
											closeOnClick={false}
											key={plan.id}
											onClick={(e) => {
												e.preventDefault();
												toggleWhole(plan.id);
											}}
										>
											<Checkbox
												checked={isWhole(plan.id)}
												className="border-border"
											/>
											<span className="truncate">{plan.name}</span>
										</DropdownMenuItem>
									);

								const versions = Array.from(
									{ length: versionCount },
									(_, i) => i + 1,
								);
								const anyVersionPinned = versions.some((version) =>
									planScopeIncludesVersion({
										selectedKeys,
										planId: plan.id,
										version,
									}),
								);

								return (
									<DropdownMenuSub key={plan.id}>
										<DropdownMenuSubTrigger
											className="flex cursor-pointer items-center gap-2 font-medium"
											onClick={(e) => {
												e.preventDefault();
												toggleWhole(plan.id);
											}}
										>
											<Checkbox
												checked={isWhole(plan.id)}
												className="border-border"
												indeterminate={anyVersionPinned && !isWhole(plan.id)}
											/>
											<span className="truncate">{plan.name}</span>
										</DropdownMenuSubTrigger>
										<DropdownMenuSubContent>
											<PlanVersionScopeItems
												onChange={onChange}
												planId={plan.id}
												selectedKeys={selectedKeys}
												versions={versions}
											/>
										</DropdownMenuSubContent>
									</DropdownMenuSub>
								);
							})}
						</div>
					)}
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}
