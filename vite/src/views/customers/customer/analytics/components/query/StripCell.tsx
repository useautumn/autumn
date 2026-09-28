import { CaretDownIcon } from "@phosphor-icons/react";
import {
	type ComponentPropsWithoutRef,
	forwardRef,
	type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

/** One labelled column of the query strip; also a popover or menu trigger. */
export const StripCell = forwardRef<
	HTMLButtonElement,
	ComponentPropsWithoutRef<"button"> & {
		label: string;
		value: ReactNode;
		isPlaceholder?: boolean;
	}
>(({ label, value, isPlaceholder = false, className, ...props }, ref) => (
	<button
		ref={ref}
		type="button"
		className={cn(
			"group flex flex-col justify-center gap-[3px] min-w-0 h-full px-3.5 text-left border-r last-of-type:border-r-0 hover:bg-muted/60 data-[popup-open]:bg-muted/60 aria-expanded:bg-muted/60 transition-colors",
			className,
		)}
		{...props}
	>
		<span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-subtle">
			{label}
		</span>
		<span className="flex items-center gap-2 min-w-0 text-[13px] leading-4">
			<span
				className={cn(
					"flex items-center gap-1.5 flex-1 min-w-0 truncate",
					isPlaceholder ? "text-tertiary-foreground" : "text-foreground",
				)}
				title={typeof value === "string" ? value : undefined}
			>
				{/* A bare text node in a flex box clips without an ellipsis. */}
				{typeof value === "string" ? (
					<span className="truncate">{value}</span>
				) : (
					value
				)}
			</span>
			<CaretDownIcon
				size={10}
				weight="bold"
				className="shrink-0 text-subtle group-hover:text-tertiary-foreground"
			/>
		</span>
	</button>
));
StripCell.displayName = "StripCell";
