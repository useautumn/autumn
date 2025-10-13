import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/v2/buttons/Button";
import {
	CodeGroup,
	CodeGroupCode,
	CodeGroupContent,
	CodeGroupCopyButton,
	CodeGroupList,
	CodeGroupTab,
} from "@/components/v2/CodeGroup";
import { Input } from "@/components/v2/inputs/Input";
import { DevService } from "@/services/DevService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useEnv } from "@/utils/envUtils";
import { CodeSpan } from "@/views/onboarding2/integrate/components/CodeSpan";
import { useIntegrationContext } from "./IntegrationContext";
import { SectionHeader } from "./SectionHeader";

export const EnvSection = () => {
	const { secretKey, setSecretKey } = useIntegrationContext();
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
			console.log("Error:", error);
			toast.error("Failed to create API key");
		}

		setLoading(false);
	};

	const handleCopy = () => {
		navigator.clipboard.writeText(secretKey);
		setCopied(true);
		setTimeout(() => {
			setCopied(false);
		}, 1000);
	};

	return (
		<div className="flex flex-col gap-6">
			<SectionHeader
				stepNumber={3}
				title={
					<span>
						Add the Autumn secret key to your <CodeSpan>{".env"}</CodeSpan> file
					</span>
				}
				className="gap-0"
			/>

			<div className="pl-[32px] flex flex-col gap-6">
				<div className="flex flex-col gap-2.5">
					<div className="flex flex-row gap-2">
						<Input
							placeholder="am_sk_12345"
							value={secretKey}
							disabled
							className="flex-1"
						/>
						{secretKey ? (
							<Button variant={"secondary"} onClick={handleCopy}>
								{copied ? (
									<Check className="size-4" />
								) : (
									<Copy className="size-4" />
								)}
								Copy
							</Button>
						) : (
							<Button
								variant={"skeleton"}
								onClick={handleGenerateKey}
								isLoading={loading}
							>
								Generate secret key
							</Button>
						)}
					</div>

					<div className="">
						<CodeGroup value=".env">
							<CodeGroupList>
								<CodeGroupTab value=".env">.env</CodeGroupTab>
								<CodeGroupCopyButton
									onCopy={() =>
										navigator.clipboard.writeText(
											`AUTUMN_SECRET_KEY=${secretKey}`,
										)
									}
								/>
							</CodeGroupList>
							<CodeGroupContent
								value=".env"
								copyText={`AUTUMN_SECRET_KEY=${secretKey}`}
							>
								<CodeGroupCode>{`AUTUMN_SECRET_KEY=${secretKey}`}</CodeGroupCode>
							</CodeGroupContent>
						</CodeGroup>
					</div>
				</div>
			</div>
		</div>
	);
};
