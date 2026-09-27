import { Autumn } from "@useautumn/sdk";
import type { TrackItem } from "../../actions/pushHourlyMeters/types/trackItem";
import type { AutumnClient } from "../../types/autumnClient";

const SANDBOX_KEY_PREFIX = "am_sk_test_";

export type AutumnClientConfig = {
	secretKey: string;
	/** Defaults to the SDK's production URL. */
	serverUrl?: string;
	/** Off by default: a live key is refused so metering can't reach the real org by accident. */
	allowLiveKey?: boolean;
};

const trackItemToBatchTrackItem = (item: TrackItem) => ({
	customerId: item.customerId,
	featureId: item.featureId,
	value: item.value,
	timestamp: item.timestampMs,
	idempotencyKey: item.idempotencyKey,
	properties: item.properties,
});

/** Autumn's own org, through the public SDK, exactly as a customer would call it. */
export const createAutumnClient = ({
	config,
}: {
	config: AutumnClientConfig;
}): AutumnClient => {
	if (
		!config.allowLiveKey &&
		!config.secretKey.startsWith(SANDBOX_KEY_PREFIX)
	) {
		throw new Error(
			`Metering refuses a non-sandbox Autumn key (expected ${SANDBOX_KEY_PREFIX}…); pass allowLiveKey to override`,
		);
	}
	const sdk = new Autumn({
		secretKey: config.secretKey,
		serverURL: config.serverUrl,
	});

	const batchTrack = async ({ items }: { items: TrackItem[] }) => {
		await sdk.batchTrack(items.map(trackItemToBatchTrackItem));
		return { accepted: items.length };
	};

	const getOrCreateCustomer = async ({
		id,
		name,
	}: {
		id: string;
		name: string;
	}) => {
		await sdk.customers.getOrCreate({ customerId: id, name });
	};

	return { batchTrack, getOrCreateCustomer };
};
