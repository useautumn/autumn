"use client";

import { WebhooksLogoIcon } from "@phosphor-icons/react";
import "svix-react/style.css";
import { PageContainer, PageHeader } from "@autumn/ui";
import { Navigate, useLocation } from "react-router";
import { AppPortal } from "svix-react";
import { useTheme } from "@/contexts/ThemeProvider";
import { useAppQueryStates } from "@/hooks/common/useAppQueryStates";
import { useAutumnFlags } from "@/hooks/common/useAutumnFlags";
import { useDevQuery } from "@/hooks/queries/useDevQuery";
import LoadingScreen from "../general/LoadingScreen";
import { ApiKeysPage } from "./api-keys/ApiKeysPage";
import { PublishableKeySection } from "./publishable-key";

const INTEGRATION_TABS = ["stripe", "vercel", "revenuecat"];

export default function DevScreen() {
	const location = useLocation();
	const { svixDashboardUrl, isLoading } = useDevQuery();
	const { queryStates } = useAppQueryStates({ defaultTab: "api_keys" });

	const tab = queryStates.tab;
	const { pkey, webhooks } = useAutumnFlags();

	// Integrations moved to settings; old links and OAuth callbacks still land here.
	const requestedTab = new URLSearchParams(location.search).get("tab");
	if (requestedTab && INTEGRATION_TABS.includes(requestedTab)) {
		const settingsPath = location.pathname.replace(/\/dev\/?$/, "/settings");
		return <Navigate to={`${settingsPath}${location.search}`} replace />;
	}

	if (isLoading) return <LoadingScreen />;

	return (
		<PageContainer className="text-sm">
			{(tab === "api_keys" || !tab) && (
				<div className="flex flex-col gap-16">
					<ApiKeysPage />
					{pkey && <PublishableKeySection />}
				</div>
			)}
			{tab === "webhooks" && webhooks && svixDashboardUrl && (
				<div className="flex flex-col h-full">
					<PageHeader
						icon={
							<WebhooksLogoIcon
								size={16}
								weight="fill"
								className="text-subtle"
							/>
						}
						title="Webhooks"
					/>
					<ConfigureWebhookSection dashboardUrl={svixDashboardUrl} />
				</div>
			)}
		</PageContainer>
	);
}

const withNoGutters = (dashboardUrl: string) => {
	const url = new URL(dashboardUrl);
	url.searchParams.set("noGutters", "true");
	return url.toString();
};

const ConfigureWebhookSection = ({
	dashboardUrl,
}: {
	dashboardUrl: string;
}) => {
	const { isDark } = useTheme();

	return (
		<div className="h-full">
			{dashboardUrl ? (
				<AppPortal
					url={withNoGutters(dashboardUrl)}
					darkMode={isDark}
					style={{ height: "100%", borderRadius: "none" }}
					fullSize
				/>
			) : (
				<div className="text-muted-foreground">Dashboard URL not found.</div>
			)}
		</div>
	);
};
