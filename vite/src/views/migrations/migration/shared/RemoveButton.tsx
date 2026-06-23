import { Button } from "@autumn/ui";
import { XIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

export function RemoveButton({
	onClick,
	className,
}: {
	onClick: () => void;
	className?: string;
}) {
	return (
		<Button
			variant="skeleton"
			size="icon"
			aria-label="Remove"
			onClick={onClick}
			className={cn(
				"opacity-0 group-hover/row:opacity-100 text-tertiary-foreground hover:text-destructive! motion-reduce:opacity-100",
				className,
			)}
		>
			<XIcon size={12} weight="bold" />
		</Button>
	);
}
