import { PlusIcon } from "@phosphor-icons/react";
import { Button } from "@/components/v2/buttons/Button";
import { cn } from "@/lib/utils";

export function AddButton({
	label,
	onClick,
	fullWidth = false,
}: {
	label: string;
	onClick: () => void;
	fullWidth?: boolean;
}) {
	return (
		<Button
			variant="skeleton"
			size="sm"
			onClick={onClick}
			className={cn(
				"text-t4 hover:text-t2",
				fullWidth && "w-full",
			)}
		>
			<PlusIcon size={10} />
			{label}
		</Button>
	);
}
