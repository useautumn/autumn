import { CopyableSpan } from "@/components/general/CopyablePre";
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
				<CopyableSpan
					text={webhookSecret}
					className="my-1 leading-6 px-2"
					copySize={18}
				/>
			) : (
				<Skeleton className="h-10 w-full" />
			)}
		</div>
	);
};
