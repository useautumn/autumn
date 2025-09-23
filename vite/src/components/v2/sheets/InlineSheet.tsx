import { useId } from "react";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { Checkbox } from "../checkboxes/Checkbox";

interface SheetHeaderProps {
	title: string;
	description: string;
}

export function SheetHeader({ title, description }: SheetHeaderProps) {
	return (
		<div className="p-4 pb-0">
			<h2 className="text-main">{title}</h2>

			{/* check typography */}
			<p className="text-form-text">{description}</p>
			<Separator className="mt-6" />
		</div>
	);
}

interface SheetSectionProps {
	title: string;
	description?: string;
	checked?: boolean;
	setChecked?: (checked: boolean) => void;

	children: React.ReactNode;
	withSeparator?: boolean;
}

export function SheetSection({
	title,
	description,
	checked = true,
	setChecked,

	children,
	withSeparator = true,
}: SheetSectionProps) {
	const id = useId();

	const withTogle = setChecked !== undefined;
	return (
		<>
			<div className="p-4">
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
					<div className={cn("flex items-center gap-2")}>
						<h3 className={cn("text-sub select-none")}>{title}</h3>
					</div>
				</label>
				{description && (
					<p
						className={cn(
							"text-body-secondary mb-4",
							checked === false && "opacity-50",
						)}
					>
						{description}
					</p>
				)}
				{children}
			</div>
			{withSeparator && (
				<div className="px-4">
					<Separator />
				</div>
			)}
		</>
	);
}
