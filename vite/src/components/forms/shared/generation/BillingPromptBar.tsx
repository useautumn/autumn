import { InputGroupButton } from "@autumn/ui";
import { ArrowElbowDownLeftIcon } from "@phosphor-icons/react";
import { LoaderIcon } from "lucide-react";
import type { FormEvent, KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import { useBillingPromptVisibility } from "./useBillingPromptVisibility";

export type BillingGenerationStatus = "idle" | "generating";

export type BillingGenerationState = {
	status: BillingGenerationStatus;
	prompt: string;
	setPrompt: (value: string) => void;
	generate: () => void;
};

export function BillingPromptBar({
	generation,
	placeholder,
}: {
	generation: BillingGenerationState;
	placeholder: string;
}) {
	const visible = useBillingPromptVisibility((state) => state.visible);
	const { status, prompt, setPrompt, generate } = generation;
	const isGenerating = status === "generating";
	if (!visible) return null;
	const canSubmit = prompt.trim().length > 0 && !isGenerating;

	const handleSubmit = (event: FormEvent) => {
		event.preventDefault();
		if (canSubmit) generate();
	};

	const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
		if (event.key === "Enter" && !event.shiftKey) {
			event.preventDefault();
			if (canSubmit) generate();
		}
	};

	return (
		<form onSubmit={handleSubmit} className="relative block w-full">
			<LoaderIcon
				className={cn(
					"pointer-events-none absolute top-1.5 left-2.5 size-4 transition-colors duration-150",
					isGenerating
						? "animate-spin text-foreground"
						: "text-tertiary-foreground",
				)}
			/>
			<textarea
				value={prompt}
				onChange={(event) => setPrompt(event.target.value)}
				onKeyDown={handleKeyDown}
				placeholder={placeholder}
				disabled={isGenerating}
				rows={1}
				className={cn(
					"input-base input-shadow-default input-state-focus rounded-lg",
					"field-sizing-content max-h-40 min-h-7 resize-none outline-none [scrollbar-gutter:stable]",
					"block w-full! py-1! pl-8! pr-8! text-sm",
					"disabled:cursor-not-allowed disabled:opacity-50",
				)}
			/>
			<InputGroupButton
				type="submit"
				variant="secondary"
				size="icon-sm"
				disabled={!canSubmit}
				aria-label="Generate"
				className="absolute bottom-1 right-1 size-5! rounded-md text-tertiary-foreground hover:text-foreground disabled:opacity-100"
			>
				<ArrowElbowDownLeftIcon className="size-3" weight="bold" />
			</InputGroupButton>
		</form>
	);
}
