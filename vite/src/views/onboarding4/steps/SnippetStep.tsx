import { StepBadge } from "@/components/v2/badges/StepBadge";
import type { Snippet } from "@/lib/snippets";
import { SnippetCodeBlock } from "./SnippetCodeBlock";

interface SnippetStepProps {
	snippet: Snippet;
	stepNumber: number;
}

export function SnippetStep({ snippet, stepNumber }: SnippetStepProps) {
	return (
		<div className="flex flex-col gap-3">
			<div className="flex items-center gap-2.5">
				<StepBadge>{stepNumber}</StepBadge>
				<span className="font-medium text-sm">{snippet.title}</span>
			</div>
			<p className="text-sm text-t2 pl-[34px]">{snippet.description}</p>
			<div className="pl-[34px]">
				<SnippetCodeBlock snippet={snippet} />
			</div>
		</div>
	);
}
