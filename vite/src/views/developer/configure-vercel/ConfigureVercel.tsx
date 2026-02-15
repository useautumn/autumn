import type {
	UpsertVercelProcessorConfig,
	VercelMarketplaceMode,
} from "@autumn/shared";
import type { AxiosInstance } from "axios";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppPortal } from "svix-react";
import { Button } from "@/components/v2/buttons/Button";
import {
	CodeGroup,
	CodeGroupCodeSolidColour,
	CodeGroupContent,
	CodeGroupCopyButton,
	CodeGroupList,
	CodeGroupTab,
} from "@/components/v2/CodeGroup";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/v2/cards/Card";
import { FormLabel } from "@/components/v2/form/FormLabel";
import { Input } from "@/components/v2/inputs/Input";
import { TagSelect } from "@/components/v2/selects/TagSelect";
import { useTheme } from "@/contexts/ThemeProvider";
import { useOrg } from "@/hooks/common/useOrg";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { useVercelQuery } from "@/hooks/queries/useVercelQuery";
import { OrgService } from "@/services/OrgService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useEnv } from "@/utils/envUtils";
import { getBackendErr } from "@/utils/genUtils";
import LoadingScreen from "@/views/general/LoadingScreen";

type VercelConfigState = {
	client_integration_id: string;
	client_secret: string;
	webhook_url: string;
	custom_payment_method: string;
	marketplace_mode: VercelMarketplaceMode;
	allowed_product_ids_live: string[];
	allowed_product_ids_sandbox: string[];
};

