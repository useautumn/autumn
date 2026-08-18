import type { Feature } from "@autumn/shared";
import { ItemChangeList } from "@/components/v2/ItemChangeList";
import {
	type CatalogPlanChangeDiff,
	catalogTargetDiffHasChanges,
} from "../catalog/catalogPlanPreview";
import { LicenseChangeList } from "./LicenseChangeList";

export function TargetDiffPreview({
	diff,
	emptyLabel,
	features,
	showSettings = false,
}: {
	diff: CatalogPlanChangeDiff;
	emptyLabel: string;
	features?: Feature[];
	showSettings?: boolean;
}) {
	const settingChanges = showSettings ? diff.settingChanges : [];
	if (
		!catalogTargetDiffHasChanges({
			...diff,
			settingChanges,
		})
	) {
		return (
			<span className="text-tertiary-foreground/70 text-xs italic">
				{emptyLabel}
			</span>
		);
	}

	return (
		<div className="flex flex-col gap-1.5">
			{diff.itemChanges.length > 0 && (
				<ItemChangeList features={features} itemChanges={diff.itemChanges} />
			)}
			{diff.hasPriceChange && (
				<span className="text-tertiary-foreground text-xs">
					Base price change
				</span>
			)}
			<LicenseChangeList changes={diff.licenseChanges} features={features} />
			{settingChanges.map((change) => (
				<div className="flex items-center gap-1.5 text-xs" key={change.key}>
					<span className="font-medium text-foreground">{change.label}</span>
					<span className="text-muted-foreground">{change.detail}</span>
				</div>
			))}
		</div>
	);
}
