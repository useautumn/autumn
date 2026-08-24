import type { AutumnLogger } from "@autumn/logging";

export type RedpandaContext = {
	brokers: string[];
	clientId: string;
	logger: AutumnLogger;
};
