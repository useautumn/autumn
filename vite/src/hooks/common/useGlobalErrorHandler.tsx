import { useNavigate } from "react-router";
import { authClient } from "@/lib/auth-client";
import { useEnv } from "@/utils/envUtils";
import { AppEnv } from "@autumn/shared";

export const useGlobalErrorHandler = () => {
	const navigate = useNavigate();
	const env = useEnv();

	const handleOrganizationRemoval = async (orgId: string) => {
		try {
			// Get user's organizations
			const { data: organizations } = await authClient.organization.list();

			if (organizations && organizations.length > 0) {
				// User has other organizations, switch to the first available one
				const nextOrg = organizations.find((org) => org.id !== orgId);
				if (nextOrg) {
					await authClient.organization.setActive({
						organizationId: nextOrg.id,
					});
					// Redirect to products page of the new organization
					const envPath = env === AppEnv.Sandbox ? "sandbox" : "production";
					navigate(`/${envPath}/products`);
					return true;
				}
			}

			// User has no organizations left, redirect to sign-in
			navigate("/sign-in");
			return false;
		} catch (error) {
			console.error("Failed to handle organization removal:", error);
			navigate("/sign-in");
			return false;
		}
	};

	const handleApiError = (error: any) => {
		if (
			error.response?.status === 403 &&
			error.response?.data?.code === "USER_REMOVED_FROM_ORG"
		) {
			const { orgId } = error.response.data;
			handleOrganizationRemoval(orgId);
			return true;
		}
		return false;
	};

	return {
		handleOrganizationRemoval,
		handleApiError,
	};
};
