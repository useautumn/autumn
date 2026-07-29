import { ErrCode } from "@autumn/shared";
import { AxiosError, type AxiosInstance } from "axios";
import { toast } from "sonner";
import { OrgService } from "@/services/OrgService";
import { getBackendErr } from "@/utils/genUtils";

const isAccountMismatch = (error: unknown) =>
	error instanceof AxiosError &&
	(error.response?.data as { code?: string } | undefined)?.code ===
		ErrCode.StripeAccountMismatch;

export const connectStripe = async ({
	testApiKey,
	axiosInstance,
	mutate,
	onMismatch,
}: {
	testApiKey: string;
	axiosInstance: AxiosInstance;
	mutate: () => void;
	onMismatch?: (message: string) => void;
}) => {
	try {
		await OrgService.connectStripe(axiosInstance, {
			secret_key: testApiKey,
		});

		toast.success("Successfully connected to Stripe");
		await mutate();
	} catch (error) {
		const message = getBackendErr(error, "Failed to connect Stripe");
		if (onMismatch && isAccountMismatch(error)) {
			onMismatch(message);
		} else {
			toast.error(message);
		}
	}
};
