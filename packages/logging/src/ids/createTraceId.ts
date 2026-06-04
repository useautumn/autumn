import { randomUUID } from "node:crypto";

export const createTraceId = (): string => randomUUID();
