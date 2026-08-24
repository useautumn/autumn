import { createRedpandaJournal } from "../external/redpanda/createRedpandaJournal.js";
import { createMemoryJournal } from "../internal/journal/createMemoryJournal.js";
import type { Journal } from "../internal/journal/types/journal.js";
import { env, kafkaBrokers } from "./env.js";
import { logger } from "./logger.js";

const createJournal = (): Journal => {
	const brokers = kafkaBrokers();
	if (brokers.length === 0) {
		logger.info("Ledger journal is in memory", {
			event: "ledger.journal_selected",
			data: { journal: "memory" },
		});
		return createMemoryJournal();
	}

	logger.info("Ledger journal is Redpanda", {
		event: "ledger.journal_selected",
		data: { journal: "redpanda", brokers },
	});
	return createRedpandaJournal({
		ctx: { brokers, clientId: env.LEDGER_KAFKA_CLIENT_ID, logger },
	});
};

let journal: Journal | undefined;

export const getJournal = (): Journal => {
	journal ??= createJournal();
	return journal;
};
