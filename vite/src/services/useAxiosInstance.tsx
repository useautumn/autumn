// import { endpoint } from "@/utils/constants/constants";
import { type ApiVersion, AppEnv } from "@autumn/shared";
import axios from "axios";
import { authClient } from "@/lib/auth-client";
import { useEnv } from "@/utils/envUtils";

const defaultParams = {
	isAuth: true,
};

export function useAxiosInstance(params?: {
	version?: ApiVersion;
	env?: AppEnv;
	isAuth?: boolean;
}) {
	const currentEnv = useEnv();
	const envToUse = params?.env ?? currentEnv;

	const axiosInstance = axios.create({
		baseURL: import.meta.env.VITE_BACKEND_URL,
		withCredentials: true,
	});

	axiosInstance.interceptors.request.use(
		async (config: any) => {
			config.headers.app_env = envToUse;
			// Only set x-api-version if not already set by the request
			if (!config.headers["x-api-version"]) {
				config.headers["x-api-version"] = params?.version ?? "1.2";
			}
			// config.headers["Autumn-Version"] = "0.2.0";
			config.headers["x-client-type"] = "dashboard";

			return config;
		},
		(error: any) => {
			return Promise.reject(error);
		},
	);

	// response interceptor to handle organization removal errors
	axiosInstance.interceptors.response.use(
		(response) => response,
		async (error) => {
			if (
				error.response?.status === 403 &&
				error.response?.data?.code === "USER_REMOVED_FROM_ORG"
			) {
				try {
					// Get user's organizations
					const { data: organizations } = await authClient.organization.list();

					if (organizations && organizations.length > 0) {
						// User has other organizations, switch to the first available one
						const nextOrg = organizations.find(
							(org) => org.id !== error.response.data.orgId,
						);
						if (nextOrg) {
							await authClient.organization.setActive({
								organizationId: nextOrg.id,
							});
							// Redirect to products page of the new organization
							window.location.href = `/${currentEnv === AppEnv.Sandbox ? "sandbox" : "production"}/products`;
							return Promise.reject(
								new Error("Redirecting to available organization"),
							);
						}
					} else {
						// User has no organizations left, redirect to safe fallback
						window.location.href = "/sign-in";
						return Promise.reject(
							new Error("No organizations available, redirecting to sign-in"),
						);
					}
				} catch (redirectError) {
					console.error(
						"Failed to handle organization removal redirect:",
						redirectError,
					);
					// Fallback to sign-in if redirect fails
					window.location.href = "/sign-in";
				}
			}

			return Promise.reject(error);
		},
	);

	return axiosInstance;
}
