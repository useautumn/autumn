import { CornerDownLeftIcon, Loader2Icon } from "lucide-react";
import type { FormEvent, KeyboardEvent } from "react";
import { InputGroupButton } from "@/components/ui/input-group";
import { cn } from "@/lib/utils";

/**
 * Compact inline prompt input with submit button on the same line.
 * Designed for simple text input without attachments.
 */
export function CompactPromptInput({
	value,
	onChange,
	onSubmit,
	placeholder = "Describe changes...",
	isLoading,
	className,
}: {
	value: string;
	onChange: (value: string) => void;
	onSubmit: () => void;
	placeholder?: string;
	isLoading?: boolean;
	className?: string;
}) {
	const handleSubmit = (e: FormEvent) => {
		e.preventDefault();
		if (value.trim() && !isLoading) onSubmit();
	};

	const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
		if (e.key === "Enter" && !e.shiftKey && value.trim() && !isLoading) {
			e.preventDefault();
			onSubmit();
		}
	};

	return (
		<form onSubmit={handleSubmit} className={cn("w-full", className)}>
			<div className="flex items-center gap-2 rounded-xl border bg-white dark:bg-card px-3 py-2 dark:border-white/15 shadow-lg">
				<input
					type="text"
					value={value}
					onChange={(e) => onChange(e.target.value)}
					onKeyDown={handleKeyDown}
					placeholder={placeholder}
					disabled={isLoading}
					className="flex-1 bg-transparent text-sm outline-none placeholder:text-t4"
				/>
				<InputGroupButton
					type="submit"
					variant="primary"
					size="icon-sm"
					disabled={!value.trim() || isLoading}
				>
					{isLoading ? (
						<Loader2Icon className="size-4 animate-spin" />
					) : (
						<CornerDownLeftIcon className="size-4" />
					)}
				</InputGroupButton>
			</div>
		</form>
	);
}
