import type { Feature } from "@autumn/shared";
import {
	type VariantTarget,
	variantTargetMintsInSelection,
} from "../catalog/catalogPlanPreview";
import { PlanScopeTargetsStep } from "./PlanScopeTargetsStep";
import { TargetVersionSlugControl } from "./TargetVersionSlugControl";
import {
	effectiveMintSlug,
	type MintSlugSelection,
} from "./mintTargetSlugs";

export function VariantTargetsStep({
	features,
	targets,
	selectedKeys,
	slugSelection,
	onChange,
	onSlugChange,
	baseMintsNewVersion = false,
}: {
	features?: Feature[];
	targets: VariantTarget[];
	selectedKeys: string[];
	slugSelection?: MintSlugSelection;
	onChange: (next: string[]) => void;
	onSlugChange?: (args: { planId: string; slug: string }) => void;
	/** Base mint: the server resolves each variant's row, so no version picker. */
	baseMintsNewVersion?: boolean;
}) {
	return (
		<PlanScopeTargetsStep
			features={features}
			onChange={onChange}
			selectedKeys={selectedKeys}
			showVersionPicker={!baseMintsNewVersion}
			targets={targets}
			trailing={(target) => {
				if (
					!slugSelection ||
					!onSlugChange ||
					!variantTargetMintsInSelection({ target, selectedKeys })
				) {
					if (baseMintsNewVersion && !target.mintsNewVersion) {
						return (
							<span className="shrink-0 text-tertiary-foreground text-xs">
								updated in place
							</span>
						);
					}
					return null;
				}
				return (
					<TargetVersionSlugControl
						mintVersion={target.mintVersion}
						onChange={(slug) => onSlugChange({ planId: target.planId, slug })}
						slug={effectiveMintSlug({
							selection: slugSelection,
							planId: target.planId,
						})}
						takenSlugs={target.takenSlugs}
					/>
				);
			}}
		/>
	);
}
