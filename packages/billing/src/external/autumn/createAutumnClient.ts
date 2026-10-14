import { Autumn } from "autumn-js";
import type { TrackItem } from "../../actions/pushHourlyMeters/types/trackItem";
import type { AutumnClient } from "../../types/autumnClient";

const SANDBOX_KEY_PREFIX = "am_sk_test_";

export type AutumnClientConfig = {
	secretKey: string;
	serverUrl?: string;
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
		edgeURL: process.env.AUTUMN_EDGE_URL || undefined,
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

	const checkOn =
		(client: Autumn) =>
		async ({
			customerId,
			featureId,
		}: {
			customerId: string;
			featureId: string;
		}) => {
			const { allowed } = await client.check({ customerId, featureId });
			return { allowed };
		};

	return {
		batchTrack,
		getOrCreateCustomer,
		check: checkOn(sdk),
		edge: { check: checkOn(sdk.edge) },
	};
};
