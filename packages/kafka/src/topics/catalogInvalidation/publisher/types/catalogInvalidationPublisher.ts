import type { KafkaSender } from "../../../../client/types/kafkaClient.js";

export type CatalogInvalidationPublisherContext = {
	producer: KafkaSender;
	topic: string;
};

export type CatalogInvalidation = {
	orgId: string;
	env: string;
	at: number;
};

export type CatalogInvalidationPublisher = {
	/** Acknowledged by the broker before it resolves; every subscriber drops the org's rows on reading it. */
	publish(params: CatalogInvalidation): Promise<void>;
};
