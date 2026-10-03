import type { SetPlansPreviewWarning } from "@autumn/shared";
import { findBackdateRecreateWarning } from "./findBackdateRecreateWarning";

/** Any submit that can recreate the live subscription waits for the recreate confirm. */
export const gateBackdateRecreateSubmit = ({
	warnings,
	submit,
	requestConfirm,
}: {
	warnings?: SetPlansPreviewWarning[];
	submit: () => void;
	requestConfirm: (submit: () => void) => void;
}) => {
	if (findBackdateRecreateWarning({ warnings })) {
		requestConfirm(submit);
		return;
	}
	submit();
};
