import type { z } from "zod";
import type { KeyGate as KeyGateSchema } from "../../../api/contract.ts";

export type KeyGate = z.infer<typeof KeyGateSchema>;
