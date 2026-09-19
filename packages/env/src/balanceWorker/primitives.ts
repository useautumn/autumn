import { z } from "zod";

export const positiveInteger = z.coerce.number().int().positive().safe();

export const loopbackHost = z.enum(["127.0.0.1", "localhost", "::1"]);

export const topicName = z
	.string()
	.trim()
	.min(1)
	.max(249)
	.regex(/^[a-zA-Z0-9._-]+$/)
	.refine((value) => value !== "." && value !== "..");

export const brokerList = z
	.string()
	.transform((value) => value.split(",").map((broker) => broker.trim()))
	.pipe(
		z
			.array(
				z
					.string()
					.regex(/^(?:[a-zA-Z0-9.-]+|\[[a-fA-F0-9:]+\]):\d+$/)
					.refine(hasValidBrokerPort),
			)
			.min(1),
	);

export const booleanFlag = z
	.enum(["true", "false"])
	.default("false")
	.transform((value) => value === "true");

function hasValidBrokerPort(broker: string): boolean {
	const port = Number(broker.slice(broker.lastIndexOf(":") + 1));
	return port > 0 && port <= 65535;
}
