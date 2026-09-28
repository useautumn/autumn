import type { AppEnv } from "@autumn/shared";

export type SvixEndpoint = {
	id: string;
	url: string;
	/** Empty means the endpoint receives every event type. */
	filterTypes: string[];
	disabled: boolean;
};

/** What one webhook delivery is; the Svix message it becomes is the client's business. */
export type SvixMessage = {
	eventType: string;
	data: unknown;
	/** So an endpoint can filter to its own customers and entities. */
	tags?: string[];
	idempotencyKey?: string;
	/** Fields Svix places beside `data` in the payload, when a caller has to set them. */
	payloadFields?: { id?: string; occurred_at?: number };
};

/** Everything Autumn asks of Svix, against one API key. Every method takes the app it acts on. */
export type SvixClient = {
	createApp(params: {
		name: string;
		orgId: string;
		env: AppEnv;
		metadata?: Record<string, unknown>;
	}): Promise<{ id: string }>;
	deleteApp(params: { appId: string }): Promise<void>;
	appPortalUrl(params: {
		appId: string;
		/** Portal features Svix turns on for the session, such as a partner's branding. */
		featureFlags?: string[];
	}): Promise<string>;
	sendMessage(params: { appId: string; message: SvixMessage }): Promise<void>;
	listEndpoints(params: { appId: string }): Promise<SvixEndpoint[]>;
};
