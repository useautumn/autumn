import { Accordion } from "@autumn/ui";
import { useSetPlansReviewSections } from "../../hooks/useSetPlansReviewSections";
import { ReviewChangeGroup } from "./ReviewChangeGroup";
import { ReviewWarnings } from "./ReviewWarnings";

const DEFAULT_OPEN_GROUPS = ["plans"];

/** What set_plans changes in Autumn and Stripe, grouped by system and phase. */
export function SetPlansReviewChanges() {
	const sections = useSetPlansReviewSections();
	if (!sections) return null;

	const { warnings, plans, balances, processor } = sections;
	const hasProcessorChanges =
		processor.phases.length > 0 || processor.stripeIds.length > 0;

	return (
		<div className="flex flex-col">
			<ReviewWarnings warnings={warnings} />
			<Accordion
				type="multiple"
				defaultValue={DEFAULT_OPEN_GROUPS}
				className="px-4 pt-1"
			>
				<ReviewChangeGroup
					value="plans"
					system="autumn"
					title="Plans"
					section={plans}
				/>
				{balances.phases.length > 0 && (
					<ReviewChangeGroup
						value="balances"
						system="autumn"
						title="Balances"
						section={balances}
					/>
				)}
				{hasProcessorChanges && (
					<ReviewChangeGroup
						value="subscription"
						system="stripe"
						title="Subscription"
						section={processor}
					/>
				)}
			</Accordion>
		</div>
	);
}
