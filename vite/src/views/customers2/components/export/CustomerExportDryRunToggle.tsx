import { Switch } from "@autumn/ui";
import { FlaskIcon } from "@phosphor-icons/react";
import { CustomerExportOverviewRow } from "./CustomerExportOverview";

export function CustomerExportDryRunToggle({
	dryRun,
	onDryRunChange,
}: {
	dryRun: boolean;
	onDryRunChange: (dryRun: boolean) => void;
}) {
	return (
		<CustomerExportOverviewRow
			icon={FlaskIcon}
			label="Dry run"
			action={
				<Switch
					aria-label="Dry run"
					checked={dryRun}
					onCheckedChange={onDryRunChange}
				/>
			}
		>
			<span className="text-tertiary-foreground">
				When off, each plan's custom flag is updated to match
			</span>
		</CustomerExportOverviewRow>
	);
}
