import type { AxiosInstance } from "axios";
import { toast } from "sonner";
import { OrgService } from "@/services/OrgService";
import { getBackendErr } from "@/utils/genUtils";

export const connectStripe = async ({
	testApiKey,
	axiosInstance,
	mutate,
}: {
	testApiKey: string;
	axiosInstance: AxiosInstance;
	mutate: () => void;
}) => {
	try {
		await OrgService.connectStripe(axiosInstance, {
			testApiKey,
			liveApiKey: testApiKey,
			successUrl: `https://useautumn.com`,
		});

		toast.success("Successfully connected to Stripe");
		await mutate();
	} catch (error) {
		console.log("Failed to connect Stripe", error);
		toast.error(getBackendErr(error, "Failed to connect Stripe"));
	}
};
