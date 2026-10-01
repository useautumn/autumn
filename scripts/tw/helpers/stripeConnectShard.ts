// The stripe-connect shard runs on one dedicated Stripe platform account, kept apart from the key pool:
// never pooled, farmed, nuked or reset. Its Connect webhook is created once and never deleted.

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

/** One shard for every file needing stripe-connect: one account means one worker, with every capability those files need. */
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

/** Null unless both SHARD_STRIPE_* vars are set; there is no pool fallback. */
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

/** Fails every file it is given, so an unavailable shard is reported instead of silently run elsewhere. */
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

/** The query tells twd's ingress to hand unregistered accounts' events to the shard worker. */
export const stripeConnectWebhookUrl = ({
	ingressUrl,
}: {
	ingressUrl: string;
}): string =>
	`${ingressUrl.replace(/\/+$/, "")}/ingress/connect/sandbox?shard=${STRIPE_CONNECT_SHARD}`;

/** Stripe's endpoint object doesn't report `connect`, so the tag set at creation proves it is a Connect endpoint. */
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
			params: { enabled_events: TEvent[]; disabled: boolean },
		): Promise<{ id: string }>;
	};
};

/** Reuses (and repairs) the tagged endpoint at `url`, else creates it; it is never deleted. */
export const ensureStripeConnectWebhook = async <TEvent extends string>({
	stripe,
	url,
	events,
}: {
	stripe: WebhookEndpointsApi<TEvent>;
	url: string;
	events: TEvent[];
}): Promise<{ id: string; created: boolean; repaired: boolean }> => {
	let untagged = false;
	for await (const endpoint of stripe.webhookEndpoints.list({ limit: 100 })) {
		if (endpoint.url !== url) continue;
		if (
			endpoint.metadata?.autumn_tw_shard !==
			SHARD_WEBHOOK_METADATA.autumn_tw_shard
		) {
			untagged = true;
			continue;
		}
		const enabled = endpoint.enabled_events;
		const missing = enabled.includes("*")
			? []
			: events.filter((event) => !enabled.includes(event));
		if (missing.length === 0 && endpoint.status === "enabled")
			return { id: endpoint.id, created: false, repaired: false };
		await stripe.webhookEndpoints.update(endpoint.id, {
			enabled_events: [...enabled, ...missing] as TEvent[],
			disabled: false,
		});
		return { id: endpoint.id, created: false, repaired: true };
	}
	if (untagged) {
		throw new Error(
			`a webhook endpoint at ${url} was not created by the stripe-connect shard, so its Connect setting is unknown; remove it in the shard's Stripe dashboard`,
		);
	}
	const endpoint = await stripe.webhookEndpoints.create({
		url,
		enabled_events: events,
		connect: true,
		metadata: SHARD_WEBHOOK_METADATA,
	});
	return { id: endpoint.id, created: true, repaired: false };
};
