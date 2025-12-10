import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CopyableSpan } from "@/components/general/CopyablePre";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/v2/buttons/Button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/v2/cards/Card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/v2/dialogs/Dialog";
import { FormLabel } from "@/components/v2/form/FormLabel";
import LoadingScreen from "@/views/general/LoadingScreen";

export const ConfigureRevenueCat = () => {
	// Mocking state for "ready" (not loading) scenario
	const [isLoadingRevenueCatAccount, setIsLoadingRevenueCatAccount] =
		useState(false);
	const [showConnectDialog, setShowConnectDialog] = useState(false);
	const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
	const [connecting, setConnecting] = useState(false);
	const [urlError, setUrlError] = useState<string>("");
	const [searchParams, setSearchParams] = useSearchParams();

	const [newConfig, setNewConfig] = useState({
		success_url: "https://useautumn.com",
	});
	const status = {
		description: "Your RevenueCat account is connected.",
		showConnectButtons: true,
		showDisconnect: false,
	};
	const dashboardUrl = "https://app.revenuecat.com/";
	const canPasteSecretKey = true;

	// Handlers (mock)
	const handleRedirectToOAuth = () => {};
	const handleConnectRevenueCat = () => {};
	const allowSave = () => true;

	const handleUrlChange = (url: string) => {
		setNewConfig((prev) => ({ ...prev, success_url: url }));
		if (url && !/^https?:\/\//.test(url)) setUrlError("Invalid URL");
		else setUrlError("");
	};

	return !isLoadingRevenueCatAccount ? (
		<div className="flex flex-col gap-4">
			<div className="px-10 max-w-[600px] flex flex-col gap-4">
				<Card className="shadow-none bg-interactive-secondary">
					<CardHeader>
						<CardTitle>Connect your RevenueCat account</CardTitle>
						{isLoadingRevenueCatAccount ? (
							<div className="space-y-2">
								<Skeleton className="h-4 w-full" />
								<Skeleton className="h-4 w-3/4" />
							</div>
						) : (
							status.description && (
								<CardDescription>
									{status.description}
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
						<div className="flex gap-2">
							{status.showConnectButtons && (
								<>
									<Button variant="secondary" onClick={handleRedirectToOAuth}>
										Connect via OAuth
									</Button>
									{canPasteSecretKey && (
										<Button
											variant="secondary"
											onClick={() => setShowConnectDialog(true)}
										>
											Paste secret key
										</Button>
									)}
								</>
							)}
							{status.showDisconnect && (
								<Button
									variant="destructive"
									onClick={() => window.alert("Disconnected (mock)")}
								>
									Disconnect
								</Button>
							)}
						</div>
					</CardContent>
				</Card>

				<div>
					<FormLabel className="mb-1">
						<span className="text-t2">Webhook Secret</span>
					</FormLabel>
					<p className="text-t3 text-sm mb-2">
						This will be the webhook secret for RevenueCat events. You must set
						this value in the RevenueCat console.
					</p>
					{(() => {
						// Generate a random 48 byte Uint8Array and convert to base64 (48 bytes -> 64 base64 chars)
						const array = new Uint8Array(48);
						crypto.getRandomValues(array);
						const randomBase64 = btoa(String.fromCharCode(...array));

						// import CopyableSpan at the top!
						// import { CopyableSpan } from "@/components/general/CopyablePre";

						return (
							<CopyableSpan
								text={randomBase64}
								className="my-1 leading-6 px-2"
								copySize={18}
							/>
						);
					})()}
				</div>

				<div className="flex gap-2 mt-2">
					<Button
						className="w-6/12"
						disabled={!allowSave()}
						onClick={handleConnectRevenueCat}
						isLoading={connecting}
					>
						Save
					</Button>
				</div>
			</div>

			<Dialog
				open={showDuplicateDialog}
				onOpenChange={(open) => {
					setShowDuplicateDialog(open);
					if (!open) {
						searchParams.delete("error");
						searchParams.delete("account_id");
						searchParams.delete("account_name");
						searchParams.delete("connected_org_name");
						searchParams.delete("connected_org_slug");
						setSearchParams(searchParams);
					}
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Account Already Connected</DialogTitle>
						<DialogDescription>
							The Stripe account{" "}
							<strong>{searchParams.get("account_id")}</strong>
							{searchParams.get("account_name") && (
								<> ({searchParams.get("account_name")})</>
							)}{" "}
							is already connected to the Autumn organization{" "}
							<strong>{searchParams.get("connected_org_name")}</strong>
							{searchParams.get("connected_org_slug") && (
								<> ({searchParams.get("connected_org_slug")})</>
							)}
							. Please disconnect it from there first before connecting to this
							organization.
						</DialogDescription>
					</DialogHeader>
					<Button
						onClick={() => {
							setShowDuplicateDialog(false);
							searchParams.delete("error");
							searchParams.delete("account_id");
							searchParams.delete("account_name");
							searchParams.delete("connected_org_name");
							searchParams.delete("connected_org_slug");
							setSearchParams(searchParams);
						}}
					>
						OK
					</Button>
				</DialogContent>
			</Dialog>
		</div>
	) : (
		<LoadingScreen />
	);
};
