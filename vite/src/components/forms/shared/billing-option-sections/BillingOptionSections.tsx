import { Separator } from "@autumn/ui";
import { domAnimation, LazyMotion } from "motion/react";
import { Fragment, useState } from "react";
import { BillingOptionSection } from "./BillingOptionSection";
import type {
	BillingOptionSectionId,
	BillingOptionSectionsConfig,
} from "./types/billingOptionSectionTypes";
import { toVisibleBillingOptionSections } from "./utils/toVisibleBillingOptionSections";

const DEFAULT_OPEN_SECTION: BillingOptionSectionId = "charges";

/** Collapsible billing option sections; a section with no visible option is not rendered. */
export function BillingOptionSections({
	sections,
}: {
	sections: BillingOptionSectionsConfig;
}) {
	const [openSections, setOpenSections] = useState<
		Partial<Record<BillingOptionSectionId, boolean>>
	>({});
	const visibleSections = toVisibleBillingOptionSections({ sections });
	if (visibleSections.length === 0) return null;

	return (
		<LazyMotion features={domAnimation}>
			<div className="flex flex-col px-4">
				{visibleSections.map((section, index) => (
					<Fragment key={section.id}>
						{index > 0 && <Separator />}
						<BillingOptionSection
							section={section}
							open={
								openSections[section.id] ?? section.id === DEFAULT_OPEN_SECTION
							}
							onOpenChange={(open) =>
								setOpenSections((current) => ({
									...current,
									[section.id]: open,
								}))
							}
						/>
					</Fragment>
				))}
			</div>
			<div className="px-4">
				<Separator />
			</div>
		</LazyMotion>
	);
}
