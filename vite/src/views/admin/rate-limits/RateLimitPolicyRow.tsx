import { Badge, Button } from "@autumn/ui";
import { cn } from "@autumn/ui/lib/utils";
import { CaretRightIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { ROW_ACTIONS_REVEAL } from "../edge-config/rolloutRowStyles";
import {
	formatCondition,
	formatPolicyLabel,
	formatVersion,
	formatVersionLimits,
} from "./formatRateLimit";
import { RateLimitLayerCell } from "./RateLimitLayerCell";
import { RateLimitOverrideBadge } from "./RateLimitOverrideBadge";
import { RateLimitPolicyDetails } from "./RateLimitPolicyDetails";
import {
	POLICY_ROW_LAYOUT,
	POLICY_TABLE_COLUMNS,
} from "./rateLimitTableStyles";
import type {
	RateLimitOverridesView,
	RateLimitPolicySummary,
} from "./rateLimitTypes";

/** A row sharing a counter names the row that owns it instead of repeating its version limits. */
const PolicyTags = ({ policy }: { policy: RateLimitPolicySummary }) => {
	const ownsItsLayers = policy.sharesCounterWith.length === 0;
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
}) => {
	if (!isNested || !policy.when) {
		return (
			<span className="shrink-0 text-sm font-medium text-foreground">
				{formatPolicyLabel(policy.id)}
			</span>
		);
	}
	return (
		<span className="flex items-center gap-2 pl-5 text-sm text-foreground">
			{formatCondition({ when: policy.when })}
			{policy.when.minVersion && (
				<Badge variant="muted" size="sm">
					{formatVersion(policy.when.minVersion)}
				</Badge>
			)}
		</span>
	);
};

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
					className="flex min-w-0 cursor-pointer items-center gap-2 text-left"
				>
					<CaretRightIcon
						className={cn(
							"size-3 shrink-0 text-tertiary-foreground transition-transform",
							isExpanded && "rotate-90",
						)}
					/>
					<PolicyName policy={policy} isNested={isNested} />
					{!isNested && <PolicyTags policy={policy} />}
				</button>
				<RateLimitLayerCell layer={policy.perCustomer} unit="per customer" />
				<RateLimitLayerCell layer={policy.perOrg} unit="per org" />
				<div className="flex min-w-0 flex-wrap gap-1.5">
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
					className={cn("justify-self-end", ROW_ACTIONS_REVEAL)}
				>
					Override
				</Button>
			</div>
			{isExpanded && <RateLimitPolicyDetails policy={policy} />}
		</div>
	);
};
