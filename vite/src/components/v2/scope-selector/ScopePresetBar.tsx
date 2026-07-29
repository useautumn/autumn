import type { ScopeString } from "@autumn/shared";
import { cn } from "@/lib/utils";

export type ScopePreset = {
	id: string;
	label: string;
	scopes: ScopeString[];
};

const scopesEqual = (a: readonly ScopeString[], b: readonly ScopeString[]) => {
	if (a.length !== b.length) return false;
	const set = new Set(a);
	return b.every((scope) => set.has(scope));
};

/**
 * Quick-apply presets for the scope grid. The active segment is derived from
 * the current selection, so it reflects "Default"/"Read only" and lights up
 * nothing once the user hand-tweaks a row (a custom set). Class names mirror
 * the per-row `TriStatePicker` so the two controls read as one family.
 */
export function ScopePresetBar({
	presets,
	value,
	onSelect,
	disabled = false,
}: {
	presets: ScopePreset[];
	value: readonly ScopeString[];
	onSelect: (scopes: ScopeString[]) => void;
	disabled?: boolean;
}) {
	const activeId = presets.find((preset) =>
		scopesEqual(preset.scopes, value),
	)?.id;

	return (
		<div className="flex items-center justify-between gap-3">
			<span className="text-sm text-muted-foreground">Preset</span>
			<div className="flex items-stretch">
				{presets.map((preset, index) => {
					const isActive = preset.id === activeId;
					const isFirst = index === 0;
					const isLast = index === presets.length - 1;

					return (
						<button
							key={preset.id}
							type="button"
							disabled={disabled}
							aria-pressed={isActive}
							onClick={() => onSelect([...preset.scopes])}
							className={cn(
								"flex items-center justify-center px-3 py-1 h-6 text-sm border transition-none outline-none whitespace-nowrap !bg-interactive-secondary cursor-pointer",
								"hover:text-primary focus-visible:text-primary",
								"disabled:opacity-50 disabled:cursor-not-allowed",
								isActive
									? "text-primary shadow-[0px_3px_4px_0px_inset_rgba(0,0,0,0.04)]"
									: "shadow-[0px_-3px_4px_0px_inset_rgba(0,0,0,0.04)]",
								isFirst && "rounded-l-lg border-l",
								!isFirst && "border-l-0",
								isLast && "rounded-r-lg",
							)}
						>
							{preset.label}
						</button>
					);
				})}
			</div>
		</div>
	);
}
