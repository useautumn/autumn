import {
	expandScopes,
	groupAndFormatScopes,
	RESOURCE_METADATA,
	RESOURCES,
	type ResourceType,
	Scopes,
	type ScopeString,
} from "@autumn/shared";
import { useMemo, useState } from "react";
import { Checkbox } from "@/components/v2/checkboxes/Checkbox";
import { ConditionalTooltip } from "@/components/v2/tooltips/ConditionalTooltip";
import { cn } from "@/lib/utils";

export type ScopeSelectorProps = {
	/** Current scopes. Empty array = unrestricted (all scopes granted). */
	value: ScopeString[];
	onChange: (scopes: ScopeString[]) => void;
	/**
	 * Optional: the caller's own scopes. If provided, any scope NOT in this
	 * set is disabled with a tooltip explaining the caller can't grant it.
	 */
	availableScopes?: readonly string[];
	disabled?: boolean;
};

type TriState = "none" | "read" | "write";

type TriOption = { value: TriState; label: string };

const TRI_OPTIONS_FULL: TriOption[] = [
	{ value: "none", label: "None" },
	{ value: "read", label: "Read" },
	{ value: "write", label: "Write" },
];

const UNAVAILABLE_TOOLTIP =
	"You don't have this scope on your current session";
const READ_ONLY_RESOURCE_TOOLTIP =
	"This resource is read-only — no write scope exists";

function deriveTriState(
	value: readonly ScopeString[],
	resource: ResourceType,
): TriState {
	const write = `${resource}:write` as ScopeString;
	const read = `${resource}:read` as ScopeString;
	if (value.includes(write)) return "write";
	if (value.includes(read)) return "read";
	return "none";
}

function applyTriState(
	value: readonly ScopeString[],
	resource: ResourceType,
	next: TriState,
): ScopeString[] {
	const write = `${resource}:write`;
	const read = `${resource}:read`;
	const filtered = value.filter((s) => s !== write && s !== read);
	if (next === "read") filtered.push(read as ScopeString);
	if (next === "write") filtered.push(write as ScopeString);
	return filtered;
}

/**
 * Tri-state action picker that mirrors the visual language of
 * `GroupedTabButton` but supports per-option disabling (with tooltip).
 *
 * `GroupedTabButton` only supports group-level `disabled`, which is not
 * sufficient for the "W unavailable but R allowed" case required by
 * `availableScopes`. Class names are intentionally kept in sync with
 * `GroupedTabButton` so this renders identically.
 */
function TriStatePicker({
	options,
	value,
	onChange,
	readEnabled,
	writeEnabled,
	writeUnavailableReason,
	disabled,
}: {
	options: TriOption[];
	value: TriState;
	onChange: (next: TriState) => void;
	readEnabled: boolean;
	writeEnabled: boolean;
	/**
	 * Override tooltip text for a disabled `write` option. Used for the
	 * analytics resource, which has no write scope at all (distinct from
	 * "caller can't grant it").
	 */
	writeUnavailableReason?: string | null;
	disabled: boolean;
}) {
	return (
		// Fixed width so every row's picker column is the same size. 3
		// segments × 72px ≈ 216px keeps "Read"/"Write" labels readable.
		<div className="flex items-stretch shrink-0 w-[216px]">
			{options.map((option, index) => {
				const isActive = value === option.value;
				const isFirst = index === 0;
				const isLast = index === options.length - 1;

				let optionDisabled = disabled;
				let tooltip: string | null = null;
				if (option.value === "write" && !writeEnabled) {
					optionDisabled = true;
					tooltip = writeUnavailableReason ?? UNAVAILABLE_TOOLTIP;
				} else if (option.value === "read" && !readEnabled) {
					optionDisabled = true;
					tooltip = UNAVAILABLE_TOOLTIP;
				}

				const button = (
					<button
						type="button"
						disabled={optionDisabled}
						onClick={() => onChange(option.value)}
						className={cn(
							"flex-1 flex items-center justify-center gap-1 px-[6px] py-1 h-6 text-body border transition-none outline-none whitespace-nowrap !bg-interactive-secondary cursor-pointer",
							"hover:text-primary focus-visible:text-primary",
							"disabled:opacity-50 disabled:cursor-not-allowed",
							isActive &&
								" text-primary shadow-[0px_3px_4px_0px_inset_rgba(0,0,0,0.04)]",
							!isActive &&
								"bg-interative-secondary shadow-[0px_-3px_4px_0px_inset_rgba(0,0,0,0.04)]",
							isFirst && "rounded-l-lg border-l",
							!isFirst && "border-l-0",
							isLast && "rounded-r-lg",
						)}
					>
						<span className="text-sm">{option.label}</span>
					</button>
				);

				return (
					<ConditionalTooltip
						key={option.value}
						enabled={!!tooltip}
						content={tooltip}
					>
						{/* Wrap in span so Radix can attach listeners even when the button is disabled. */}
						<span className="inline-flex flex-1">{button}</span>
					</ConditionalTooltip>
				);
			})}
		</div>
	);
}

