import { Input } from "@autumn/ui";
import { cn } from "@/lib/utils";

/** One size to pick, as a toggle; a badge beside its label and a caption line under it when given. */
export const AtomVolumeOption = ({
	label,
	badge,
	caption,
	isSelected,
	onSelect,
	disabled = false,
	className,
}: {
	label: string;
	badge?: React.ReactNode;
	caption?: string;
	isSelected: boolean;
	onSelect: () => void;
	disabled?: boolean;
	className?: string;
}) => (
	<button
		type="button"
		aria-pressed={isSelected}
		disabled={disabled}
		onClick={onSelect}
		className={cn(
			"flex cursor-pointer flex-col gap-0.5 rounded-md border bg-interactive-secondary text-left outline-none transition-colors duration-150",
			"hover:bg-interactive-secondary-hover focus-visible:border-primary disabled:pointer-events-none disabled:opacity-50",
			isSelected && "border-primary bg-primary/10 hover:bg-primary/10",
			className,
		)}
	>
		<span className="flex items-baseline gap-1.5 whitespace-nowrap text-[13px] leading-[18px] font-medium text-foreground">
			{label}
			{badge}
		</span>
		{caption && (
			<span className="text-[11px] leading-4 text-tertiary-foreground">
				{caption}
			</span>
		)}
	</button>
);

/** The whole GiB per replica typed for Custom. */
export const AtomCustomVolumeInput = ({
	value,
	onChange,
	hasError,
	disabled = false,
	className,
}: {
	value: string;
	onChange: (value: string) => void;
	hasError: boolean;
	disabled?: boolean;
	className?: string;
}) => (
	<div className={cn("flex items-center gap-2", className)}>
		<Input
			aria-label="Custom size per replica in GiB"
			inputMode="numeric"
			placeholder="e.g. 200"
			autoFocus
			className="w-28"
			variant={hasError ? "destructive" : "default"}
			value={value}
			disabled={disabled}
			onChange={(event) => onChange(event.target.value)}
		/>
		<span className="text-sm text-tertiary-foreground">GiB</span>
	</div>
);
