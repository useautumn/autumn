import { toast } from "sonner";
import { getBackendErr } from "@/utils/genUtils";
import { denialFromError } from "./resolvePermissionDenial";

/** Toasts a failed write, except a rules denial when the sheet renders it inline. */
export const toastWriteError = ({
	error,
	fallback,
	inlineDenials = true,
}: {
	error: unknown;
	fallback: string;
	inlineDenials?: boolean;
}) => {
	if (inlineDenials && denialFromError({ error })) return;
	toast.error(getBackendErr(error, fallback));
};