export function ScopeSelector({
	value,
	onChange,
	availableScopes,
	disabled = false,
}: ScopeSelectorProps) {
	// Restricted mode is a local UI concern. We seed it from the initial
	// `value` length so a key that already has scopes opens in restricted
	// mode, but we intentionally do NOT re-sync with `value` on every
	// render — otherwise the user toggling all scopes to "None" would
	// flip the checkbox off and lose the grid.
	const [restricted, setRestricted] = useState(value.length > 0);

	const expandedAvailable = useMemo(
		() => (availableScopes ? expandScopes(availableScopes) : null),
		[availableScopes],
	);

	const isScopeAvailable = (scope: ScopeString): boolean => {
		if (!expandedAvailable) return true;
		// The `admin` meta-scope is a product-level bypass that grants
		// every modern R/W scope. Without this short-circuit, a caller
		// whose session only carries `admin` would see every row as
		// unavailable, which is the opposite of the truth.
		if (expandedAvailable.has("admin")) return true;
		return expandedAvailable.has(scope);
	};

	const handleToggleRestricted = (checked: boolean) => {
		setRestricted(checked);
		if (!checked) {
			onChange([]);
			return;
		}
		if (value.length === 0) {
			onChange([Scopes.Customers.Read]);
		}
	};

	const summary = useMemo(() => {
		const grouped = groupAndFormatScopes(value);
		return { scopeCount: value.length, resourceCount: grouped.length };
	}, [value]);

	return (
		<div className="flex flex-col gap-3">
			<label className="flex items-start gap-2.5 cursor-pointer select-none">
				<Checkbox
					checked={restricted}
					onCheckedChange={(c) => handleToggleRestricted(c === true)}
					disabled={disabled}
					className="mt-0.5"
				/>
				<div className="flex flex-col gap-0.5">
					<span className="text-sm text-foreground">Restricted mode</span>
					<span className="text-xs text-muted-foreground">
						Limit this key to specific scopes. Leave unchecked for full
						access.
					</span>
				</div>
			</label>

			{restricted && (
				<div className="flex flex-col border-t border-border">
					{RESOURCES.map((resource) => {
						const meta = RESOURCE_METADATA[resource];
						const isAnalytics = resource === "analytics";

						const readScope = `${resource}:read` as ScopeString;
						const readAvailable = isScopeAvailable(readScope);
						const writeAvailable = isAnalytics
							? false
							: isScopeAvailable(
									`${resource}:write` as ScopeString,
								);

						const fullyUnavailable =
							!!expandedAvailable &&
							!readAvailable &&
							(isAnalytics || !writeAvailable);

						const triValue = deriveTriState(value, resource);
						// Always render 3 segments so every row has the same
						// width. For analytics, `Write` is permanently disabled
						// with an explanatory tooltip.
						const writeReason = isAnalytics
							? READ_ONLY_RESOURCE_TOOLTIP
							: null;

						return (
							<div
								key={resource}
								className={cn(
									"flex items-center justify-between gap-4 py-3 border-b border-border",
									fullyUnavailable && "opacity-50",
								)}
							>
								<ConditionalTooltip
									enabled={!!meta.description}
									content={meta.description}
								>
									<span className="text-sm text-foreground cursor-help">
										{meta.namePlural}
									</span>
								</ConditionalTooltip>

								<TriStatePicker
									options={TRI_OPTIONS_FULL}
									value={triValue}
									onChange={(next) =>
										onChange(applyTriState(value, resource, next))
									}
									readEnabled={readAvailable}
									writeEnabled={writeAvailable}
									writeUnavailableReason={writeReason}
									disabled={disabled}
								/>
							</div>
						);
					})}

					<div className="pt-3 text-xs text-muted-foreground">
						Granting:{" "}
						<span className="text-foreground">
							{summary.scopeCount} scope
							{summary.scopeCount === 1 ? "" : "s"}
						</span>{" "}
						across{" "}
						<span className="text-foreground">
							{summary.resourceCount} resource
							{summary.resourceCount === 1 ? "" : "s"}
						</span>
					</div>
				</div>
			)}
		</div>
	);
}
