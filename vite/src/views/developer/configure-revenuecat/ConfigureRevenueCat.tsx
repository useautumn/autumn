import { useState } from "react";
import LoadingScreen from "@/views/general/LoadingScreen";
import { useOrg } from "@/hooks/common/useOrg";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useEnv } from "@/utils/envUtils";
import { useRevenueCatQuery } from "@/hooks/queries/revcat/useRevenueCatQuery";
import { RevenueCatConnectionCard } from "./components/RevenueCatConnectionCard";
import { RevenueCatWebhookSecret } from "./components/RevenueCatWebhookSecret";
import { RevenueCatWebhookUrl } from "./components/RevenueCatWebhookUrl";
import { ApiKeyDialog } from "./components/ApiKeyDialog";
import { ProjectIdDialog } from "./components/ProjectIdDialog";
import { RevenueCatMappingSheet } from "./components/RevenueCatMappingSheet";

export const ConfigureRevenueCat = () => {
	const [showApiKeyDialog, setShowApiKeyDialog] = useState(false);
	const [showProjectIdDialog, setShowProjectIdDialog] = useState(false);
	const [showMappingSheet, setShowMappingSheet] = useState(false);
	const [connecting, setConnecting] = useState(false);
	const [apiKeyInput, setApiKeyInput] = useState("");
	const [projectIdInput, setProjectIdInput] = useState("");

	const { org } = useOrg();
	const {
		revenueCatConfig,
		isLoading: isLoadingRevenueCatAccount,
		refetch,
	} = useRevenueCatQuery();
	const axiosInstance = useAxiosInstance();
	const env = useEnv();

	const dashboardUrl = "https://app.revenuecat.com/";

	const handleUpdateApiKey = async () => {
		if (!apiKeyInput.trim()) return;

		setConnecting(true);
		try {
			const payload =
				env === "live" ? { api_key: apiKeyInput } : { sandbox_api_key: apiKeyInput };

			await axiosInstance.patch("/v1/organization/revenuecat", payload);

			// Refetch config
			await refetch();

			setShowApiKeyDialog(false);
			setApiKeyInput("");
		} catch (error) {
			console.error("Failed to update API key:", error);
		} finally {
			setConnecting(false);
		}
	};

	const handleUpdateProjectId = async () => {
		if (!projectIdInput.trim()) return;

		setConnecting(true);
		try {
			const payload =
				env === "live"
					? { project_id: projectIdInput }
					: { sandbox_project_id: projectIdInput };

			await axiosInstance.patch("/v1/organization/revenuecat", payload);

			// Refetch config
			await refetch();

			setShowProjectIdDialog(false);
			setProjectIdInput("");
		} catch (error) {
			console.error("Failed to update project ID:", error);
		} finally {
			setConnecting(false);
		}
	};

	const currentWebhookSecret =
		env === "live"
			? revenueCatConfig?.webhook_secret
			: revenueCatConfig?.sandbox_webhook_secret;

	const currentApiKey =
		env === "live"
			? revenueCatConfig?.api_key
			: revenueCatConfig?.sandbox_api_key;

	const currentProjectId =
		env === "live"
			? revenueCatConfig?.project_id
			: revenueCatConfig?.sandbox_project_id;

	const status = {
		description: revenueCatConfig?.connected
			? "Your RevenueCat account is connected."
			: "Connect your RevenueCat account to start tracking subscriptions.",
	};

	return !isLoadingRevenueCatAccount ? (
		<div className="flex flex-col gap-4">
			<div className="px-10 max-w-[600px] flex flex-col gap-4">
				<RevenueCatConnectionCard
					isLoading={isLoadingRevenueCatAccount}
					statusDescription={status.description}
					dashboardUrl={dashboardUrl}
					currentApiKey={currentApiKey}
					currentProjectId={currentProjectId}
					env={env}
					onApiKeyClick={() => setShowApiKeyDialog(true)}
					onProjectIdClick={() => setShowProjectIdDialog(true)}
					onMapProductsClick={() => setShowMappingSheet(true)}
				/>

				<RevenueCatWebhookSecret env={env} webhookSecret={currentWebhookSecret} />

				<RevenueCatWebhookUrl env={env} orgId={org?.id} />
			</div>

			<ApiKeyDialog
				open={showApiKeyDialog}
				onOpenChange={setShowApiKeyDialog}
				env={env}
				currentApiKey={currentApiKey}
				apiKeyInput={apiKeyInput}
				onApiKeyInputChange={setApiKeyInput}
				onSave={handleUpdateApiKey}
				isLoading={connecting}
			/>

			<ProjectIdDialog
				open={showProjectIdDialog}
				onOpenChange={setShowProjectIdDialog}
				env={env}
				currentProjectId={currentProjectId}
				projectIdInput={projectIdInput}
				onProjectIdInputChange={setProjectIdInput}
				onSave={handleUpdateProjectId}
				isLoading={connecting}
			/>

			<RevenueCatMappingSheet
				open={showMappingSheet}
				onOpenChange={setShowMappingSheet}
			/>
		</div>
	) : (
		<LoadingScreen />
	);
};
