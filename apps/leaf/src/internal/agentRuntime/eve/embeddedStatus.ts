export type EmbeddedEveStatus = "external" | "starting" | "ready" | "down";

let status: EmbeddedEveStatus = "external";

/** Readiness of the loopback eve sidecar; "external" when eve is not embedded. */
export const embeddedEveStatus = (): EmbeddedEveStatus => status;

export const setEmbeddedEveStatus = (next: EmbeddedEveStatus) => {
	status = next;
};
