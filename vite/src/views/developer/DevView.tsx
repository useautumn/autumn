"use client";

import "svix-react/style.css";
import { AppPortal } from "svix-react";
import { useTheme } from "@/contexts/ThemeProvider";
import { useAppQueryStates } from "@/hooks/common/useAppQueryStates";
import { useAutumnFlags } from "@/hooks/common/useAutumnFlags";
import { useDevQuery } from "@/hooks/queries/useDevQuery";
import LoadingScreen from "../general/LoadingScreen";
import { ApiKeysPage } from "./api-keys/ApiKeysPage";
import { ConfigureRevenueCat } from "./configure-revenuecat/ConfigureRevenueCat";
import { ConfigureStripe } from "./configure-stripe/ConfigureStripe";
import { ConfigureVercel } from "./configure-vercel/ConfigureVercel";
import { PublishableKeySection } from "./publishable-key";

export default function DevScreen() {
	const { apiKeys, svixDashboardUrl, isLoading, error } = useDevQuery();
	const { queryStates } = useAppQueryStates({ defaultTab: "api_keys" });

	const tab = queryStates.tab;
	const { pkey, webhooks, vercel, revenuecat } = useAutumnFlags();

	if (isLoading) return <LoadingScreen />;

	return (
		<div className="flex flex-col gap-4 h-fit relative max-w-5xl mx-auto text-sm pt-8">
			{/* <h1 className="text-xl font-medium shrink-0 pt-6 pl-10">Developer</h1> */}

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
		</div>
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
	);
};
