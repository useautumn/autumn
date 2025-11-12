import type {
	UpsertVercelProcessorConfig,
	VercelMarketplaceMode,
} from "@autumn/shared";
import type { AxiosInstance } from "axios";
import { useState } from "react";
import { toast } from "sonner";
import { AppPortal } from "svix-react";
import { PageSectionHeader } from "@/components/general/PageSectionHeader";
import { Button } from "@/components/v2/buttons/Button";
import {
	CodeGroup,
	CodeGroupCodeSolidColour,
	CodeGroupContent,
	CodeGroupCopyButton,
	CodeGroupList,
	CodeGroupTab,
} from "@/components/v2/CodeGroup";
import { FormLabel } from "@/components/v2/form/FormLabel";
import { Input } from "@/components/v2/inputs/Input";
import { useOrg } from "@/hooks/common/useOrg";
import { useVercelQuery } from "@/hooks/queries/useVercelQuery";
import { OrgService } from "@/services/OrgService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useEnv } from "@/utils/envUtils";
import { getBackendErr } from "@/utils/genUtils";
import LoadingScreen from "@/views/general/LoadingScreen";

export const ConfigureVercel = () => {
	const { org, isLoading, mutate } = useOrg();
	const {
		svixDashboardUrl,
		isLoading: isVercelLoading,
		error: vercelError,
		refetch: vercelRefetch,
	} = useVercelQuery();
	const env = useEnv();
	const axiosInstance = useAxiosInstance();
	const [vercelConfig, setVercelConfig] = useState({
		client_integration_id: "",
		client_secret: "",
		webhook_url: "",
		custom_payment_method: "",
		marketplace_mode: "" as VercelMarketplaceMode,
	});

	const handleSaveVercelConfig = async (
		axiosInstance: AxiosInstance,
		vercelConfig: {
			client_integration_id?: string;
			client_secret?: string;
			webhook_url?: string;
			custom_payment_method?: string;
			marketplace_mode?: VercelMarketplaceMode;
		},
	) => {
		try {
			// Map generic field names to env-specific field names
			const filteredConfig: UpsertVercelProcessorConfig = {};

			// Map to correct field names based on current env
			if (vercelConfig.client_integration_id?.trim()) {
				if (env === "live") {
					filteredConfig.client_integration_id =
						vercelConfig.client_integration_id.trim();
				} else {
					filteredConfig.sandbox_client_id =
						vercelConfig.client_integration_id.trim();
				}
			}

			if (vercelConfig.client_secret?.trim()) {
				if (env === "live") {
					filteredConfig.client_secret = vercelConfig.client_secret.trim();
				} else {
					filteredConfig.sandbox_client_secret =
						vercelConfig.client_secret.trim();
				}
			}

			if (vercelConfig.webhook_url?.trim()) {
				if (env === "live") {
					filteredConfig.webhook_url = vercelConfig.webhook_url.trim();
				} else {
					filteredConfig.sandbox_webhook_url = vercelConfig.webhook_url.trim();
				}
			}

			if (vercelConfig.custom_payment_method?.trim()) {
				filteredConfig.custom_payment_method = {
					[env]: vercelConfig.custom_payment_method.trim(),
				};
			}

			if (vercelConfig.marketplace_mode) {
				filteredConfig.marketplace_mode = vercelConfig.marketplace_mode;
			}

			const res = await OrgService.upsertVercelConfig(
				axiosInstance,
				filteredConfig,
			);
			if (res.status === 200) {
				toast.success("Vercel config updated successfully");
				await mutate();
				// Clear the form after successful update
				setVercelConfig({
					client_integration_id: "",
					client_secret: "",
					webhook_url: "",
					custom_payment_method: "",
					marketplace_mode:
						filteredConfig.marketplace_mode as VercelMarketplaceMode,
				});
			} else {
				toast.error("Failed to update Vercel config");
			}
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to update Vercel config"));
		}
	};

	return !isLoading ? (
		<div className="flex flex-col gap-4">
			<PageSectionHeader
				title={`Vercel Settings (${env === "live" ? "Live" : "Sandbox"})`}
			/>
			<div className="px-10 flex-col gap-4 grid grid-cols-2 grid-rows-2">
				<div>
					<FormLabel className="mb-1">
						<span className="text-t2">Client (Integration) ID</span>
					</FormLabel>
					<p className="text-t3 text-sm mb-2">
						This is the client (integration) ID for your Vercel project in {env}{" "}
						mode.
					</p>
					<Input
						value={vercelConfig.client_integration_id || ""}
						onChange={(e) =>
							setVercelConfig({
								...vercelConfig,
								client_integration_id: e.target.value,
							})
						}
						placeholder={
							org?.processor_configs?.vercel?.client_integration_id ||
							"eg. oac_2ttbjWcOQ0pyH1v9wYkROKB3"
						}
					/>
				</div>

				<div>
					<FormLabel className="mb-1">
						<span className="text-t2">Client (Integration) Secret</span>
					</FormLabel>
					<p className="text-t3 text-sm mb-2">
						This is the client (integration) secret for your Vercel project in{" "}
						{env} mode.
					</p>
					<Input
						value={vercelConfig.client_secret || ""}
						onChange={(e) =>
							setVercelConfig({
								...vercelConfig,
								client_secret: e.target.value,
							})
						}
						placeholder={
							org?.processor_configs?.vercel?.client_secret ||
							"eg. VAxvZFz8ST4d5b9pa2EuXkWG"
						}
					/>
				</div>

				<div>
					<FormLabel className="mb-1">
						<span className="text-t2">Webhook URL</span>
					</FormLabel>
					<p className="text-t3 text-sm mb-2">
						This is the webhook URL for your Vercel project in {env} mode.
					</p>
					<Input
						value={vercelConfig.webhook_url || ""}
						onChange={(e) =>
							setVercelConfig({ ...vercelConfig, webhook_url: e.target.value })
						}
						placeholder={
							org?.processor_configs?.vercel?.webhook_url ||
							"eg. https://useautumn.com/api/vercel/webhook"
						}
					/>
				</div>

				<div>
					<FormLabel className="mb-1">
						<span className="text-t2">Custom Payment Method ID</span>
					</FormLabel>
					<p className="text-t3 text-sm mb-2">
						This is the custom payment method ID for your Vercel integration in{" "}
						{env} mode.
					</p>
					<Input
						value={vercelConfig.custom_payment_method || ""}
						onChange={(e) =>
							setVercelConfig({
								...vercelConfig,
								custom_payment_method: e.target.value,
							})
						}
						placeholder={
							org?.processor_configs?.vercel?.custom_payment_method ||
							"eg. cpmt_Yij7OBT6Fxu0UOa12XguA0vGB"
						}
					/>
				</div>

				{/* <div className="col-span-2 w-full">
					<FormLabel className="mb-1">
						<span className="text-t2">Marketplace Mode</span>
					</FormLabel>
					<p className="text-t3 text-sm mb-2">
						This is the marketplace mode for your Vercel integration in {env}{" "}
						mode.
					</p>
					<Select
						value={
							vercelConfig.marketplace_mode ||
							org?.processor_configs?.vercel?.marketplace_mode ||
							"installation"
						}
						onValueChange={(value) =>
							setVercelConfig({
								...vercelConfig,
								marketplace_mode: value as VercelMarkeplaceMode,
							})
						}
					>
						<SelectTrigger>
							<SelectValue placeholder="Select marketplace mode" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="installation">Installation</SelectItem>
							<SelectItem value="resource">Resource</SelectItem>
						</SelectContent>
					</Select>
				</div> */}

				<div className="flex gap-2 mt-2">
					<Button
						className="w-6/12"
						disabled={false}
						onClick={() => handleSaveVercelConfig(axiosInstance, vercelConfig)}
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
						This is the base URL for connecting to your Vercel project. You
						should provide this to Vercel as the webhook URL.
					</p>
					<div className="grid grid-cols-2 grid-rows-1 gap-4">
						<CodeGroup value={env} className="">
							<CodeGroupList>
								<CodeGroupTab value={env}>
									{env === "live" ? "Live" : "Sandbox"}
								</CodeGroupTab>
								<CodeGroupCopyButton
									onCopy={() =>
										navigator.clipboard.writeText(
											`https://api.useautumn.com/webhooks/vercel/${org?.id}/${env}`,
										)
									}
								/>
							</CodeGroupList>
							<CodeGroupContent
								value={env}
								copyText={`https://api.useautumn.com/webhooks/vercel/${org?.id}/${env}`}
								className="border-t-1"
							>
								<CodeGroupCodeSolidColour className="text-primary">{`https://api.useautumn.com/webhooks/vercel/${org?.id}/${env}`}</CodeGroupCodeSolidColour>
							</CodeGroupContent>
						</CodeGroup>
					</div>
				</div>
			</div>
			<PageSectionHeader title="Vercel Sink" />
			<div className="px-10 flex flex-col gap-4">
				{svixDashboardUrl && !isVercelLoading && !vercelError ? (
					<AppPortal
						url={svixDashboardUrl}
						style={{
							height: "100%",
							borderRadius: "none",
							// marginTop: "0.5rem",
							// paddingLeft: "1rem",
							// paddingRight: "1rem",
						}}
						fullSize
					/>
				) : (
					<div className="text-muted-foreground">Dashboard URL not found.</div>
				)}
			</div>
		</div>
	) : (
		<LoadingScreen />
	);
};
