import { SheetAccordion, SheetAccordionItem } from "@autumn/ui";
import type { ReactNode } from "react";
import { SheetSection } from "@/components/v2/sheets/SharedSheetComponents";

/** Shared section with always-visible children and an optional "More Options" accordion. */
export function AdvancedSection({
	moreOptions,
	children,
}: {
	moreOptions?: ReactNode;
	children: ReactNode;
}) {
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
