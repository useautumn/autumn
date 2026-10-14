import type { TestExecutor } from "../../testScripts/testExecutor";
import {
	type CapabilityShard,
	TEST_CAPABILITIES,
	type TestCapabilityId,
} from "./testCapabilities.ts";

export const STRIPE_CONNECT_SHARD: TestCapabilityId = "stripe-connect";

export const STRIPE_CONNECT_SHARD_ENV_VARS = [
	"SHARD_STRIPE_SANDBOX_KEY",
	"SHARD_STRIPE_CLIENT_ID",
] as const;

export const splitStripeConnectShard = <
	TShard extends { capabilities: readonly string[]; files: string[] },
>(
	capabilityShards: TShard[],
): {
	pooledShards: TShard[];
	stripeConnectShard: CapabilityShard | undefined;
} => {
	const isStripeConnect = ({ capabilities }: TShard) =>
		capabilities.includes(STRIPE_CONNECT_SHARD);
	const stripeConnect = capabilityShards.filter(isStripeConnect);
	const pooledShards = capabilityShards.filter(
		(shard) => !isStripeConnect(shard),
	);
	if (stripeConnect.length === 0)
		return { pooledShards, stripeConnectShard: undefined };
	const needed = new Set(
		stripeConnect.flatMap(({ capabilities }) => capabilities),
	);
	return {
		pooledShards,
		stripeConnectShard: {
			capabilities: TEST_CAPABILITIES.map(({ id }) => id).filter((id) =>
				needed.has(id),
			),
			files: stripeConnect.flatMap(({ files }) => files),
		},
	};
};

export type StripeConnectShardConfig = { secretKey: string; clientId: string };

export const resolveStripeConnectShard = (env: {
	SHARD_STRIPE_SANDBOX_KEY?: string;
	SHARD_STRIPE_CLIENT_ID?: string;
}): StripeConnectShardConfig | null => {
	const secretKey = env.SHARD_STRIPE_SANDBOX_KEY?.trim();
	const clientId = env.SHARD_STRIPE_CLIENT_ID?.trim();
	return secretKey && clientId ? { secretKey, clientId } : null;
};

export const isStripeConnectShardKey = (key: string): boolean =>
	key === process.env.SHARD_STRIPE_SANDBOX_KEY?.trim();

export const unavailableShardExecutor = ({
	reason,
}: {
	reason: string;
}): TestExecutor => ({
	run: async ({ onChunk }) => {
		const message = `stripe-connect shard not configured: ${reason}\n`;
		onChunk(message);
		return { exitCode: 1, stderr: message };
	},
});

export const stripeConnectWebhookUrl = ({
	ingressUrl,
}: {
	ingressUrl: string;
}): string =>
	`${ingressUrl.replace(/\/+$/, "")}/ingress/connect/sandbox?shard=${STRIPE_CONNECT_SHARD}`;

const SHARD_WEBHOOK_METADATA = { autumn_tw_shard: STRIPE_CONNECT_SHARD };

type WebhookEndpointsApi<TEvent extends string> = {
	webhookEndpoints: {
		list(params: { limit: number }): AsyncIterable<{
			id: string;
			url: string;
			enabled_events: string[];
			status: string;
			metadata: Record<string, string> | null;
		}>;
		create(params: {
			url: string;
			enabled_events: TEvent[];
			connect: boolean;
			metadata: Record<string, string>;
		}): Promise<{ id: string }>;
		update(
			id: string,
			params: {
				enabled_events: TEvent[];
				disabled: boolean;
				metadata: Record<string, string>;
			},
		): Promise<{ id: string }>;
	};
};

export const ensureStripeConnectWebhook = async <TEvent extends string>({
	stripe,
	url,
	events,
}: {
	stripe: WebhookEndpointsApi<TEvent>;
	url: string;
	events: TEvent[];
}): Promise<{ id: string; created: boolean; repaired: boolean }> => {
	for await (const endpoint of stripe.webhookEndpoints.list({ limit: 100 })) {
		if (endpoint.url !== url) continue;
		const enabled = endpoint.enabled_events;
		const missing = enabled.includes("*")
			? []
			: events.filter((event) => !enabled.includes(event));
		const tagged =
			endpoint.metadata?.autumn_tw_shard ===
			SHARD_WEBHOOK_METADATA.autumn_tw_shard;
		if (missing.length === 0 && endpoint.status === "enabled" && tagged)
			return { id: endpoint.id, created: false, repaired: false };
		await stripe.webhookEndpoints.update(endpoint.id, {
			enabled_events: [...enabled, ...missing] as TEvent[],
			disabled: false,
			metadata: SHARD_WEBHOOK_METADATA,
		});
		return { id: endpoint.id, created: false, repaired: true };
	}
	const endpoint = await stripe.webhookEndpoints.create({
		url,
		enabled_events: events,
		connect: true,
		metadata: SHARD_WEBHOOK_METADATA,
	});
	return { id: endpoint.id, created: true, repaired: false };
};
