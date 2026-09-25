import { Accordion } from "@autumn/ui";
import { SheetSection } from "@/components/v2/sheets/SharedSheetComponents";
import { useSetPlansReviewSections } from "../../hooks/useSetPlansReviewSections";
import { ReviewChangeGroup } from "./ReviewChangeGroup";
import { ReviewWarnings } from "./ReviewWarnings";

const DEFAULT_OPEN_GROUPS = ["plans"];

/** What set_plans changes in Autumn and Stripe, grouped by system and phase. */
export function SetPlansReviewChanges() {
	const sections = useSetPlansReviewSections();
	if (!sections) return null;

	const { warnings, plans, balances, processor } = sections;

	return (
		<SheetSection withSeparator={false} className="pb-0">
			<div className="flex flex-col gap-1">
				<ReviewWarnings warnings={warnings} />
				<Accordion type="multiple" defaultValue={DEFAULT_OPEN_GROUPS}>
					<ReviewChangeGroup
						value="plans"
						system="autumn"
						title="Plans"
						section={plans}
					/>
					{balances.rows.length > 0 && (
						<ReviewChangeGroup
							value="balances"
							system="autumn"
							title="Balances"
							section={balances}
						/>
					)}
					{processor.rows.length > 0 && (
						<ReviewChangeGroup
							value="subscription"
							system="stripe"
							title="Subscription"
							section={processor}
						/>
					)}
				</Accordion>
			</div>
		</SheetSection>
	);
}
