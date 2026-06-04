import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import { useOrg } from "@/hooks/common/useOrg";
import { useRCMappings } from "@/hooks/queries/revcat/useRCMappings";
import { useRCProjects } from "@/hooks/queries/revcat/useRCProjects";
import { useRevenueCatQuery } from "@/hooks/queries/revcat/useRevenueCatQuery";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useEnv } from "@/utils/envUtils";
import { getBackendErr } from "@/utils/genUtils";
import { useAdmin } from "@/views/admin/hooks/useAdmin";
import LoadingScreen from "@/views/general/LoadingScreen";
import { ApiKeyDialog } from "./components/ApiKeyDialog";
import { RevenueCatConnectionCard } from "./components/RevenueCatConnectionCard";
import { RevenueCatDisconnectDialog } from "./components/RevenueCatDisconnectDialog";
import { RevenueCatMappingSheet } from "./components/RevenueCatMappingSheet";
import { RevenueCatProjectSheet } from "./components/RevenueCatProjectSheet";
import { RevenueCatSyncSheet } from "./components/RevenueCatSyncSheet";
import { RevenueCatWebhookCard } from "./components/RevenueCatWebhookCard";

export const ConfigureRevenueCat = () => {
	const [showApiKeyDialog, setShowApiKeyDialog] = useState(false);
	const [showDisconnectDialog, setShowDisconnectDialog] = useState(false);
	const [disconnecting, setDisconnecting] = useState(false);
	const [showProjectSheet, setShowProjectSheet] = useState(false);
	const [showMappingSheet, setShowMappingSheet] = useState(false);
	const [showSyncSheet, setShowSyncSheet] = useState(false);
	const [connecting, setConnecting] = useState(false);
	const [apiKeyInput, setApiKeyInput] = useState("");
	const [projectIdInput, setProjectIdInput] = useState("");

	const { org } = useOrg();
	const { isAdmin } = useAdmin();
	const { mappings } = useRCMappings();
	const {
		revenueCatConfig,
		isLoading: isLoadingRevenueCatAccount,
		refetch,
	} = useRevenueCatQuery();
	const hasMappings = mappings.some(
		(m) => m.revenuecat_product_ids.length > 0,
	);
	const axiosInstance = useAxiosInstance();
	const env = useEnv();
	const [searchParams, setSearchParams] = useSearchParams();

	const dashboardUrl = "https://app.revenuecat.com/";

	useEffect(() => {
		const success = searchParams.get("success");
		const error = searchParams.get("error");

		if (success === "true") {
			toast.success("Successfully connected to RevenueCat");
			void refetch();
			searchParams.delete("success");
			setSearchParams(searchParams);
		}

		if (error) {
			if (error === "insufficient_scope") {
				toast.error(
					"RevenueCat connection needs Read & Write access. Please re-authorize and grant all requested permissions.",
				);
			} else if (error === "project_not_in_account") {
				toast.error(
					"That RevenueCat account doesn't contain your current project. Sign in with the account that owns it.",
				);
			} else if (error === "products_mismatch") {
				toast.error(
					"Your mapped RevenueCat products weren't all found in that project. Connect the account/project you currently use.",
				);
			} else if (error === "no_project_to_migrate") {
				toast.error("No existing project ID to migrate. Set one first.");
			} else {
				toast.error(
					`Failed to connect RevenueCat: ${error.replace(/_/g, " ")}`,
				);
			}
			searchParams.delete("error");
			searchParams.delete("missing_scopes");
			setSearchParams(searchParams);
		}
	}, [searchParams, setSearchParams, refetch]);

	const handleRedirectToOAuth = async () => {
		try {
			const { data } = await axiosInstance.get(
				"/v1/organization/revenuecat/oauth_url",
			);
			window.open(data.oauth_url, "_blank");
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to redirect to OAuth"));
		}
	};

	const handleMigrateToOAuth = async () => {
		try {
			const { data } = await axiosInstance.get(
				"/v1/organization/revenuecat/oauth_url",
				{ params: { migrate: "true" } },
			);
			window.open(data.oauth_url, "_blank");
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to start migration"));
		}
	};

	const handleUpdateApiKey = async () => {
		if (!apiKeyInput.trim()) return;

		setConnecting(true);
		try {
			const payload =
				env === "live"
					? { api_key: apiKeyInput }
					: { sandbox_api_key: apiKeyInput };

			await axiosInstance.patch("/v1/organization/revenuecat", payload);

			await refetch();

			setShowApiKeyDialog(false);
			setApiKeyInput("");
		} catch (error) {
			console.error("Failed to update API key:", error);
		} finally {
			setConnecting(false);
		}
	};

	const handleDisconnect = async () => {
		setDisconnecting(true);
		try {
			await axiosInstance.post("/v1/organization/revenuecat/disconnect");
			await refetch();
			setShowDisconnectDialog(false);
			toast.success("RevenueCat disconnected");
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to disconnect RevenueCat"));
		} finally {
			setDisconnecting(false);
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

			await refetch();

			setShowProjectSheet(false);
			setProjectIdInput("");
		} catch (error) {
			console.error("Failed to update project ID:", error);
		} finally {
			setConnecting(false);
		}
	};

	const currentApiKey =
		env === "live"
			? revenueCatConfig?.api_key
			: revenueCatConfig?.sandbox_api_key;

	const currentProjectId =
		env === "live"
			? revenueCatConfig?.project_id
			: revenueCatConfig?.sandbox_project_id;

	const { projects: rcProjects } = useRCProjects({
		enabled: !!currentProjectId,
	});
	const currentProjectName = currentProjectId
		? rcProjects.find((project) => project.id === currentProjectId)?.name
		: undefined;

	const oauthConnected = revenueCatConfig?.oauth_connected ?? false;
	const connection = revenueCatConfig?.connection ?? "none";

	const statusDescription = revenueCatConfig?.connected
		? oauthConnected
			? "Your RevenueCat account is connected via OAuth."
			: "Your RevenueCat account is connected."
		: oauthConnected
			? "RevenueCat OAuth is connected. Add a project ID to finish setup."
			: "Connect your RevenueCat account to start tracking subscriptions.";

	const hasCredentials = oauthConnected || !!currentApiKey;

	const handleApiKeyClick = useCallback(() => setShowApiKeyDialog(true), []);
	const handleProjectIdClick = useCallback(() => {
		setProjectIdInput(currentProjectId ?? "");
		setShowProjectSheet(true);
	}, [currentProjectId]);
	const handleMapProductsClick = useCallback(() => {
		if (!hasCredentials) {
			toast.error("Connect RevenueCat via OAuth or add an API key first");
			return;
		}
		if (!currentProjectId) {
			toast.error("You need to add your RevenueCat project ID first");
			return;
		}
		setShowMappingSheet(true);
	}, [hasCredentials, currentProjectId]);

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
					connection={connection}
					oauthConnected={oauthConnected}
					env={env}
					isAdmin={isAdmin}
					onOAuthClick={handleRedirectToOAuth}
					onMigrateClick={handleMigrateToOAuth}
					onApiKeyClick={handleApiKeyClick}
					onDisconnectClick={() => setShowDisconnectDialog(true)}
					onProjectIdClick={handleProjectIdClick}
					onMapProductsClick={handleMapProductsClick}
					onSyncClick={() => setShowSyncSheet(true)}
					currentProjectId={currentProjectId}
					currentProjectName={currentProjectName}
					hasMappings={hasMappings}
				/>

				<RevenueCatWebhookCard />
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

			<RevenueCatDisconnectDialog
				open={showDisconnectDialog}
				onOpenChange={setShowDisconnectDialog}
				env={env}
				onConfirm={handleDisconnect}
				isLoading={disconnecting}
			/>

			<RevenueCatProjectSheet
				open={showProjectSheet}
				onOpenChange={setShowProjectSheet}
				env={env}
				oauthConnected={oauthConnected}
				value={projectIdInput}
				onValueChange={setProjectIdInput}
				onSave={handleUpdateProjectId}
				isLoading={connecting}
			/>

			<RevenueCatMappingSheet
				open={showMappingSheet}
				onOpenChange={setShowMappingSheet}
			/>

			<RevenueCatSyncSheet
				open={showSyncSheet}
				onOpenChange={setShowSyncSheet}
			/>
		</div>
	);
};
