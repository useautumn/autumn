import { Button } from "@autumn/ui";
import { cn } from "@autumn/ui/lib/utils";
import { ArrowRightIcon } from "@phosphor-icons/react";
import {
	LIST_EMPTY,
	LIST_FRAME,
	ROW_HEADER_LAYOUT,
} from "../edge-config/rolloutRowStyles";
import { formatCount, formatLimit, formatPolicyLabel } from "./formatRateLimit";
import {
	POLICY_ROW_ACTIONS,
	POLICY_ROW_DETAIL,
	POLICY_ROW_LAYOUT,
	POLICY_ROW_NAME,
	TOUCH_TARGET,
} from "./rateLimitTableStyles";
import type {
	RateLimitLayerSummary,
	RateLimitOrg,
	RateLimitPolicySummary,
} from "./rateLimitTypes";

const COLUMNS =
	"md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.8fr)_140px]";
const HEADERS = ["Limit", "Per customer", "Per org", "", ""];

/** "120k → 300k/min" when the org overrides the layer, else its default. */
const OverriddenLayerCell = ({
	layer,
	value,
}: {
	layer: RateLimitLayerSummary | null;
	value: number | undefined;
}) => {
	if (!layer) {
		return (
			<span
				className={cn(
					"hidden text-tertiary-foreground md:inline",
					POLICY_ROW_DETAIL,
				)}
			>
				—
			</span>
		);
	}
	if (value === undefined) {
		return (
			<span className={cn("text-sm tabular-nums", POLICY_ROW_DETAIL)}>
				{formatLimit(layer)}
				<span className="ml-1.5 text-tertiary-foreground">default</span>
			</span>
		);
	}
	return (
		<span
			className={cn(
				"flex items-center gap-1.5 text-sm tabular-nums",
				POLICY_ROW_DETAIL,
			)}
		>
			{formatCount(layer.limit)}
			<ArrowRightIcon className="size-3 text-tertiary-foreground" />
			{formatLimit({ limit: value, windowMs: layer.windowMs })}
		</span>
	);
};

/** One org's overrides only: default → new per layer, with edit and remove. */
export const RateLimitOrgOverridesTable = ({
	org,
	policies,
	onEdit,
	onRemove,
	onShowAll,
	isSaving,
}: {
	org: RateLimitOrg;
	policies: RateLimitPolicySummary[];
	onEdit: (policy: RateLimitPolicySummary) => void;
	onRemove: (policy: RateLimitPolicySummary) => void;
	onShowAll: () => void;
	/** Each write replaces the whole config, so a second one waits for the first to land. */
	isSaving: boolean;
}) => {
	const overridden = policies.flatMap((policy) => {
		const override = policy.overrides.find(({ orgKey }) => orgKey === org.key);
		return override ? [{ policy, override }] : [];
	});

	return (
		<div className="flex flex-col gap-3">
			<div className={LIST_FRAME}>
				<div className={cn(ROW_HEADER_LAYOUT, COLUMNS)}>
					{HEADERS.map((header, index) => (
						<span key={`${header}-${index}`}>{header}</span>
					))}
				</div>
				{overridden.length === 0 && (
					<p className={LIST_EMPTY}>{org.name} is on every default.</p>
				)}
				{overridden.map(({ policy, override }) => (
					<div key={policy.id} className={cn(POLICY_ROW_LAYOUT, COLUMNS)}>
						<span
							className={cn(
								"text-sm font-medium text-foreground",
								POLICY_ROW_NAME,
							)}
						>
							{formatPolicyLabel(policy.id)}
						</span>
						<OverriddenLayerCell
							layer={policy.perCustomer}
							value={override.perCustomer}
						/>
						<OverriddenLayerCell
							layer={policy.perOrg}
							value={override.perOrg}
						/>
						<span className="hidden md:block" />
						<div className={cn("flex gap-1", POLICY_ROW_ACTIONS)}>
							<Button
								variant="skeleton"
								size="sm"
								className={TOUCH_TARGET}
								onClick={() => onEdit(policy)}
							>
								Edit
							</Button>
							<Button
								variant="skeleton"
								size="sm"
								className={TOUCH_TARGET}
								disabled={isSaving}
								onClick={() => onRemove(policy)}
							>
								Remove
							</Button>
						</div>
					</div>
				))}
			</div>
			<div className="flex flex-wrap items-center gap-x-3 text-xs text-tertiary-foreground">
				<span className="tabular-nums">
					{overridden.length} of {policies.length} limits overridden ·{" "}
					{policies.length - overridden.length} on default
				</span>
				<Button
					variant="skeleton"
					size="sm"
					className={TOUCH_TARGET}
					onClick={onShowAll}
				>
					Show all
				</Button>
			</div>
		</div>
	);
};
