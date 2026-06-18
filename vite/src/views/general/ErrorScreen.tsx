import React from "react";
import { Link, useNavigate } from "react-router";
import { authClient } from "@/lib/auth-client";
import { getRedirectUrl } from "@/utils/genUtils";
import { useSwitchActiveOrg } from "@/hooks/common/useOrg";

function ErrorScreen({
	children,
	returnUrl,
	errorCode,
	errorData,
}: {
	children: React.ReactNode;
	returnUrl?: string;
	errorCode?: string;
	errorData?: any;
}) {
	const navigate = useNavigate();
	const switchActiveOrg = useSwitchActiveOrg();

	const handleOrgRemovalError = async () => {
		if (errorCode === "USER_REMOVED_FROM_ORG" && errorData) {
			try {
				// Get user's organizations
				const { data: organizations } = await authClient.organization.list();

				if (organizations && organizations.length > 0) {
					// User has other organizations, switch to the first available one
					const nextOrg = organizations.find(
						(org) => org.id !== errorData.orgId,
					);
					if (nextOrg) {
						await switchActiveOrg(nextOrg.id);
						navigate("/");
						return;
					}
				}

				// User has no organizations left, redirect to sign-in
				navigate("/sign-in");
			} catch (error) {
				console.error("Failed to handle organization removal:", error);
				navigate("/sign-in");
			}
		}
	};

	React.useEffect(() => {
		if (errorCode === "USER_REMOVED_FROM_ORG") {
			handleOrgRemovalError();
		}
	}, [errorCode, errorData]);

	// Show specific message for organization removal
	if (errorCode === "USER_REMOVED_FROM_ORG") {
		return (
			<div className="flex h-full w-full items-center justify-center flex-col gap-4">
				<div className="text-muted-foreground text-lg max-w-md text-center">
					<h2 className="text-xl font-semibold mb-2">Access Denied</h2>
					<p className="text-tertiary-foreground mb-4">
						You no longer have access to this organization. Redirecting you to
						an available organization...
					</p>
					<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-tertiary-foreground mx-auto"></div>
				</div>
			</div>
		);
	}

	return (
		<div className="flex h-full w-full items-center justify-center flex-col gap-2">
			<div className="text-muted-foreground text-sm max-w-sm text-center">{children}</div>
			{returnUrl && (
				<Link
					className="text-tertiary-foreground text-sm hover:underline"
					to={getRedirectUrl(returnUrl, env)}
				>
					Return
				</Link>
			)}
		</div>
	);
}

export default ErrorScreen;
