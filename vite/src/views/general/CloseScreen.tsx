import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { Button } from "@/components/v2/buttons/Button";
import LoadingScreen from "./LoadingScreen";

export const CloseScreen = () => {
	const [searchParams] = useSearchParams();
	const [showContent, setShowContent] = useState(false);

	const error = searchParams.get("error");
	const accountId = searchParams.get("account_id");
	const accountName = searchParams.get("account_name");
	const connectedOrgName = searchParams.get("connected_org_name");
	const connectedOrgSlug = searchParams.get("connected_org_slug");

	useEffect(() => {
		// If there's an error, don't try to close the window
		if (error) {
			setShowContent(true);
			return;
		}

		// Attempt to close immediately if no error
		window.close();

		// If still open after 1 second, it means close() was blocked
		const timeout = setTimeout(() => {
			setShowContent(true);
		}, 1000);

		return () => clearTimeout(timeout);
	}, [error]);

	if (!showContent) {
		return (
			<div className="w-screen h-screen flex items-center justify-center">
				<LoadingScreen />
			</div>
		);
	}

	if (error) {
		return (
			<div className="w-screen h-screen flex items-center justify-center p-8">
				<div className="max-w-md flex flex-col gap-4 text-center">
					<div className="text-red-600 text-5xl mb-2">⚠️</div>
					<h1 className="text-xl font-semibold text-t1">
						Connection Failed
					</h1>

					{error === "account_already_connected" && accountId ? (
						<p className="text-t2 text-sm">
							The Stripe account <strong>{accountId}</strong>
							{accountName && <> ({accountName})</>} is already connected to
							the Autumn organization{" "}
							<strong>{connectedOrgName || "another organization"}</strong>
							{connectedOrgSlug && <> ({connectedOrgSlug})</>}. Please
							disconnect it from there first before connecting to this
							organization.
						</p>
					) : (
						<p className="text-t2 text-sm">
							{error === "invalid_state" &&
								"Invalid authentication state. Please try connecting again."}
							{error === "org_not_found" &&
								"Organization not found. Please try connecting again."}
							{error === "account_id_not_found" &&
								"Could not retrieve Stripe account information."}
							{error === "missing_parameters" &&
								"Missing required parameters. Please try connecting again."}
							{!["invalid_state", "org_not_found", "account_id_not_found", "missing_parameters", "account_already_connected"].includes(
								error,
							) && `An error occurred: ${error}`}
						</p>
					)}

					<div className="flex justify-center">
						<Button
							onClick={() => window.close()}
							variant="secondary"
							className="mt-4"
						>
							Close Window
						</Button>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="w-screen h-screen flex items-center justify-center">
			<div className="flex flex-col items-center gap-4">
				<p className="text-lg text-green-600">✓ Connection successful!</p>
				<p className="text-t3">You can close this window now.</p>
			</div>
		</div>
	);
};
