import {
	CodeGroup,
	CodeGroupCodeSolidColour,
	CodeGroupContent,
	CodeGroupCopyButton,
	CodeGroupList,
	CodeGroupTab,
} from "@/components/v2/CodeGroup";
import { FormLabel } from "@/components/v2/form/FormLabel";

interface RevenueCatWebhookUrlProps {
	env: string;
	orgId?: string;
}

export const RevenueCatWebhookUrl = ({
	env,
	orgId,
}: RevenueCatWebhookUrlProps) => {
	const webhookUrl = `https://api.useautumn.com/webhooks/revenuecat/${orgId}/${env}`;

	return (
		<div>
			<FormLabel className="mb-1 text-t2">
				<span>Webhook URL</span>
			</FormLabel>
			<p className="text-t3 text-sm mb-2">
				This is the webhook URL for your RevenueCat integration. You should
				provide this to RevenueCat as the webhook URL in your project settings.
			</p>
			<CodeGroup value={env} className="w-fit">
				<CodeGroupList>
					<CodeGroupTab value={env}>
						{env === "live" ? "Live" : "Sandbox"}
					</CodeGroupTab>
					<CodeGroupCopyButton
						onCopy={() => navigator.clipboard.writeText(webhookUrl)}
					/>
				</CodeGroupList>
				<CodeGroupContent
					value={env}
					copyText={webhookUrl}
					className="border-t w-fit"
				>
					<CodeGroupCodeSolidColour className="text-primary whitespace-nowrap">
						{webhookUrl}
					</CodeGroupCodeSolidColour>
				</CodeGroupContent>
			</CodeGroup>
		</div>
	);
};
