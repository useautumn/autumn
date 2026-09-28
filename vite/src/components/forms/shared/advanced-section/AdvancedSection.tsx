import { Children, type ReactNode } from "react";
import { AdvancedCollapsibleTray } from "./AdvancedCollapsibleTray";
import { AdvancedSectionHeader } from "./AdvancedSectionHeader";
import { AdvancedTray } from "./AdvancedTray";

/** Titled tray of option rows, with an optional collapsible "More Options" tray. */
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

	return (
		<section className="flex flex-col px-4 pb-4">
			{hasOptions &&
				(collapsible ? (
					<AdvancedCollapsibleTray value="options" title={title}>
						{children}
					</AdvancedCollapsibleTray>
				) : (
					<>
						<AdvancedSectionHeader title={title} />
						<AdvancedTray>{children}</AdvancedTray>
					</>
				))}
			{moreOptions && (
				<AdvancedCollapsibleTray value="more-options" title="More Options">
					{moreOptions}
				</AdvancedCollapsibleTray>
			)}
		</section>
	);
}
