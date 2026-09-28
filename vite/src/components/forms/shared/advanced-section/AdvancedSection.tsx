import { Children, type ReactNode } from "react";
import { AdvancedCollapsibleTray } from "./AdvancedCollapsibleTray";
import { AdvancedMoreOptions } from "./AdvancedMoreOptions";
import { AdvancedSectionHeader } from "./AdvancedSectionHeader";
import { AdvancedTray } from "./AdvancedTray";

/** Titled tray of option rows; `moreOptions` fold into the bottom of the same tray. */
export function AdvancedSection({
	title = "Billing",
	collapsible = false,
	moreOptions,
	children,
}: {
	title?: string;
	collapsible?: boolean;
	moreOptions?: ReactNode;
	children: ReactNode;
}) {
	const hasOptions = Children.toArray(children).length > 0;
	if (!hasOptions && !moreOptions) return null;

	const rows = (
		<>
			{children}
			{moreOptions && <AdvancedMoreOptions>{moreOptions}</AdvancedMoreOptions>}
		</>
	);

	return (
		<section className="flex flex-col px-4 pb-4">
			{collapsible ? (
				<AdvancedCollapsibleTray value="options" title={title}>
					{rows}
				</AdvancedCollapsibleTray>
			) : (
				<>
					<AdvancedSectionHeader title={title} />
					<AdvancedTray>{rows}</AdvancedTray>
				</>
			)}
		</section>
	);
}
