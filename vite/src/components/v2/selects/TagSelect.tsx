/** biome-ignore-all lint/a11y/useKeyWithClickEvents: needed*/
import { X } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectTrigger } from "./Select";

interface TagSelectOption {
	value: string;
	label: string;
}

interface TagSelectProps {
	value: string[];
	onChange: (values: string[]) => void;
	options: TagSelectOption[];
	placeholder?: string;
	formatTag?: (value: string) => string;
	renderContent?: (setOpen: (open: boolean) => void) => React.ReactNode;
	showAllProducts?: boolean;
}

export function TagSelect({
	value = [],
	onChange,
	options,
	placeholder = "Select...",
	formatTag,
	renderContent,
	showAllProducts = false,
}: TagSelectProps) {
	const [open, setOpen] = React.useState(false);

	const removeTag = (tagValue: string, e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		// Prevent the select from toggling
		e.nativeEvent.stopImmediatePropagation();
		onChange(value.filter((v) => v !== tagValue));
	};

	const getLabel = (val: string) => {
		const option = options.find((opt) => opt.value === val);
		return formatTag ? formatTag(val) : option?.label || val;
	};

	return (
		<Select open={open} onOpenChange={setOpen}>
			<SelectTrigger
				className={cn(
					"w-full",
					value.length > 0 ? "!h-auto min-h-input !py-2" : "h-input",
				)}
			>
				<div className="flex items-center flex-wrap gap-2 w-full pointer-events-none">
					{showAllProducts ? (
						<span className="text-t2">All Products</span>
					) : value.length === 0 ? (
						<span className="text-t6">{placeholder}</span>
					) : (
						value.map((val) => (
							<div
								key={val}
								className="flex items-center gap-1 border border-zinc-300 bg-zinc-50 rounded-lg pl-3 pr-2 py-1 text-xs pointer-events-auto"
								onPointerDown={(e) => {
									e.preventDefault();
									e.stopPropagation();
								}}
								onClick={(e) => {
									e.preventDefault();
									e.stopPropagation();
								}}
								onMouseDown={(e) => {
									e.preventDefault();
									e.stopPropagation();
								}}
							>
								<span className="truncate max-w-[200px] text-tiny">
									{getLabel(val)}
								</span>
								<button
									type="button"
									className="  pointer-events-auto"
									onPointerDown={(e) => {
										e.preventDefault();
										e.stopPropagation();
									}}
									onClick={(e) => removeTag(val, e)}
									onMouseDown={(e) => {
										e.preventDefault();
										e.stopPropagation();
									}}
								>
									<X className="size-3 text-t4" />
								</button>
							</div>
						))
					)}
				</div>
			</SelectTrigger>
			<SelectContent>{renderContent?.(setOpen)}</SelectContent>
		</Select>
	);
}
