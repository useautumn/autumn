import { Check, Copy } from "@phosphor-icons/react";
import { useState } from "react";
import { toast } from "sonner";
import { StepBadge } from "@/components/v2/badges/StepBadge";
import { Button } from "@/components/v2/buttons/Button";
import { Input } from "@/components/v2/inputs/Input";
import { useSecretKeyStore } from "@/hooks/stores/useSecretKeyStore";
import type { Snippet } from "@/lib/snippets";
import { DevService } from "@/services/DevService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useEnv } from "@/utils/envUtils";
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
	const setSecretKey = useSecretKeyStore((s) => s.setSecretKey);
	const [loading, setLoading] = useState(false);
	const [copied, setCopied] = useState(false);
	const env = useEnv();
	const axiosInstance = useAxiosInstance({ env });

	const handleGenerateKey = async () => {
		setLoading(true);
		try {
			const { api_key } = await DevService.createAPIKey(axiosInstance, {
				name: "Autumn Onboarding",
			});
			setSecretKey(api_key);
		} catch (error) {
			console.error("Error:", error);
			toast.error("Failed to create API key");
		}
		setLoading(false);
	};

	const handleCopyKey = () => {
		navigator.clipboard.writeText(secretKey);
		setCopied(true);
		setTimeout(() => setCopied(false), 1000);
	};

	const envCode = secretKey
		? `AUTUMN_SECRET_KEY=${secretKey}`
		: "AUTUMN_SECRET_KEY=sk_test_42424242";

	return (
		<div className="flex flex-col gap-3">
			<div className="flex items-center gap-2.5">
				<StepBadge>{stepNumber}</StepBadge>
				<span className="font-medium text-sm">{snippet.title}</span>
			</div>
			<p className="text-sm text-t2 pl-[34px]">{snippet.description}</p>

			<div className="pl-[34px] flex flex-row gap-2">
				<Input
					placeholder="sk_test_42424242"
					value={secretKey}
					disabled
					className="flex-1"
				/>
				{secretKey ? (
					<Button variant="secondary" onClick={handleCopyKey}>
						{copied ? (
							<Check className="size-4" />
						) : (
							<Copy className="size-4" />
						)}
						Copy
					</Button>
				) : (
					<Button
						variant="secondary"
						onClick={handleGenerateKey}
						isLoading={loading}
					>
						Generate secret key
					</Button>
				)}
			</div>

			{!hideCodeBlock && (
				<div className="pl-[34px]">
					<SnippetCodeBlock snippet={snippet} codeOverride={envCode} />
				</div>
			)}
		</div>
	);
}
