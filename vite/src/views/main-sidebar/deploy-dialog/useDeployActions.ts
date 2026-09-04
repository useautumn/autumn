import { AppEnv } from "@autumn/shared";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useOrg } from "@/hooks/common/useOrg";
import { useDevQuery } from "@/hooks/queries/useDevQuery";
import { DevService } from "@/services/DevService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";

/**
 * The three production-deploy actions, split from their markup so the dialog
 * and the onboarding page can each lay them out in their own grammar.
 */
export const useConnectStripe = ({ isActive }: { isActive: boolean }) => {
	const { org, mutate } = useOrg({ env: AppEnv.Live });
	const axiosInstance = useAxiosInstance({ env: AppEnv.Live });
	const [isPolling, setIsPolling] = useState(false);
	const [isConnecting, setIsConnecting] = useState(false);

	const isConnected =
		org?.stripe_connection === "oauth" ||
		org?.stripe_connection === "secret_key";

	// OAuth completes in a popup we can't observe, so the org is re-read until
	// the connection lands.
	useEffect(() => {
		if (!isPolling || !isActive) return;

		const pollInterval = setInterval(async () => {
			await mutate();
			if (isConnected) {
				setIsPolling(false);
				setIsConnecting(false);
			}
		}, 2000);

		return () => clearInterval(pollInterval);
	}, [isPolling, isActive, mutate, isConnected]);

	const connect = async () => {
		setIsConnecting(true);
		setIsPolling(true);

		try {
			const { data } = await axiosInstance.get(
				"/v1/organization/stripe/oauth_url",
				{
					params: {
						redirect_url: `${import.meta.env.VITE_FRONTEND_URL}/close`,
					},
				},
			);
			// A named popup (not "_blank") so window.close() works on callback.
			window.open(
				data.oauth_url,
				"stripe_oauth",
				"width=600,height=800,popup=yes",
			);
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to get OAuth URL"));
			setIsPolling(false);
			setIsConnecting(false);
		}
	};

	return { isConnected, isConnecting, connect };
};

export const useCopyPlansToProd = () => {
	const sandboxAxios = useAxiosInstance({ env: AppEnv.Sandbox });
	const [isCopying, setIsCopying] = useState(false);
	const [isCopied, setIsCopied] = useState(false);

	const copyPlans = async () => {
		setIsCopying(true);
		try {
			await sandboxAxios.post("/products/copy_to_production");
			setIsCopied(true);
			toast.success("Successfully copied products to production");
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to copy products"));
		} finally {
			setIsCopying(false);
		}
	};

	return { isCopied, isCopying, copyPlans };
};

/** Flips the org to deployed, which is what unlocks the production env in the
 * sidebar. A hard reload so every env-scoped query refetches against live. */
export const useGoToProduction = () => {
	const axiosInstance = useAxiosInstance();
	const { mutate } = useOrg();
	const [isDeploying, setIsDeploying] = useState(false);

	const goToProduction = async () => {
		setIsDeploying(true);
		try {
			await axiosInstance.patch("/v1/organization", { deployed: true });
			await mutate();
			window.location.href = "/products?tab=products";
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to deploy to production"));
			setIsDeploying(false);
		}
	};

	return { isDeploying, goToProduction };
};

export const useCreateProdApiKey = () => {
	const { refetch } = useDevQuery();
	const axiosInstance = useAxiosInstance({ env: AppEnv.Live });
	const [isCreating, setIsCreating] = useState(false);
	const [apiKey, setApiKey] = useState("");

	const createApiKey = async () => {
		setIsCreating(true);
		try {
			const { api_key } = await DevService.createAPIKey(axiosInstance, {
				name: "Production Secret Key",
			});
			setApiKey(api_key);
			refetch();
		} catch {
			toast.error("Failed to create API key");
		} finally {
			setIsCreating(false);
		}
	};

	return { apiKey, isCreating, createApiKey };
};
