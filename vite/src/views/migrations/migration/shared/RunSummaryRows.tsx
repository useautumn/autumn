import type { Operations } from "@autumn/shared";
import { GearIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { InfoBox } from "@/views/onboarding2/integrate/components/InfoBox";
import { AutumnMark, StripeMark } from "./BillingScopeMarks";
import { getOperationsSummaryText } from "./operationUtils";

const SUMMARY_ROW_CLASS =
	"flex items-center gap-2 rounded-xl h-8 px-3 text-sm input-base text-foreground";

export function RunSummaryRows({
	customerIcon,
	customerLabel,
	operations,
	noBillingChanges,
}: {
	customerIcon: ReactNode;
	customerLabel: ReactNode;
	operations: Operations;
	noBillingChanges: boolean;
}) {
	return (
		<div className="flex flex-col gap-2">
			<div className={SUMMARY_ROW_CLASS}>
				{customerIcon}
				{customerLabel}
			</div>
			<div className={SUMMARY_ROW_CLASS}>
				<GearIcon size={14} weight="duotone" className="text-amber-500" />
				<span>{getOperationsSummaryText(operations)}</span>
			</div>
			<div className={SUMMARY_ROW_CLASS}>
				{noBillingChanges ? (
					<>
						<AutumnMark size={14} />
						Billing changes apply to Autumn only
					</>
				) : (
					<>
						<StripeMark size={14} />
						Billing changes apply to Autumn and Stripe
					</>
				)}
			</div>
			{!noBillingChanges && (
				<InfoBox variant="warning">
					Customer subscriptions will be updated with this change.
				</InfoBox>
			)}
		</div>
	);
}
