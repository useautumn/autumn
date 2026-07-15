"use client";

import { TriangleIcon, WebhooksLogoIcon } from "@phosphor-icons/react";
import "svix-react/style.css";
import { PageContainer, PageHeader } from "@autumn/ui";
import { AppPortal } from "svix-react";
import { StripeIcon } from "@/components/v2/icons/AutumnIcons";
import { useTheme } from "@/contexts/ThemeProvider";
import { useAppQueryStates } from "@/hooks/common/useAppQueryStates";
import { useAutumnFlags } from "@/hooks/common/useAutumnFlags";
import { useDevQuery } from "@/hooks/queries/useDevQuery";
import LoadingScreen from "../general/LoadingScreen";
import { OnboardingGuide } from "../onboarding4/OnboardingGuide";
import { ApiKeysPage } from "./api-keys/ApiKeysPage";
import { ConfigureRevenueCat } from "./configure-revenuecat/ConfigureRevenueCat";
import { ConfigureStripe } from "./configure-stripe/ConfigureStripe";
import { ConfigureVercel } from "./configure-vercel/ConfigureVercel";
import { PublishableKeySection } from "./publishable-key";

export default function DevScreen() {
	const { apiKeys, svixDashboardUrl, isLoading, error } = useDevQuery();
	const { queryStates } = useAppQueryStates({ defaultTab: "api_keys" });

	const tab = queryStates.tab;
	const { pkey, webhooks, vercel } = useAutumnFlags();

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
			{tab === "stripe" && (
				<div className="flex flex-col">
					<PageHeader
						icon={<StripeIcon size={16} className="text-subtle" />}
						title="Stripe"
					/>
					<ConfigureStripe />
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
			{tab === "vercel" && vercel && (
				<div className="flex flex-col">
					<PageHeader
						icon={
							<TriangleIcon size={16} weight="fill" className="text-subtle" />
						}
						title="Vercel"
					/>
					<ConfigureVercel />
				</div>
			)}
			{tab === "revenuecat" && <ConfigureRevenueCat />}
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
