import type {
	Feature,
	PlanUpdatePreviewLicenseChange,
} from "@autumn/shared";
import { ItemStatusDot, type ItemStatusState } from "@/components/v2/ItemStatusDot";
import { PlanDiffBody } from "@/components/v2/PlanDiffBody";

const ACTION_STATE: Record<
	PlanUpdatePreviewLicenseChange["action"],
	ItemStatusState
> = {
	create: "new",
	update: "updated",
	remove: "removed",
};

const ACTION_LABEL: Record<PlanUpdatePreviewLicenseChange["action"], string> = {
	create: "Added",
	update: "Updated",
	remove: "Removed",
};

const ATTRIBUTE_LABELS = {
	version: "Version",
	included: "Included",
	prepaid_only: "Prepaid only",
} as const;

const valueText = (value: unknown) => {
	if (typeof value === "boolean") return value ? "Yes" : "No";
	return String(value);
};

export function LicenseChangeList({
	changes,
	features,
}: {
	changes: PlanUpdatePreviewLicenseChange[];
	features?: Feature[];
}) {
	if (changes.length === 0) return null;

	return (
		<div className="flex flex-col gap-3">
			{changes.map((change) => {
				const previous = Object.entries(
					change.previous_attributes ?? {},
				) as [keyof typeof ATTRIBUTE_LABELS, unknown][];

				return (
					<div
						className="flex flex-col gap-2 border-t border-border/50 pt-2 first:border-0 first:pt-0"
						key={change.license_plan_id}
					>
						<div className="flex items-center gap-1.5 text-xs">
							<ItemStatusDot state={ACTION_STATE[change.action]} />
							<span className="font-medium text-foreground">
								{change.license_plan_id}
							</span>
							<span className="text-tertiary-foreground">
								{ACTION_LABEL[change.action]}
							</span>
						</div>
						{previous.map(([key, value]) => (
							<div className="flex items-center gap-1.5 text-xs" key={key}>
								<span className="font-medium text-foreground">
									{ATTRIBUTE_LABELS[key as keyof typeof ATTRIBUTE_LABELS]}
								</span>
								<span className="text-tertiary-foreground">
									{valueText(value)}
								</span>
								<span className="text-subtle">-&gt;</span>
								<span className="font-medium text-foreground">
									{valueText(change[key])}
								</span>
							</div>
						))}
						{change.plan_changes && (
							<PlanDiffBody features={features} plan={change.plan_changes} />
						)}
					</div>
				);
			})}
		</div>
	);
}
