import { Button } from "@autumn/ui";
import { cn } from "@autumn/ui/lib/utils";
import {
	LIST_EMPTY,
	LIST_FRAME,
	ROW_ACTIONS_REVEAL,
	ROW_HEADER_LAYOUT,
} from "../edge-config/rolloutRowStyles";
import { formatEndpointLimit } from "./formatRateLimit";
import { RateLimitEndpointLabel } from "./RateLimitEndpointLabel";
import { RateLimitOverrideBadge } from "./RateLimitOverrideBadge";
import { listEndpointPolicies } from "./rateLimitEndpoints";
import {
	POLICY_ROW_ACTIONS,
	POLICY_ROW_DETAIL,
	POLICY_ROW_LAYOUT,
	POLICY_ROW_NAME,
	POLICY_TABLE_COLUMNS,
	TOUCH_TARGET,
} from "./rateLimitTableStyles";
import type { RateLimitOverridesView } from "./rateLimitTypes";

/** Per-org caps on single endpoints, in the policy table's columns so the override chips line up. */
export const RateLimitEndpointTable = ({
	view,
	onOverride,
}: {
	view: RateLimitOverridesView;
	onOverride: (endpoint: string | null) => void;
}) => {
	const policies = listEndpointPolicies({ view });

	return (
		<div className="flex flex-col gap-3 pt-6">
			<div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
				<div className="flex flex-col gap-0.5">
					<h3 className="text-sm font-medium text-foreground">
						Endpoint overrides
					</h3>
					<p className="text-xs text-tertiary-foreground">
						Caps one endpoint for one org, on top of the limits above. 0 blocks
						it.
					</p>
				</div>
				<Button
					variant="secondary"
					size="sm"
					className={cn("self-start md:self-auto", TOUCH_TARGET)}
					onClick={() => onOverride(null)}
				>
					Add endpoint override
				</Button>
			</div>

			<div className={LIST_FRAME}>
				{policies.length === 0 ? (
					<p className={LIST_EMPTY}>
						No endpoint overrides. Every endpoint runs on its group's limits.
					</p>
				) : (
					<div className={cn(ROW_HEADER_LAYOUT, POLICY_TABLE_COLUMNS)}>
						<span className="md:col-span-3">Endpoint</span>
						<span>Overrides</span>
					</div>
				)}
				{policies.map(({ endpoint, overrides }) => (
					<div
						key={endpoint}
						className={cn(
							"group hover:bg-interactive-secondary-hover",
							POLICY_ROW_LAYOUT,
							POLICY_TABLE_COLUMNS,
						)}
					>
						<RateLimitEndpointLabel
							endpoint={endpoint}
							className={cn(
								"min-h-11 md:col-span-3 md:min-h-0",
								POLICY_ROW_NAME,
							)}
						/>
						<div
							className={cn(
								"flex min-w-0 flex-wrap gap-1.5",
								POLICY_ROW_DETAIL,
							)}
						>
							{overrides.map((override) => (
								<RateLimitOverrideBadge
									key={override.orgKey}
									orgName={
										view.orgsByKey[override.orgKey]?.name ?? override.orgKey
									}
									values={[formatEndpointLimit(override)]}
								/>
							))}
						</div>
						<Button
							variant="skeleton"
							size="sm"
							onClick={() => onOverride(endpoint)}
							className={cn(
								POLICY_ROW_ACTIONS,
								TOUCH_TARGET,
								ROW_ACTIONS_REVEAL,
							)}
						>
							Override
						</Button>
					</div>
				))}
			</div>
		</div>
	);
};
