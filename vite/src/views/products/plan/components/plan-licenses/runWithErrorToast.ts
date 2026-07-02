import { toast } from "sonner";
import { getBackendErr } from "@/utils/genUtils";

/**
 * Run an async action, toasting a backend error on failure. Returns true on
 * success, false on failure — so callers can branch (e.g. close a sheet only
 * when the mutation actually succeeded).
 */
export const runWithErrorToast = async (
	action: () => Promise<unknown>,
	fallbackMessage: string,
): Promise<boolean> => {
	try {
		await action();
		return true;
	} catch (error) {
		toast.error(getBackendErr(error, fallbackMessage));
		return false;
	}
};
