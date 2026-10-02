import type { SyncParamsV1 } from "@autumn/shared";
import { hashKey } from "@tanstack/react-query";

/** The draft changed but the debounced preview has not been asked about it yet. */
export const hasPendingPreviewParams = ({
	params,
	debouncedParams,
}: {
	params: SyncParamsV1 | null;
	debouncedParams: SyncParamsV1 | null;
}) =>
	Boolean(params?.stripe_subscription_id) &&
	hashKey([params]) !== hashKey([debouncedParams]);
