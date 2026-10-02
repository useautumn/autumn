import {
	type SetPlansErrorCopy,
	SetPlansErrorDetailsSchema,
	setPlansErrorCopy,
} from "@autumn/shared";
import { AxiosError } from "axios";
import { getBackendErr } from "@/utils/genUtils";

const ERROR_FALLBACK = "Failed to load preview";

/** Structured copy when the server sent details; otherwise its message as a single line. */
export const previewErrorToSetPlansErrorCopy = (
	error: unknown,
): SetPlansErrorCopy | null => {
	if (!error) return null;
	if (error instanceof AxiosError) {
		const details = SetPlansErrorDetailsSchema.safeParse(
			error.response?.data?.details,
		);
		if (details.success) return setPlansErrorCopy(details.data);
		return { line: [{ text: getBackendErr(error, ERROR_FALLBACK) }] };
	}
	const message = error instanceof Error ? error.message : "";
	return { line: [{ text: message || ERROR_FALLBACK }] };
};
