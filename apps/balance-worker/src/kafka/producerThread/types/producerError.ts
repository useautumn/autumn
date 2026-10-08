/** A producer failure as data, so it can cross threads; the decide thread rebuilds an error the classifiers read alike. */
export type ProducerError = {
	name: string;
	message: string;
	/** librdkafka's code: negative for client-side failures, the Kafka protocol code otherwise. */
	code?: number;
	/** Verdicts are carried only when the original gave one, so a wrapper never hides its cause's. */
	retriable?: boolean;
	isRetriable?: boolean;
	fatal?: boolean;
	abortable?: boolean;
	cause?: ProducerError;
	abortCause?: ProducerError;
	errors?: ProducerError[];
};
