import { toast } from "sonner";
import { getBackendErr } from "@/utils/genUtils";
import { formatDenialToast } from "./formatDenial";
import { denialFromError } from "./resolvePermissionDenial";

/** Toasts a failed write; a rules denial names its rule, or stays silent when the sheet renders it inline. */
export const toastWriteError = ({
	error,
	fallback,
	inlineDenials = true,
}: {
	error: unknown;
	fallback: string;
	inlineDenials?: boolean;
}) => {
	const denial = denialFromError({ error });
	if (!denial) {
		toast.error(getBackendErr(error, fallback));
		return;
	}
	if (inlineDenials) return;
	toast.error(formatDenialToast({ denial }));
};
