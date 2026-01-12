import { StepBadge } from "@/components/v2/badges/StepBadge";
import { StackSelector } from "@/components/v2/StackSelector";
import type { Snippet, StackConfig } from "@/lib/snippets";
import { SnippetCodeBlock } from "./SnippetCodeBlock";

interface BackendSetupStepProps {
	snippet: Snippet;
	stepNumber: number;
	stackConfig: StackConfig;
	onStackConfigChange: (config: StackConfig) => void;
}

export function BackendSetupStep({
	snippet,
	stepNumber,
	stackConfig,
	onStackConfigChange,
}: BackendSetupStepProps) {
	return (
		<div className="flex flex-col gap-3">
			<div className="flex items-center gap-2.5">
				<StepBadge>{stepNumber}</StepBadge>
				<span className="font-medium text-sm">{snippet.title}</span>
			</div>
			<p className="text-sm text-t2 pl-[34px]">{snippet.description}</p>

			<div className="pl-[34px]">
				<StackSelector
					stackConfig={stackConfig}
					onStackConfigChange={onStackConfigChange}
				/>
			</div>

			<div className="pl-[34px]">
				<SnippetCodeBlock snippet={snippet} />
			</div>
		</div>
	);
}

