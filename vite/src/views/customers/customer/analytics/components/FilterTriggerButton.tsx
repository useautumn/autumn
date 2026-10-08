import { Button, type ButtonProps } from "@autumn/ui";
import { CaretDownIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** "Label value ⌄" trigger shared by every Usage filter; spread props so popups can attach. */
export const FilterTriggerButton = ({
	label,
	value,
	leading,
	className,
	...props
}: Omit<ButtonProps, "value"> & {
	label?: string;
	value: ReactNode;
	leading?: ReactNode;
}) => (
	<Button
		variant="secondary"
		className={cn(
			"btn-secondary-popup min-w-0 max-w-72 [&>span]:min-w-0",
			className,
		)}
		{...props}
	>
		<span className="flex min-w-0 items-center gap-1">
			{leading}
			{label && (
				<span className="shrink-0 text-tertiary-foreground">{label}</span>
			)}
			<span className="flex min-w-0 items-center gap-1 text-foreground">
				{typeof value === "string" ? (
					<span className="truncate">{value}</span>
				) : (
					value
				)}
			</span>
			<CaretDownIcon className="ml-0.5 size-3 text-tertiary-foreground" />
		</span>
	</Button>
);
