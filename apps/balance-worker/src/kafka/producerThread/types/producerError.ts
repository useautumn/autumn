/** A producer failure as data, so it can cross threads; the decide thread rebuilds the class the writer tests for. */
export type ProducerError = {
	/** `protocol`: the broker refused, nothing was appended. `other`: the outcome is unknown. */
	kind: "protocol" | "other";
	name: string;
	message: string;
	type?: string;
	code?: number;
	retriable: boolean;
	/** Nested causes keep their type and code, so fencing detection still walks them. */
	cause?: ProducerError;
	errors?: ProducerError[];
};
