import { SANDBOX_COLORS } from "@autumn/shared";
import { FormLabel as FieldLabel } from "@/components/v2/form/FormLabel";
import { Input } from "@/components/v2/inputs/Input";
import { sandboxColorClass } from "@/hooks/sandbox/sandboxDisplay";
import { cn } from "@/lib/utils";
import { IconPicker } from "@/views/settings/sections/components/IconPicker";

export const SandboxFormFields = ({
	name,
	onNameChange,
	color,
	onColorChange,
	icon,
	onIconChange,
}: {
	name: string;
	onNameChange: (name: string) => void;
	color: string;
	onColorChange: (color: string) => void;
	icon: string;
	onIconChange: (icon: string) => void;
}) => {
	return (
		<>
			<div>
				<FieldLabel>Name</FieldLabel>
				<Input
					placeholder="Staging"
					value={name}
					onChange={(e) => onNameChange(e.target.value)}
				/>
			</div>
			<div>
				<FieldLabel>Color</FieldLabel>
				<div className="flex flex-wrap gap-2">
					{SANDBOX_COLORS.map((token) => (
						<button
							aria-label={`Color ${token}`}
							aria-pressed={color === token}
							className={cn(
								"flex h-7 w-7 items-center justify-center rounded-md border transition-colors",
								color === token
									? "border-primary ring-1 ring-primary"
									: "border-border hover:border-primary/50",
							)}
							key={token}
							onClick={() => onColorChange(token)}
							type="button"
						>
							<span
								className={cn(
									"h-3.5 w-3.5 rounded-full bg-current",
									sandboxColorClass(token),
								)}
							/>
						</button>
					))}
				</div>
			</div>
			<div>
				<FieldLabel>Icon</FieldLabel>
				<div className="flex items-center gap-2">
					<IconPicker value={icon} onChange={onIconChange} />
					<span className="text-muted-foreground text-xs">
						Click to choose an icon
					</span>
				</div>
			</div>
		</>
	);
};
