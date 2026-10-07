import { Button } from "@autumn/ui";
import { cn } from "@autumn/ui/lib/utils";
import { ArrowRightIcon } from "@phosphor-icons/react";
import {
	LIST_EMPTY,
	LIST_FRAME,
	ROW_HEADER_LAYOUT,
} from "../edge-config/rolloutRowStyles";
import { formatCount, formatLimit, formatPolicyLabel } from "./formatRateLimit";
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
	if (!layer) return <span className="text-tertiary-foreground">—</span>;
	if (value === undefined) {
		return (
			<span className="text-sm tabular-nums">
				{formatLimit(layer)}
				<span className="ml-1.5 text-tertiary-foreground">default</span>
			</span>
		);
	}
	return (
		<span className="flex items-center gap-1.5 text-sm tabular-nums">
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
					<div
						key={policy.id}
						className={cn(
							"grid grid-cols-1 items-center gap-x-4 gap-y-1 px-4 py-2 md:min-h-12",
							COLUMNS,
						)}
					>
						<span className="text-sm font-medium text-foreground">
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
						<span />
						<div className="flex justify-end gap-1">
							<Button
								variant="skeleton"
								size="sm"
								onClick={() => onEdit(policy)}
							>
								Edit
							</Button>
							<Button
								variant="skeleton"
								size="sm"
								disabled={isSaving}
								onClick={() => onRemove(policy)}
							>
								Remove
							</Button>
						</div>
					</div>
				))}
			</div>
			<div className="flex items-center gap-3 text-xs text-tertiary-foreground">
				<span className="tabular-nums">
					{overridden.length} of {policies.length} limits overridden ·{" "}
					{policies.length - overridden.length} on default
				</span>
				<Button variant="skeleton" size="sm" onClick={onShowAll}>
					Show all
				</Button>
			</div>
		</div>
	);
};
