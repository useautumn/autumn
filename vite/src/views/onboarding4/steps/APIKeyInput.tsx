import { Check, Copy } from "@phosphor-icons/react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/v2/buttons/Button";
import { Input } from "@/components/v2/inputs/Input";
import { useSecretKeyStore } from "@/hooks/stores/useSecretKeyStore";
import { DevService } from "@/services/DevService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useEnv } from "@/utils/envUtils";

interface APIKeyInputProps {
	className?: string;
}

export function APIKeyInput({ className }: APIKeyInputProps) {
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

	return (
		<div className={className}>
			<div className="flex flex-row gap-2">
				<Input
					placeholder="am_sk_test_42424242"
					value={secretKey}
					disabled
					className="flex-1 truncate"
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
		</div>
	);
}
