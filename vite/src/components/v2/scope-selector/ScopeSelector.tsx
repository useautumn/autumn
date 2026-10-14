import {
	expandScopes,
	RESOURCE_METADATA,
	RESOURCES,
	type ResourceType,
	type ScopeString,
	Scopes,
} from "@autumn/shared";
import { Checkbox, ConditionalTooltip } from "@autumn/ui";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { type ScopePreset, ScopePresetBar } from "./ScopePresetBar";

export type ScopeSelectorProps = {
	value: ScopeString[];
	onChange: (scopes: ScopeString[]) => void;
	availableScopes?: readonly string[];
	requestedScopes?: readonly string[];
	resources?: readonly ResourceType[];
	allowUnrestricted?: boolean;
	disabled?: boolean;
	showPresets?: boolean;
	defaultScopes?: ScopeString[];
};

type TriState = "none" | "read" | "write";

type TriOption = { value: TriState; label: string };

const TRI_OPTIONS_FULL: TriOption[] = [
	{ value: "none", label: "None" },
	{ value: "read", label: "Read" },
	{ value: "write", label: "Write" },
];

const UNAVAILABLE_TOOLTIP = "You don't have this scope on your current session";
const NOT_REQUESTED_TOOLTIP = "This app didn't request this scope";
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

function TriStatePicker({
	options,
	value,
	onChange,
	readUnavailableReason,
	writeUnavailableReason,
	disabled,
}: {
	options: TriOption[];
	value: TriState;
	onChange: (next: TriState) => void;
	readUnavailableReason: string | null;
	writeUnavailableReason: string | null;
	disabled: boolean;
}) {
	return (
		<div className="flex items-stretch shrink-0 w-[216px]">
			{options.map((option, index) => {
				const isActive = value === option.value;
				const isFirst = index === 0;
				const isLast = index === options.length - 1;

				const tooltip =
					option.value === "write"
						? writeUnavailableReason
						: option.value === "read"
							? readUnavailableReason
							: null;
				const optionDisabled = disabled || !!tooltip;

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
	allowUnrestricted = true,
	availableScopes,
	requestedScopes,
	resources = RESOURCES,
	disabled = false,
	showPresets = false,
	defaultScopes,
}: ScopeSelectorProps) {
	const [restricted, setRestricted] = useState(value.length > 0);
	const showScopeGrid = allowUnrestricted ? restricted : true;

	const expandedAvailable = useMemo(
		() => (availableScopes ? expandScopes(availableScopes) : null),
		[availableScopes],
	);

	const isScopeOnSession = (scope: ScopeString): boolean => {
		if (!expandedAvailable) return true;
		if (expandedAvailable.has("admin")) return true;
		return expandedAvailable.has(scope);
	};

	const getUnavailableReason = (scope: ScopeString): string | null => {
		if (requestedScopes && !requestedScopes.includes(scope)) {
			return NOT_REQUESTED_TOOLTIP;
		}
		return isScopeOnSession(scope) ? null : UNAVAILABLE_TOOLTIP;
	};

	const isScopeAvailable = (scope: ScopeString) =>
		getUnavailableReason(scope) === null;

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

	const presets = useMemo<ScopePreset[]>(() => {
		const readOnlyScopes = resources
			.map((resource) => `${resource}:read` as ScopeString)
			.filter(isScopeAvailable);
		const list: ScopePreset[] = [];
		if (defaultScopes) {
			list.push({ id: "default", label: "Default", scopes: defaultScopes });
		}
		list.push({ id: "read", label: "Read only", scopes: readOnlyScopes });
		return list;
		// biome-ignore lint/correctness/useExhaustiveDependencies: stable derived fn
	}, [resources, defaultScopes, expandedAvailable, requestedScopes]);

	return (
		<div className="flex flex-col gap-3">
			{allowUnrestricted && (
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
			)}

			{showScopeGrid && showPresets && presets.length > 0 && (
				<ScopePresetBar
					presets={presets}
					value={value}
					onSelect={onChange}
					disabled={disabled}
				/>
			)}

			{showScopeGrid && (
				<div className="flex flex-col border-t border-border">
					{resources.map((resource) => {
						const meta = RESOURCE_METADATA[resource];
						const isAnalytics = resource === "analytics";

						const readReason = getUnavailableReason(
							`${resource}:read` as ScopeString,
						);
						const writeReason = isAnalytics
							? READ_ONLY_RESOURCE_TOOLTIP
							: getUnavailableReason(`${resource}:write` as ScopeString);

						const fullyUnavailable = !!readReason && !!writeReason;

						const triValue = deriveTriState(value, resource);

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
									readUnavailableReason={readReason}
									writeUnavailableReason={writeReason}
									disabled={disabled}
								/>
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
}
