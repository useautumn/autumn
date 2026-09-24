import { jest } from "bun:test";
import type { Logger } from "@/external/logtail/logtailUtils.js";

export const createFakeLogger = () => {
	const logger = {
		debug: jest.fn(),
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
		child: (): Logger => logger,
	};
	return logger;
};
