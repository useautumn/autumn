import { SANDBOX_COLORS } from "@autumn/shared";
import { sandboxColorClass } from "@/hooks/sandbox/sandboxDisplay";
import { cn } from "@/lib/utils";

export const SandboxColorSwatches = ({
	color,
	onColorChange,
}: {
	color: string;
	onColorChange: (color: string) => void;
}) => (
	<div className="flex flex-wrap gap-1.5">
		{SANDBOX_COLORS.map((token) => {
			const isSelected = color === token;
			return (
				<button
					aria-label={`Color ${token}`}
					aria-pressed={isSelected}
					className={cn(
						"flex size-7 items-center justify-center rounded-full outline-none transition-shadow duration-150 ease-out focus-visible:ring-2 focus-visible:ring-ring",
						sandboxColorClass(token),
						isSelected
							? "ring-[1.5px] ring-current"
							: "hover:ring-1 hover:ring-border",
					)}
					key={token}
					onClick={() => onColorChange(token)}
					type="button"
				>
					<span className="size-3.5 rounded-full bg-current" />
				</button>
			);
		})}
	</div>
);
