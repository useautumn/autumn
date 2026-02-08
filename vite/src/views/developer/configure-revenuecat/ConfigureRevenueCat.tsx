import { useCallback, useState } from "react";
import { toast } from "sonner";
import { useOrg } from "@/hooks/common/useOrg";
import { useRevenueCatQuery } from "@/hooks/queries/revcat/useRevenueCatQuery";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useEnv } from "@/utils/envUtils";
import LoadingScreen from "@/views/general/LoadingScreen";
import { ApiKeyDialog } from "./components/ApiKeyDialog";
import { ProjectIdDialog } from "./components/ProjectIdDialog";
import { RevenueCatConnectionCard } from "./components/RevenueCatConnectionCard";
import { RevenueCatMappingSheet } from "./components/RevenueCatMappingSheet";
import { RevenueCatWebhookSecret } from "./components/RevenueCatWebhookSecret";
import { RevenueCatWebhookUrl } from "./components/RevenueCatWebhookUrl";

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
				env === "live"
					? { api_key: apiKeyInput }
					: { sandbox_api_key: apiKeyInput };

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

	const statusDescription = revenueCatConfig?.connected
		? "Your RevenueCat account is connected."
		: "Connect your RevenueCat account to start tracking subscriptions.";

	const handleApiKeyClick = useCallback(() => setShowApiKeyDialog(true), []);
	const handleProjectIdClick = useCallback(
		() => setShowProjectIdDialog(true),
		[],
	);
	const handleMapProductsClick = useCallback(() => {
		if (!currentApiKey) {
			toast.error("You need to link your RevenueCat API Key first");
			return;
		}
		setShowMappingSheet(true);
	}, [currentApiKey]);

	if (isLoadingRevenueCatAccount) {
		return <LoadingScreen />;
	}

	return (
		<div className="flex flex-col gap-4">
			<div className="max-w-[600px] flex flex-col gap-4">
				<RevenueCatConnectionCard
					isLoading={isLoadingRevenueCatAccount}
					statusDescription={statusDescription}
					dashboardUrl={dashboardUrl}
					currentApiKey={currentApiKey}
					currentProjectId={currentProjectId}
					env={env}
					onApiKeyClick={handleApiKeyClick}
					onProjectIdClick={handleProjectIdClick}
					onMapProductsClick={handleMapProductsClick}
				/>

				<RevenueCatWebhookSecret
					env={env}
					webhookSecret={currentWebhookSecret}
				/>

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
	);
};
