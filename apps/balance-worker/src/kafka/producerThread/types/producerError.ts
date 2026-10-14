export type ProducerError = {
	kind: "protocol" | "other";
	name: string;
	message: string;
	type?: string;
	code?: number;
	retriable: boolean;
	cause?: ProducerError;
	errors?: ProducerError[];
};
