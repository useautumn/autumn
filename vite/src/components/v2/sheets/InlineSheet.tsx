import { useId } from "react";
import { InfoTooltip } from "@/components/general/modal-components/InfoTooltip";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { Checkbox } from "../checkboxes/checkbox";

interface SheetHeaderProps {
	title: string;
	description: string;
}

export function SheetHeader({ title, description }: SheetHeaderProps) {
	return (
		<div className="p-6 pb-0">
			<h2 className="text-main">{title}</h2>

			{/* check typography */}
			<p className="text-form-text">{description}</p>
			<Separator className="mt-6" />
		</div>
	);
}

interface SheetSectionProps {
	title: string | React.ReactNode;
	description?: string;
	checked?: boolean;
	setChecked?: (checked: boolean) => void;
	infoContent?: string;
	children: React.ReactNode;
	withSeparator?: boolean;
}

export function SheetSection({
	title,
	description,
	checked = false,
	setChecked,
	infoContent,
	children,
	withSeparator = true,
}: SheetSectionProps) {
	const id = useId();

	const withTogle = setChecked !== undefined;
	return (
		<>
			<div className="p-6">
				<label htmlFor={id} className="flex items-center gap-2 mb-2 w-fit">
					{withTogle && (
						<div className="flex items-center gap-2">
							<Checkbox
								id={id}
								checked={checked}
								onCheckedChange={setChecked}
							/>
						</div>
					)}
					<div className="flex items-start gap-2 min-h-fit">
						{typeof title === "string" ? (
							<h3 className={cn("text-sub select-none")}>{title}</h3>
						) : (
							<div className={cn("text-sub select-none flex-1 min-w-0")}>
								{title}
							</div>
						)}
						{infoContent && <InfoTooltip>{infoContent}</InfoTooltip>}
					</div>
				</label>
				{description && <p className="text-form-text">{description}</p>}
				{children}
			</div>
			<div className="px-6">
				<Separator />
			</div>
		</>
	);
}
