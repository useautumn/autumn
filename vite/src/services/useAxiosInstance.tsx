// import { endpoint } from "@/utils/constants/constants";
import { AppEnv, type ApiVersion } from "@autumn/shared";
import axios from "axios";
import { useMemo } from "react";
import { useActiveSandbox } from "@/hooks/sandbox/useActiveSandbox";
import { authClient } from "@/lib/auth-client";
import { setActiveOrg } from "@/lib/orgSync";
import { useEnv } from "@/utils/envUtils";

const defaultParams = {
	isAuth: true,
};

export function useAxiosInstance(params?: {
	version?: ApiVersion;
	env?: AppEnv;
	isAuth?: boolean;
	skipSandbox?: boolean;
}) {
	const currentEnv = useEnv();
	const activeSandbox = useActiveSandbox();
	const envToUse = params?.env ?? currentEnv;
	const version = params?.version ?? "1.2";
	const sandboxOrgId = params?.skipSandbox ? null : (activeSandbox?.id ?? null);

	const axiosInstance = useMemo(() => {
		const instance = axios.create({
			baseURL: import.meta.env.VITE_BACKEND_URL,
			withCredentials: true,
		});

		instance.interceptors.request.use(
			async (config: any) => {
				config.headers.app_env = envToUse;
				if (sandboxOrgId && envToUse === AppEnv.Sandbox) {
					config.headers["x-sandbox-org-id"] = sandboxOrgId;
				}
				// Only set x-api-version if not already set by the request
				if (!config.headers["x-api-version"]) {
					config.headers["x-api-version"] = version;
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
		instance.interceptors.response.use(
			(response) => response,
			async (error) => {
				if (
					error.response?.status === 403 &&
					error.response?.data?.code === "USER_REMOVED_FROM_ORG"
				) {
					try {
						// Get user's organizations
						const { data: organizations } =
							await authClient.organization.list();

						if (organizations && organizations.length > 0) {
							// User has other organizations, switch to the first available one
							const nextOrg = organizations.find(
								(org) => org.id !== error.response.data.orgId,
							);
							if (nextOrg) {
								await setActiveOrg(nextOrg.id);
								window.location.href = "/";
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

		return instance;
	}, [envToUse, version, currentEnv, sandboxOrgId]);

	return axiosInstance;
}
