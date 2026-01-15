import { StepBadge } from "@/components/v2/badges/StepBadge";
import { useSecretKeyStore } from "@/hooks/stores/useSecretKeyStore";
import type { Snippet } from "@/lib/snippets";
import { APIKeyInput } from "./APIKeyInput";
import { SnippetCodeBlock } from "./SnippetCodeBlock";

interface EnvSetupStepProps {
	snippet: Snippet;
	stepNumber: number;
	hideCodeBlock?: boolean;
}

export function EnvSetupStep({
	snippet,
	stepNumber,
	hideCodeBlock,
}: EnvSetupStepProps) {
	const secretKey = useSecretKeyStore((s) => s.secretKey);

	const envCode = secretKey
		? `AUTUMN_SECRET_KEY=${secretKey}`
		: "AUTUMN_SECRET_KEY=am_sk_test_42424242";

	return (
		<div className="flex flex-col gap-3">
			<div className="flex items-center gap-2.5">
				<StepBadge>{stepNumber}</StepBadge>
				<span className="font-medium text-sm">{snippet.title}</span>
			</div>
			<p className="text-sm text-t2 pl-[34px]">{snippet.description}</p>

			<APIKeyInput className="pl-[34px]" />

			{!hideCodeBlock && (
				<div className="pl-[34px]">
					<SnippetCodeBlock snippet={snippet} codeOverride={envCode} />
				</div>
			)}
		</div>
	);
}
