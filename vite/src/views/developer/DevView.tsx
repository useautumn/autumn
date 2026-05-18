"use client";

import "svix-react/style.css";
import { AppPortal } from "svix-react";
import { PageContainer } from "@/components/general/PageContainer";
import { useTheme } from "@/contexts/ThemeProvider";
import { useAppQueryStates } from "@/hooks/common/useAppQueryStates";
import { useAutumnFlags } from "@/hooks/common/useAutumnFlags";
import { useDevQuery } from "@/hooks/queries/useDevQuery";
import { useAdmin } from "../admin/hooks/useAdmin";
import LoadingScreen from "../general/LoadingScreen";
import { OnboardingGuide } from "../onboarding4/OnboardingGuide";
import { ApiKeysPage } from "./api-keys/ApiKeysPage";
import { ConfigureRedis } from "./configure-redis/ConfigureRedis";
import { ConfigureRevenueCat } from "./configure-revenuecat/ConfigureRevenueCat";
import { ConfigureStripe } from "./configure-stripe/ConfigureStripe";
import { ConfigureVercel } from "./configure-vercel/ConfigureVercel";
import { PublishableKeySection } from "./publishable-key";

export default function DevScreen() {
	const { apiKeys, svixDashboardUrl, isLoading, error } = useDevQuery();
	const { queryStates } = useAppQueryStates({ defaultTab: "api_keys" });
	const { isAdmin } = useAdmin();

	const tab = queryStates.tab;
	const { pkey, webhooks, vercel, revenuecat } = useAutumnFlags();

	if (isLoading) return <LoadingScreen />;

	return (
		<PageContainer className="text-sm">
			<OnboardingGuide />
			{(tab === "api_keys" || !tab) && (
				<div className="flex flex-col gap-16">
					<ApiKeysPage />
					{pkey && <PublishableKeySection />}
				</div>
			)}
			{tab === "stripe" && <ConfigureStripe />}
			{tab === "webhooks" && webhooks && svixDashboardUrl && (
				<ConfigureWebhookSection dashboardUrl={svixDashboardUrl} />
			)}
			{tab === "vercel" && vercel && <ConfigureVercel />}
			{tab === "revenuecat" && revenuecat && <ConfigureRevenueCat />}
			{tab === "redis" && isAdmin && <ConfigureRedis />}
		</PageContainer>
	);
}

const ConfigureWebhookSection = ({ dashboardUrl }: any) => {
	const { isDark } = useTheme();

	return (
		<div className="h-full">
			{dashboardUrl ? (
				<AppPortal
					url={dashboardUrl}
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
