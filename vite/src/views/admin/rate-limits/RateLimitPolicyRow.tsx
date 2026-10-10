import { Badge, Button } from "@autumn/ui";
import { cn } from "@autumn/ui/lib/utils";
import { CaretRightIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { ROW_ACTIONS_REVEAL } from "../edge-config/rolloutRowStyles";
import { formatPolicyLabel, formatVersionLimits } from "./formatRateLimit";
import { RateLimitLayerCell } from "./RateLimitLayerCell";
import { RateLimitOverrideBadge } from "./RateLimitOverrideBadge";
import { RateLimitPolicyDetails } from "./RateLimitPolicyDetails";
import {
	POLICY_ROW_ACTIONS,
	POLICY_ROW_DETAIL,
	POLICY_ROW_LAYOUT,
	POLICY_ROW_NAME,
	POLICY_TABLE_COLUMNS,
	TOUCH_TARGET,
} from "./rateLimitTableStyles";
import type {
	RateLimitOverridesView,
	RateLimitPolicySummary,
} from "./rateLimitTypes";

/** A row sharing a counter names the row that owns it instead of repeating its version limits. */
const PolicyTags = ({
	policy,
	isNested,
}: {
	policy: RateLimitPolicySummary;
	isNested: boolean;
}) => {
	const ownsItsLayers = !isNested && policy.sharesCounterWith.length === 0;
	const versionTags = ownsItsLayers
		? [policy.perOrg, policy.perCustomer].flatMap((layer) =>
				layer ? formatVersionLimits({ layer }) : [],
			)
		: [];
	const shareTags = policy.sharesCounterWith.map(
		(id) => `shares ${formatPolicyLabel(id)}`,
	);
	return [...versionTags, ...shareTags].map((tag) => (
		<Badge
			key={tag}
			variant="muted"
			size="sm"
			className="shrink-0 whitespace-nowrap"
		>
			{tag}
		</Badge>
	));
};

const PolicyName = ({
	policy,
	isNested,
}: {
	policy: RateLimitPolicySummary;
	isNested: boolean;
}) => (
	<span
		className={cn(
			"shrink-0 text-sm text-foreground",
			isNested ? "pl-5" : "font-medium",
		)}
	>
		{formatPolicyLabel(policy.id)}
	</span>
);

/** One limit: what it allows per customer and per org, who overrides it, and its details on expand. */
export const RateLimitPolicyRow = ({
	policy,
	view,
	isNested = false,
	onOverride,
}: {
	policy: RateLimitPolicySummary;
	view: RateLimitOverridesView;
	isNested?: boolean;
	onOverride: () => void;
}) => {
	const [isExpanded, setIsExpanded] = useState(false);

	return (
		<div>
			<div
				className={cn(
					"group hover:bg-interactive-secondary-hover",
					POLICY_ROW_LAYOUT,
					POLICY_TABLE_COLUMNS,
				)}
			>
				<button
					type="button"
					aria-expanded={isExpanded}
					onClick={() => setIsExpanded(!isExpanded)}
					className={cn(
						"flex min-h-11 min-w-0 cursor-pointer flex-wrap items-center gap-2 text-left md:min-h-0 md:flex-nowrap",
						POLICY_ROW_NAME,
					)}
				>
					<CaretRightIcon
						className={cn(
							"size-3 shrink-0 text-tertiary-foreground transition-transform",
							isExpanded && "rotate-90",
						)}
					/>
					<PolicyName policy={policy} isNested={isNested} />
					<PolicyTags policy={policy} isNested={isNested} />
				</button>
				<RateLimitLayerCell
					layer={policy.perCustomer}
					unit="per customer"
					className={POLICY_ROW_DETAIL}
				/>
				<RateLimitLayerCell
					layer={policy.perOrg}
					unit="per org"
					className={POLICY_ROW_DETAIL}
				/>
				<div
					className={cn(
						"flex min-w-0 flex-wrap gap-1.5 empty:hidden md:empty:flex",
						POLICY_ROW_DETAIL,
					)}
				>
					{policy.overrides.map((override) => (
						<RateLimitOverrideBadge
							key={override.orgKey}
							policy={policy}
							override={override}
							orgName={view.orgsByKey[override.orgKey]?.name ?? override.orgKey}
						/>
					))}
				</div>
				<Button
					variant="skeleton"
					size="sm"
					onClick={onOverride}
					className={cn(POLICY_ROW_ACTIONS, TOUCH_TARGET, ROW_ACTIONS_REVEAL)}
				>
					Override
				</Button>
			</div>
			{isExpanded && <RateLimitPolicyDetails policy={policy} />}
		</div>
	);
};
