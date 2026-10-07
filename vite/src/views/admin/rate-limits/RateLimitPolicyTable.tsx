import { cn } from "@autumn/ui/lib/utils";
import { Fragment } from "react";
import { LIST_FRAME, ROW_HEADER_LAYOUT } from "../edge-config/rolloutRowStyles";
import { groupConditionalPolicies } from "./groupConditionalPolicies";
import { RateLimitPolicyRow } from "./RateLimitPolicyRow";
import { POLICY_TABLE_COLUMNS } from "./rateLimitTableStyles";
import type {
	RateLimitOverridesView,
	RateLimitPolicySummary,
} from "./rateLimitTypes";

const HEADERS = ["Limit", "Per customer", "Per org", "Overrides", ""];

/** Every limit in the server's policy table, request-specific rows nested under the row they narrow. */
export const RateLimitPolicyTable = ({
	view,
	onOverride,
}: {
	view: RateLimitOverridesView;
	onOverride: (policy: RateLimitPolicySummary) => void;
}) => (
	<div className={LIST_FRAME}>
		<div className={cn(ROW_HEADER_LAYOUT, POLICY_TABLE_COLUMNS)}>
			{HEADERS.map((header) => (
				<span key={header}>{header}</span>
			))}
		</div>
		{groupConditionalPolicies({ policies: view.policies }).map(
			({ policy, conditional }) => (
				<Fragment key={policy.id}>
					<RateLimitPolicyRow
						policy={policy}
						view={view}
						onOverride={() => onOverride(policy)}
					/>
					{conditional.map((nested) => (
						<RateLimitPolicyRow
							key={nested.id}
							policy={nested}
							view={view}
							isNested
							onOverride={() => onOverride(nested)}
						/>
					))}
				</Fragment>
			),
		)}
	</div>
);
