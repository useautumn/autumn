/** One webhook to deliver; who delivers it, and how, is the host's. */
export type BalanceWebhook = {
	eventType: string;
	data: unknown;
	/** Svix tags, so a customer's endpoint can filter to its own customers and entities. */
	tags: string[];
	idempotencyKey?: string;
};
