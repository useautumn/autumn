import { XIcon } from "@phosphor-icons/react";
import { Button, type ButtonProps } from "@/components/v2/buttons/Button";
import { cn } from "@/lib/utils";

export function RemoveButton({ className, ...props }: ButtonProps) {
	return (
		<Button
			variant="skeleton"
			size="icon"
			aria-label="Remove"
			{...props}
			className={cn(
				"opacity-0 group-hover/row:opacity-100 text-t3 hover:text-destructive motion-reduce:opacity-100",
				className,
			)}
		>
			<XIcon size={12} weight="bold" />
		</Button>
	);
}
