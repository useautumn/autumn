import type { SyncParamsV1 } from "@autumn/shared";
import { hashKey } from "@tanstack/react-query";

export const hasPendingPreviewParams = ({
	params,
	debouncedParams,
}: {
	params: SyncParamsV1 | null;
	debouncedParams: SyncParamsV1 | null;
}) =>
	Boolean(params?.stripe_subscription_id) &&
	hashKey([params]) !== hashKey([debouncedParams]);
