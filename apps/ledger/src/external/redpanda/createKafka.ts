import { Kafka, logLevel } from "kafkajs";
import type { RedpandaContext } from "./types/redpandaContext.js";

export const createKafka = ({ ctx }: { ctx: RedpandaContext }): Kafka =>
	new Kafka({
		clientId: ctx.clientId,
		brokers: ctx.brokers,
		logLevel: logLevel.WARN,
	});
