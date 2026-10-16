import { toast } from "sonner";
import { getBackendErr } from "@/utils/genUtils";
import { isPermissionDeniedError } from "./permissionDenialUtils";

/** Toasts a failed write, except a rules denial, which the sheet renders inline. */
export const toastWriteError = ({
	error,
	fallback,
}: {
	error: unknown;
	fallback: string;
}) => {
	if (isPermissionDeniedError({ error })) return;
	toast.error(getBackendErr(error, fallback));
};
