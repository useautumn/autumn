import { Button } from "@autumn/ui";
import { cn } from "@autumn/ui/lib/utils";
import { ArrowRightIcon } from "@phosphor-icons/react";
import {
	LIST_EMPTY,
	LIST_FRAME,
	ROW_HEADER_LAYOUT,
} from "../edge-config/rolloutRowStyles";
import {
	formatCount,
	formatEndpointLimit,
	formatLimit,
	formatPolicyLabel,
} from "./formatRateLimit";
import { RateLimitEndpointLabel } from "./RateLimitEndpointLabel";
import {
	POLICY_ROW_ACTIONS,
	POLICY_ROW_DETAIL,
	POLICY_ROW_LAYOUT,
	POLICY_ROW_NAME,
	TOUCH_TARGET,
} from "./rateLimitTableStyles";
import type {
	RateLimitEndpointOverride,
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

/** Each write replaces the whole config, so a second one waits for the first to land. */
const RowActions = ({
	onEdit,
	onRemove,
	isSaving,
}: {
	onEdit: () => void;
	onRemove: () => void;
	isSaving: boolean;
}) => (
	<div className={cn("flex gap-1", POLICY_ROW_ACTIONS)}>
		<Button
			variant="skeleton"
			size="sm"
			className={TOUCH_TARGET}
			onClick={onEdit}
		>
			Edit
		</Button>
		<Button
			variant="skeleton"
			size="sm"
			className={TOUCH_TARGET}
			disabled={isSaving}
			onClick={onRemove}
		>
			Remove
		</Button>
	</div>
);

/** One org's overrides only: default → new per layer, then its endpoint caps, with edit and remove. */
export const RateLimitOrgOverridesTable = ({
	org,
	policies,
	endpoints,
	onEdit,
	onRemove,
	onEditEndpoint,
	onRemoveEndpoint,
	onShowAll,
	isSaving,
}: {
	org: RateLimitOrg;
	policies: RateLimitPolicySummary[];
	endpoints: Record<string, RateLimitEndpointOverride>;
	onEdit: (policy: RateLimitPolicySummary) => void;
	onRemove: (policy: RateLimitPolicySummary) => void;
	onEditEndpoint: (endpoint: string) => void;
	onRemoveEndpoint: (endpoint: string) => void;
	onShowAll: () => void;
	isSaving: boolean;
}) => {
	const overridden = policies.flatMap((policy) => {
		const override = policy.overrides.find(({ orgKey }) => orgKey === org.key);
		return override ? [{ policy, override }] : [];
	});
	const endpointOverrides = Object.entries(endpoints);

	return (
		<div className="flex flex-col gap-3">
			<div className={LIST_FRAME}>
				<div className={cn(ROW_HEADER_LAYOUT, COLUMNS)}>
					{HEADERS.map((header, index) => (
						<span key={`${header}-${index}`}>{header}</span>
					))}
				</div>
				{overridden.length === 0 && endpointOverrides.length === 0 && (
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
						<RowActions
							onEdit={() => onEdit(policy)}
							onRemove={() => onRemove(policy)}
							isSaving={isSaving}
						/>
					</div>
				))}
				{endpointOverrides.map(([endpoint, override]) => (
					<div key={endpoint} className={cn(POLICY_ROW_LAYOUT, COLUMNS)}>
						<RateLimitEndpointLabel
							endpoint={endpoint}
							className={cn("md:col-span-2", POLICY_ROW_NAME)}
						/>
						<span className={cn("text-sm tabular-nums", POLICY_ROW_DETAIL)}>
							{formatEndpointLimit(override)}
							<span className="ml-1.5 text-tertiary-foreground">
								endpoint cap
							</span>
						</span>
						<span className="hidden md:block" />
						<RowActions
							onEdit={() => onEditEndpoint(endpoint)}
							onRemove={() => onRemoveEndpoint(endpoint)}
							isSaving={isSaving}
						/>
					</div>
				))}
			</div>
			<div className="flex flex-wrap items-center gap-x-3 text-xs text-tertiary-foreground">
				<span className="tabular-nums">
					{overridden.length} of {policies.length} limits overridden ·{" "}
					{policies.length - overridden.length} on default
					{endpointOverrides.length > 0 &&
						` · ${endpointOverrides.length} endpoint ${endpointOverrides.length === 1 ? "cap" : "caps"}`}
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
