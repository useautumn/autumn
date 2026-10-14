import { toast } from "sonner";
import { getBackendErr } from "@/utils/genUtils";

export const runWithErrorToast = async ({
	action,
	fallbackMessage,
}: {
	action: () => Promise<unknown>;
	fallbackMessage: string;
}): Promise<boolean> => {
	try {
		await action();
		return true;
	} catch (error) {
		toast.error(getBackendErr(error, fallbackMessage));
		return false;
	}
};
