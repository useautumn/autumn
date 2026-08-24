import type { Batch } from "kafkajs";
import type { SubjectEventBatch } from "../../internal/projector/types/subjectEventBatch.js";

// Undoing JSON is transport; deciding whether the result is an entry is the
// projector's job, so a broken payload arrives as `undefined`, not a throw.
const parseValue = ({ value }: { value: Buffer | null }): unknown => {
	if (value === null) return undefined;
	try {
		return JSON.parse(value.toString("utf8"));
	} catch {
		return undefined;
	}
};

export const kafkaBatchToSubjectEventBatch = ({
	batch,
}: {
	batch: Batch;
}): SubjectEventBatch => ({
	partition: batch.partition,
	records: batch.messages.map((message) => ({
		offset: message.offset,
		value: parseValue({ value: message.value }),
	})),
});
