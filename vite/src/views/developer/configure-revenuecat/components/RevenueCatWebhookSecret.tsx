import {
	CodeGroup,
	CodeGroupCodeSolidColour,
	CodeGroupContent,
	CodeGroupCopyButton,
	CodeGroupList,
	CodeGroupTab,
} from "@/components/v2/CodeGroup";
import { Skeleton } from "@/components/ui/skeleton";
import { FormLabel } from "@/components/v2/form/FormLabel";

interface RevenueCatWebhookSecretProps {
	env: string;
	webhookSecret?: string;
}

export const RevenueCatWebhookSecret = ({
	env,
	webhookSecret,
}: RevenueCatWebhookSecretProps) => {
	return (
		<div>
			<FormLabel className="mb-1">
				<span className="text-t2">
					{env === "live" ? "Webhook Secret" : "Sandbox Webhook Secret"}
				</span>
			</FormLabel>
			<p className="text-t3 text-sm mb-2">
				This is the webhook secret for RevenueCat events. You must set this
				value in the RevenueCat console.
			</p>
			{webhookSecret ? (
				<CodeGroup value={env}>
					<CodeGroupList>
						<CodeGroupTab value={env}>
							{env === "live" ? "Live" : "Sandbox"}
						</CodeGroupTab>
						<CodeGroupCopyButton
							className="h-full"
							onCopy={() => navigator.clipboard.writeText(webhookSecret)}
						/>
					</CodeGroupList>
					<CodeGroupContent
						value={env}
						copyText={webhookSecret}
						className="p-2 border-t-0"
					>
						<CodeGroupCodeSolidColour className="text-primary">
							{webhookSecret}
						</CodeGroupCodeSolidColour>
					</CodeGroupContent>
				</CodeGroup>
			) : (
				<Skeleton className="h-10 w-full" />
			)}
		</div>
	);
};
