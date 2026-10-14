import type { AppEnv } from "@autumn/shared";

export type SvixEndpoint = {
	id: string;
	url: string;
	filterTypes: string[];
	disabled: boolean;
};

export type SvixMessage = {
	eventType: string;
	data: unknown;
	tags?: string[];
	idempotencyKey?: string;
	payloadFields?: { id?: string; occurred_at?: number };
};

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
		featureFlags?: string[];
	}): Promise<string>;
	sendMessage(params: { appId: string; message: SvixMessage }): Promise<void>;
	listEndpoints(params: { appId: string }): Promise<SvixEndpoint[]>;
};
