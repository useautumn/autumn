import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/v2/buttons/Button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/v2/cards/Card";
import { FormLabel } from "@/components/v2/form/FormLabel";

interface RevenueCatConnectionCardProps {
	isLoading: boolean;
	statusDescription: string;
	dashboardUrl: string;
	currentApiKey?: string;
	connection?: "oauth" | "api_key" | "none";
	oauthConnected?: boolean;
	env: string;
	isAdmin?: boolean;
	onOAuthClick: () => void;
	onMigrateClick: () => void;
	onApiKeyClick: () => void;
	onDisconnectClick: () => void;
	onProjectIdClick: () => void;
	onMapProductsClick: () => void;
	onSyncClick: () => void;
	currentProjectId?: string;
	currentProjectName?: string;
	hasMappings?: boolean;
}

export const RevenueCatConnectionCard = ({
	isLoading,
	statusDescription,
	dashboardUrl,
	currentApiKey,
	connection,
	oauthConnected,
	env,
	isAdmin,
	onOAuthClick,
	onMigrateClick,
	onApiKeyClick,
	onDisconnectClick,
	onProjectIdClick,
	onMapProductsClick,
	onSyncClick,
	currentProjectId,
	currentProjectName,
	hasMappings,
}: RevenueCatConnectionCardProps) => {
	// Don't offer OAuth to legacy API-key orgs — they can't run both flows.
	const showOAuthConnect = connection !== "oauth" && !currentApiKey;
	// API-key auth is legacy: surface it for orgs that already have a key.
	const hasLegacyApiKey = connection !== "oauth" && !!currentApiKey;
	// Admins can always connect via secret key (escape hatch) — but never for OAuth orgs,
	// which disconnect instead.
	const showApiKeyActions = (isAdmin || hasLegacyApiKey) && !oauthConnected;

	return (
		<Card className="shadow-none bg-interactive-secondary">
			<CardHeader>
				<CardTitle>Connect your RevenueCat account</CardTitle>
				{isLoading ? (
					<div className="space-y-2">
						<Skeleton className="h-4 w-full" />
						<Skeleton className="h-4 w-3/4" />
					</div>
				) : (
					statusDescription && (
						<CardDescription>
							{statusDescription}
							{dashboardUrl && (
								<span className="text-muted-foreground">
									{" "}
									Visit the RevenueCat dashboard{" "}
									<a
										href={dashboardUrl}
										target="_blank"
										rel="noopener noreferrer"
										className="underline text-primary"
									>
										here
									</a>
								</span>
							)}
						</CardDescription>
					)
				)}
			</CardHeader>
			<CardContent className="flex flex-col gap-2">
				{oauthConnected && (
					<div className="mb-0">
						<FormLabel className="mb-0 text-body">
							Connected via OAuth ({env})
						</FormLabel>
					</div>
				)}
				{/* Once on OAuth the legacy api key is dead — don't surface it. */}
				{!oauthConnected && currentApiKey && (
					<div className="mb-0">
						<FormLabel className="mb-0 text-body">
							Current API key:{" "}
							<code className="bg-interactive-secondary px-2 py-1 rounded">
								{currentApiKey}
							</code>
						</FormLabel>
					</div>
				)}
				{currentProjectId && (
					<div className="mb-2">
						<FormLabel className="mb-0 text-body">
							Current project:{" "}
							{currentProjectName && <span>{currentProjectName} </span>}
							<code className="bg-interactive-secondary px-2 py-1 rounded">
								{currentProjectId}
							</code>
						</FormLabel>
					</div>
				)}
				<div className="flex gap-2 flex-wrap">
					{showOAuthConnect && (
						<Button variant="primary" onClick={onOAuthClick}>
							Connect via OAuth
						</Button>
					)}
					{showApiKeyActions && (
						<Button variant="secondary" onClick={onApiKeyClick}>
							{currentApiKey ? "Update API Key" : "Connect via API Key"}
						</Button>
					)}
					{oauthConnected && (
						<Button variant="destructive" onClick={onDisconnectClick}>
							Disconnect
						</Button>
					)}
					{/* Legacy api-key orgs can migrate to OAuth by signing in. */}
					{hasLegacyApiKey && (
						<Button variant="primary" onClick={onMigrateClick}>
							Migrate to OAuth
						</Button>
					)}
					<Button variant="secondary" onClick={onProjectIdClick}>
						{currentProjectId ? "Update Project ID" : "Select Project ID"}
					</Button>
					{/* Push-flow (OAuth) orgs sync products from Autumn — no manual mapping. */}
					{oauthConnected ? (
						<Button variant="secondary" onClick={onSyncClick}>
							Sync Products
						</Button>
					) : (
						<Button
							variant={showOAuthConnect ? "secondary" : "primary"}
							onClick={onMapProductsClick}
						>
							{hasMappings ? "Update Mappings" : "Map Products"}
						</Button>
					)}
				</div>
			</CardContent>
		</Card>
	);
};
