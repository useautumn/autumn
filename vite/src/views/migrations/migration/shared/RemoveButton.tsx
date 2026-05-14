import { XIcon } from "@phosphor-icons/react";
import { Button } from "@/components/v2/buttons/Button";
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
				"opacity-0 group-hover/row:opacity-100 text-t3 hover:text-destructive! motion-reduce:opacity-100",
				className,
			)}
		>
			<XIcon size={12} weight="bold" />
		</Button>
	);
}
