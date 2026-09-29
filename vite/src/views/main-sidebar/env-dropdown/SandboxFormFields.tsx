import { FormLabel as FieldLabel, Input } from "@autumn/ui";
import { IconPicker } from "@/views/settings/sections/components/IconPicker";
import { SandboxColorSwatches } from "./SandboxColorSwatches";

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
				<SandboxColorSwatches color={color} onColorChange={onColorChange} />
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
