import { SheetAccordion, SheetAccordionItem } from "@autumn/ui";
import { Children, type ReactNode } from "react";
import { SheetSection } from "@/components/v2/sheets/SharedSheetComponents";
import { AdvancedCollapsibleTray } from "./AdvancedCollapsibleTray";
import { AdvancedMoreOptions } from "./AdvancedMoreOptions";
import { AdvancedSectionHeader } from "./AdvancedSectionHeader";
import { AdvancedTray } from "./AdvancedTray";

// Hidden until the tray layout is ready to release; the plain layout is what ships today.
const SHOW_BILLING_OPTIONS_TRAY = false;

function PlainAdvancedSection({
	title,
	collapsible,
	withSeparator,
	moreOptions,
	children,
}: {
	title: string;
	collapsible: boolean;
	withSeparator: boolean;
	moreOptions?: ReactNode;
	children: ReactNode;
}) {
	if (collapsible) {
		return (
			<SheetAccordion withSeparator={withSeparator}>
				<SheetAccordionItem value="advanced" title={title}>
					{children}
				</SheetAccordionItem>
			</SheetAccordion>
		);
	}

	return (
		<>
			<SheetSection withSeparator={!moreOptions}>
				<div className="space-y-4">{children}</div>
			</SheetSection>
			{moreOptions && (
				<SheetAccordion>
					<SheetAccordionItem value="more-options" title="More Options">
						<div className="space-y-4">{moreOptions}</div>
					</SheetAccordionItem>
				</SheetAccordion>
			)}
		</>
	);
}

/** Titled tray of option rows; `moreOptions` fold into the bottom of the same tray. */
export function AdvancedSection({
	title = "Billing",
	collapsible = false,
	withSeparator = true,
	moreOptions,
	children,
}: {
	title?: string;
	collapsible?: boolean;
	withSeparator?: boolean;
	moreOptions?: ReactNode;
	children: ReactNode;
}) {
	if (!SHOW_BILLING_OPTIONS_TRAY) {
		return (
			<PlainAdvancedSection
				title={title}
				collapsible={collapsible}
				withSeparator={withSeparator}
				moreOptions={moreOptions}
			>
				{children}
			</PlainAdvancedSection>
		);
	}

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
