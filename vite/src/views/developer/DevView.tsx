import "svix-react/style.css";
import { useAppQueryStates } from "@/hooks/common/useAppQueryStates";
import { useAutumnFlags } from "@/hooks/common/useAutumnFlags";
import { useDevQuery } from "@/hooks/queries/useDevQuery";
import LoadingScreen from "../general/LoadingScreen";
import { ApiKeysPage } from "./api-keys/ApiKeysPage";
import { ConfigureStripe } from "./configure-stripe/ConfigureStripe";
import { ConfigureVercel } from "./configure-vercel/ConfigureVercel";
import { PublishableKeySection } from "./publishable-key";
import { ConfigureWebhookSection } from "./configure-svix/configure-svix-section";
import { SvixProvider } from "svix-react";

export default function DevScreen() {
	const { apiKeys, svixDashboardUrl, svixPublicToken, svixAppId, isLoading, error } = useDevQuery();
	const { queryStates } = useAppQueryStates({ defaultTab: "api_keys" });

	const tab = queryStates.tab;
	const { pkey, webhooks, vercel } = useAutumnFlags();

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
				<SvixProvider token={svixPublicToken} appId={svixAppId}>
					<ConfigureWebhookSection dashboardUrl={svixDashboardUrl} publicToken={svixPublicToken} />
				</SvixProvider>
			)}

			{tab === "vercel" && vercel && <ConfigureVercel />}
		</div>
	);
}
