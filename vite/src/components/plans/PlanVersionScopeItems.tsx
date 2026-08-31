import { Checkbox, DropdownMenuItem, DropdownMenuSeparator } from "@autumn/ui";
import type { ReactNode } from "react";
import {
	planScopeIncludesVersion,
	planScopeIsWholePlan,
	togglePlanVersion,
	toggleWholePlan,
} from "./planScopeSelection";

/**
 * The "All versions" + per-version checkbox items for one plan. Renders items
 * only, so it drops into a DropdownMenuContent or a DropdownMenuSubContent.
 */
export function PlanVersionScopeItems({
	planId,
	versions,
	selectedKeys,
	onChange,
	renderVersionSuffix,
	versionLabel,
}: {
	planId: string;
	versions: number[];
	selectedKeys: string[];
	onChange: (next: string[]) => void;
	renderVersionSuffix?: (version: number) => ReactNode;
	versionLabel?: (version: number) => string;
}) {
	const isWholePlan = planScopeIsWholePlan({ selectedKeys, planId });

	return (
		<>
			<DropdownMenuItem
				className="flex cursor-pointer items-center gap-2 font-medium"
				closeOnClick={false}
				onClick={(e) => {
					e.preventDefault();
					onChange(toggleWholePlan({ selectedKeys, planId }));
				}}
			>
				<Checkbox checked={isWholePlan} className="border-border" />
				All versions
			</DropdownMenuItem>
			<DropdownMenuSeparator />
			{versions.map((version) => (
				<DropdownMenuItem
					className="flex cursor-pointer items-center gap-2 text-sm"
					closeOnClick={false}
					key={`${planId}:${version}`}
					onClick={(e) => {
						e.preventDefault();
						onChange(togglePlanVersion({ selectedKeys, planId, version }));
					}}
				>
					<Checkbox
						checked={planScopeIncludesVersion({
							selectedKeys,
							planId,
							version,
						})}
						className="border-border"
						indeterminate={isWholePlan}
					/>
					<span className="flex-1">
						{versionLabel?.(version) ?? `v${version}`}
					</span>
					{renderVersionSuffix?.(version)}
				</DropdownMenuItem>
			))}
		</>
	);
}
