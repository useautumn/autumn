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
	publish(params: CatalogInvalidation): Promise<void>;
};
