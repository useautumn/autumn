export type EmbeddedEveStatus = "external" | "starting" | "ready" | "down";

let status: EmbeddedEveStatus = "external";

export const embeddedEveStatus = (): EmbeddedEveStatus => status;

export const setEmbeddedEveStatus = (next: EmbeddedEveStatus) => {
	status = next;
};
