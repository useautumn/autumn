import { PackageIcon, XIcon } from "@phosphor-icons/react";
import { Checkbox } from "@/components/v2/checkboxes/Checkbox";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@/components/v2/dropdowns/DropdownMenu";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { cn } from "@/lib/utils";
import { getVersionCounts } from "@/utils/productUtils";
import { makePlanKey, parsePlanKey } from "../filters/filterRowTypes";

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

	const uniquePlans = products.filter(
		(plan, index) => products.findIndex((p) => p.id === plan.id) === index,
	);
	const nameById = new Map(uniquePlans.map((plan) => [plan.id, plan.name]));

	const isWhole = (planId: string) => values.includes(planId);
	const isVersion = (planId: string, version: number) =>
		values.includes(makePlanKey({ planId, version }));

	const toggleWhole = (planId: string) => {
		if (isWhole(planId)) {
			onChange(values.filter((key) => key !== planId));
			return;
		}
		// Whole plan supersedes any pinned versions of the same plan.
		const cleared = values.filter((key) => parsePlanKey(key).planId !== planId);
		onChange([...cleared, planId]);
	};

	const toggleVersion = (planId: string, version: number) => {
		const key = makePlanKey({ planId, version });
		if (values.includes(key)) {
			onChange(values.filter((existing) => existing !== key));
			return;
		}
		// A specific version supersedes the whole-plan pick.
		onChange([...values.filter((existing) => existing !== planId), key]);
	};

	const removeKey = (key: string) =>
		onChange(values.filter((existing) => existing !== key));

	const chipLabel = (key: string) => {
		const { planId, version } = parsePlanKey(key);
		const name = nameById.get(planId) ?? planId;
		return version === undefined ? name : `${name} v${version}`;
	};

	return (
		<div className={cn("min-w-0", className)}>
			<DropdownMenu defaultOpen={defaultOpen}>
				<DropdownMenuTrigger className="flex h-8 w-full min-w-0 cursor-pointer items-center gap-1.5 overflow-hidden rounded-xl px-3 input-base input-state-open-tiny text-sm">
					{values.length === 0 ? (
						<span className="text-tertiary-foreground">Select plans...</span>
					) : (
						<>
							{values.slice(0, MAX_VISIBLE_CHIPS).map((key) => (
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
							{values.length > MAX_VISIBLE_CHIPS && (
								<span className="shrink-0 px-1 text-sm text-tertiary-foreground">
									+{values.length - MAX_VISIBLE_CHIPS}
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
									isVersion(plan.id, version),
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
											<DropdownMenuItem
												className="flex cursor-pointer items-center gap-2 font-medium"
												closeOnClick={false}
												onClick={(e) => {
													e.preventDefault();
													toggleWhole(plan.id);
												}}
											>
												<Checkbox
													checked={isWhole(plan.id)}
													className="border-border"
												/>
												All versions
											</DropdownMenuItem>
											<DropdownMenuSeparator />
											{versions.map((version) => (
												<DropdownMenuItem
													className="flex cursor-pointer items-center gap-2 text-sm"
													closeOnClick={false}
													key={`${plan.id}:${version}`}
													onClick={(e) => {
														e.preventDefault();
														toggleVersion(plan.id, version);
													}}
												>
													<Checkbox
														checked={isVersion(plan.id, version)}
														indeterminate={
															isWhole(plan.id) && !isVersion(plan.id, version)
														}
														className="border-border"
													/>
													v{version}
												</DropdownMenuItem>
											))}
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