export const ConfigureVercel = () => {
	const { org, isLoading, mutate } = useOrg();
	const {
		svixDashboardUrl,
		isLoading: isVercelLoading,
		error: vercelError,
	} = useVercelQuery();
	const { products } = useProductsQuery();
	const env = useEnv();
	const axiosInstance = useAxiosInstance();
	const [vercelConfig, setVercelConfig] = useState<VercelConfigState>({
		client_integration_id: "",
		client_secret: "",
		webhook_url: "",
		custom_payment_method: "",
		marketplace_mode: "" as VercelMarketplaceMode,
		allowed_product_ids_live: [],
		allowed_product_ids_sandbox: [],
	});

	const activeAllowedProductIds =
		env === "live"
			? vercelConfig.allowed_product_ids_live
			: vercelConfig.allowed_product_ids_sandbox;

	const setActiveAllowedProductIds = (values: string[]) => {
		setVercelConfig((prev) => ({
			...prev,
			...(env === "live"
				? { allowed_product_ids_live: values }
				: { allowed_product_ids_sandbox: values }),
		}));
	};

	useEffect(() => {
		const vercelOrgConfig = org?.processor_configs?.vercel;
		if (!vercelOrgConfig) {
			return;
		}

		const fallbackAllowedProductIds = vercelOrgConfig.allowed_product_ids ?? [];

		setVercelConfig((prev) => ({
			...prev,
			allowed_product_ids_live:
				vercelOrgConfig.allowed_product_ids_live ??
				fallbackAllowedProductIds,
			allowed_product_ids_sandbox:
				vercelOrgConfig.allowed_product_ids_sandbox ??
				fallbackAllowedProductIds,
		}));
	}, [org]);

	const productOptions = products
		.slice()
		.sort((a, b) => a.name.localeCompare(b.name))
		.map((product) => ({
			label: `${product.name} (${product.id})`,
			value: product.id,
		}));

	const currentClientIntegrationId =
		env === "live"
			? org?.processor_configs?.vercel?.client_integration_id
			: org?.processor_configs?.vercel?.sandbox_client_id;
	const currentClientSecret =
		env === "live"
			? org?.processor_configs?.vercel?.client_secret
			: org?.processor_configs?.vercel?.sandbox_client_secret;
	const currentWebhookUrl =
		env === "live"
			? org?.processor_configs?.vercel?.webhook_url
			: org?.processor_configs?.vercel?.sandbox_webhook_url;
	const currentCustomPaymentMethod =
		env === "live"
			? org?.processor_configs?.vercel?.custom_payment_method
			: org?.processor_configs?.vercel?.custom_payment_method;

	const { isDark } = useTheme();

	const handleSaveVercelConfig = async (
		axiosInstance: AxiosInstance,
		vercelConfig: VercelConfigState,
	) => {
		try {
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

			if (env === "live") {
				filteredConfig.allowed_product_ids_live =
					vercelConfig.allowed_product_ids_live;
			} else {
				filteredConfig.allowed_product_ids_sandbox =
					vercelConfig.allowed_product_ids_sandbox;
			}

			const res = await OrgService.upsertVercelConfig(
				axiosInstance,
				filteredConfig,
			);
			if (res.status === 200) {
				toast.success("Vercel config updated successfully");
				await mutate();
				// Clear credential fields, keep product filters
				setVercelConfig((prev) => ({
					...prev,
					client_integration_id: "",
					client_secret: "",
					webhook_url: "",
					custom_payment_method: "",
					marketplace_mode: filteredConfig.marketplace_mode as VercelMarketplaceMode,
				}));
			} else {
				toast.error("Failed to update Vercel config");
			}
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to update Vercel config"));
		}
	};

	return !isLoading ? (
		<div className="flex flex-col gap-4 pb-10">
			<div className="flex flex-col gap-4">
				<Card className="shadow-none bg-interactive-secondary">
					<CardHeader>
						<CardTitle>
							Vercel Settings ({env === "live" ? "Live" : "Sandbox"})
						</CardTitle>
						<CardDescription>
							Create an integration in the{" "}
							<a
								href="https://vercel.com/dashboard/integrations/console"
								target="_blank"
								rel="noopener noreferrer"
								className="text-primary"
							>
								Integrations Console
							</a>{" "}
							of the Vercel Dashboard. Then copy over the following parameters.
						</CardDescription>
					</CardHeader>
					<CardContent className="flex flex-col gap-4">
						<div className="grid grid-cols-2 gap-4 w-full">
							<div>
								<FormLabel className="mb-1">
									<span className="text-t2">Client (Integration) ID</span>
								</FormLabel>
								<Input
									value={vercelConfig.client_integration_id || ""}
									onChange={(e) =>
										setVercelConfig((prev) => ({
											...prev,
											client_integration_id: e.target.value,
										}))
									}
									placeholder={
										currentClientIntegrationId ||
										"eg. oac_2ttbjWcOQ0pyH1v9wYkROKB3"
									}
								/>
							</div>
							<div>
								<FormLabel className="mb-1">
									<span className="text-t2">Client (Integration) Secret</span>
								</FormLabel>
								<Input
									value={vercelConfig.client_secret || ""}
									onChange={(e) =>
										setVercelConfig((prev) => ({
											...prev,
											client_secret: e.target.value,
										}))
									}
									placeholder={
										currentClientSecret ||
										"eg. VAxvZFz8ST4d5b9pa2EuXkWG"
									}
								/>
							</div>
							<div>
								<FormLabel className="mb-1">
									<span className="text-t2">Webhook URL</span>
								</FormLabel>
								<Input
									value={vercelConfig.webhook_url || ""}
									onChange={(e) =>
										setVercelConfig((prev) => ({
											...prev,
											webhook_url: e.target.value,
										}))
									}
									placeholder={
										currentWebhookUrl || "eg. https://example.com/api/webhooks"
									}
								/>
							</div>
							<div>
								<FormLabel className="mb-1">
									<span className="text-t2">
										Stripe Custom Payment Method ID
									</span>
								</FormLabel>
								<p className="text-t3 text-sm mb-2">
									Create a custom payment method in{" "}
									<a
										href="https://dashboard.stripe.com/settings/custom_payment_methods"
										target="_blank"
										rel="noopener noreferrer"
										className="text-primary"
									>
										Stripe
									</a>
									.
								</p>
								<Input
									value={vercelConfig.custom_payment_method || ""}
									onChange={(e) =>
										setVercelConfig((prev) => ({
											...prev,
											custom_payment_method: e.target.value,
										}))
									}
									placeholder={
										currentCustomPaymentMethod ||
										"eg. cpmt_Yij7OBT6Fxu0UOa12XguA0vGB"
									}
								/>
							</div>
							<div className="col-span-2">
								<FormLabel className="mb-1">
									<span className="text-t2">Allowed Product IDs (Optional)</span>
								</FormLabel>
								<p className="text-t3 text-sm mb-2">
									Optional: choose product IDs to show in Vercel plans.
								</p>
								<TagSelect
									value={activeAllowedProductIds}
									onChange={setActiveAllowedProductIds}
									options={productOptions}
									placeholder="Select product IDs to include"
									showAllProducts={activeAllowedProductIds.length === 0}
									renderContent={(setOpen) => (
										<>
											{productOptions.length === 0 ? (
												<div className="p-2 text-t6">No products found</div>
											) : (
												productOptions.map((option) => {
													const isSelected =
														activeAllowedProductIds.includes(option.value);
													return (
														<div
															key={option.value}
															role="button"
															tabIndex={0}
															className="relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 px-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
															onClick={() => {
																const nextValue = isSelected
																	? activeAllowedProductIds.filter(
																			(id) => id !== option.value,
																		)
																	: [...activeAllowedProductIds, option.value];
																setActiveAllowedProductIds(nextValue);
																setOpen(false);
															}}
															onKeyDown={(e) => {
																if (e.key === "Enter" || e.key === " ") {
																	e.preventDefault();
																	const nextValue = isSelected
																		? activeAllowedProductIds.filter(
																				(id) => id !== option.value,
																			)
																		: [...activeAllowedProductIds, option.value];
																	setActiveAllowedProductIds(nextValue);
																	setOpen(false);
																}
															}}
														>
															<div className="flex items-center justify-between w-full">
																<span className="truncate">{option.label}</span>
															</div>
														</div>
													);
												})
											)}
										</>
									)}
								/>
							</div>
						</div>

						<div className="flex gap-2 mt-2">
							<Button
								className="w-36"
								disabled={false}
								onClick={() =>
									handleSaveVercelConfig(axiosInstance, vercelConfig)
								}
								isLoading={false}
							>
								Save
							</Button>
						</div>
					</CardContent>
				</Card>

				<div>
					<FormLabel className="mb-1">
						<span className="text-t2">Base URL</span>
					</FormLabel>
					<p className="text-t3 text-sm mb-2">
						This is the base URL for connecting to your Vercel project. You
						should provide this to Vercel as the Webhook URL and Base URL.
					</p>
					<CodeGroup value={env}>
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
							className="border-t"
						>
							<CodeGroupCodeSolidColour className="text-primary">{`https://api.useautumn.com/webhooks/vercel/${org?.id}/${env}`}</CodeGroupCodeSolidColour>
						</CodeGroupContent>
					</CodeGroup>
				</div>

				<Card className="shadow-none bg-interactive-secondary">
					<CardHeader>
						<CardTitle>Vercel Webhook</CardTitle>
						<CardDescription>
							Configure your Vercel webhook settings and view event logs.
						</CardDescription>
					</CardHeader>
					<CardContent>
						{svixDashboardUrl && !isVercelLoading && !vercelError ? (
							<AppPortal
								url={svixDashboardUrl}
								darkMode={isDark}
								style={{
									height: "400px",
									borderRadius: "8px",
									overflow: "clip",
								}}
							/>
						) : (
							<div className="text-t3">Dashboard URL not found.</div>
						)}
					</CardContent>
				</Card>
			</div>
		</div>
	) : (
		<LoadingScreen />
	);
};
