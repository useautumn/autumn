import type { SetPlansPreviewWarning } from "@autumn/shared";

/** The warning a backdate over a live subscription carries; submitting it needs a confirm. */
export const findBackdateRecreateWarning = ({
	warnings,
}: {
	warnings?: SetPlansPreviewWarning[];
}) =>
	warnings?.find(
		(warning) => warning.type === "subscription_recreated_backdated",
	);
