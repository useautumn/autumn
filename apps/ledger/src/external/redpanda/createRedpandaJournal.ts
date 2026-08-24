import { Partitioners, type Producer } from "kafkajs";
import type { LedgerEntry } from "../../api/journal/types/ledgerEntry.js";
import type { Journal } from "../../internal/journal/types/journal.js";
import { createKafka } from "./createKafka.js";
import { ensureSubjectEventsTopic } from "./ensureSubjectEventsTopic.js";
import { ledgerEntryToKafkaMessage } from "./ledgerEntryToKafkaMessage.js";
import { SUBJECT_EVENTS_TOPIC } from "./subjectEventsTopic.js";
import type { RedpandaContext } from "./types/redpandaContext.js";

const ACKS_ALL = -1;

const connectProducer = async ({
	ctx,
}: {
	ctx: RedpandaContext;
}): Promise<Producer> => {
	const kafka = createKafka({ ctx });
	await ensureSubjectEventsTopic({ ctx, kafka });

	// Every message names its partition, so the partitioner never runs; naming
	// it anyway silences kafkajs's v2 migration warning.
	const producer = kafka.producer({
		idempotent: true,
		createPartitioner: Partitioners.DefaultPartitioner,
	});
	await producer.connect();
	return producer;
};

// One send per slice. A rejection is the writer loop's rollback signal, so the
// error is never swallowed here.
const appendEntries = async ({
	getProducer,
	entries,
}: {
	getProducer: () => Promise<Producer>;
	entries: LedgerEntry[];
}): Promise<void> => {
	if (entries.length === 0) return;

	const producer = await getProducer();
	await producer.send({
		topic: SUBJECT_EVENTS_TOPIC,
		acks: ACKS_ALL,
		messages: entries.map((entry) => ledgerEntryToKafkaMessage({ entry })),
	});
};

export const createRedpandaJournal = ({
	ctx,
}: {
	ctx: RedpandaContext;
}): Journal => {
	// Connect on the first append, and retry the connect on the next one if it
	// failed — a broker that is not up yet must not wedge the process.
	let connecting: Promise<Producer> | undefined;
	const getProducer = (): Promise<Producer> => {
		connecting ??= connectProducer({ ctx }).catch((error: unknown) => {
			connecting = undefined;
			throw error;
		});
		return connecting;
	};

	return { append: ({ entries }) => appendEntries({ getProducer, entries }) };
};
