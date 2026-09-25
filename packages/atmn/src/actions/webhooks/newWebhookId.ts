import { generateKsuid } from "@autumn/ksuid";

/** The shape the server's `generateId("wh")` mints: `wh_` and a KSUID. */
export const newWebhookId = (): string => generateKsuid({ prefix: "wh_" });
