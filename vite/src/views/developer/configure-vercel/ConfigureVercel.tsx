import type { VercelProcessorConfig } from "@autumn/shared";
import { useState } from "react";
import { PageSectionHeader } from "@/components/general/PageSectionHeader";
import { Button } from "@/components/v2/buttons/Button";
import {
	CodeGroup,
	CodeGroupCode,
	CodeGroupContent,
} from "@/components/v2/CodeGroup";
import { FormLabel } from "@/components/v2/form/FormLabel";
import { Input } from "@/components/v2/inputs/Input";
import { useOrg } from "@/hooks/common/useOrg";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useEnv } from "@/utils/envUtils";

export const ConfigureVercel = () => {
	const { org, mutate } = useOrg();
	const env = useEnv();
	const axiosInstance = useAxiosInstance();
	const [vercelConfig, setVercelConfig] = useState<VercelProcessorConfig>({
		client_integration_id: "",
		client_secret: "",
		webhook_url: "",
	});

	return (
		<div className="flex flex-col gap-4">
			<PageSectionHeader title="Vercel Settings" />
			<div className="px-10 max-w-[600px] flex flex-col gap-4">
				<div>
					<FormLabel className="mb-1">
						<span className="text-t2">Client (Integration) ID</span>
					</FormLabel>
					<p className="text-t3 text-sm mb-2">
						This is the client (integration) ID for your Vercel project.
					</p>
					<Input
						value={vercelConfig.client_integration_id}
						onChange={() => {}}
						placeholder="eg. oac_2ttbjWcOQ0pyH1v9wYkROKB3"
					/>
				</div>

				<div>
					<FormLabel className="mb-1">
						<span className="text-t2">Client (Integration) Secret</span>
					</FormLabel>
					<p className="text-t3 text-sm mb-2">
						This is the client (integration) secret for your Vercel project.
					</p>
					<Input
						value={""}
						onChange={() => {}}
						placeholder="eg. VAxvZFz8ST4d5b9pa2EuXkWG"
					/>
				</div>

				<div>
					<FormLabel className="mb-1">
						<span className="text-t2">Webhook URL</span>
					</FormLabel>
					<p className="text-t3 text-sm mb-2">
						This is the webhook URL for your Vercel project.
					</p>
					<Input
						value={""}
						onChange={() => {}}
						placeholder="eg. https://useautumn.com/api/vercel/webhook"
					/>
				</div>

				<div className="flex gap-2  mt-2">
					<Button
						className="w-6/12"
						disabled={false}
						onClick={() => {}}
						isLoading={false}
					>
						Save
					</Button>
				</div>
			</div>
			<PageSectionHeader title="Vercel Integration" />
			<div className="px-10 flex flex-col gap-4">
				<div>
					<FormLabel className="mb-1 text-t2">
						<span>Base URL</span>
					</FormLabel>
					<p className="text-t3 text-sm mb-2">
						This is the base URL for connecting to your Vercel project.
					</p>
					{/* <CopyablePre
						text={`https://api.useautumn.com/webhooks/vercel/${org?.id}/${env}`}
					/> */}
					<CodeGroup value="base_url">
						{/* <CodeGroupList>
							<CodeGroupTab value="base_url">base_url</CodeGroupTab>
							<CodeGroupCopyButton
								onCopy={() =>
									navigator.clipboard.writeText(
										`https://api.useautumn.com/webhooks/vercel/${org?.id}/${env}`,
									)
								}
							/>
						</CodeGroupList> */}
						<CodeGroupContent
							value="base_url"
							copyText={`https://api.useautumn.com/webhooks/vercel/${org?.id}/${env}`}
							className="border-t-1"
						>
							<CodeGroupCode>{`https://api.useautumn.com/webhooks/vercel/${org?.id}/${env}`}</CodeGroupCode>
						</CodeGroupContent>
					</CodeGroup>
				</div>
			</div>
		</div>
	);
};
