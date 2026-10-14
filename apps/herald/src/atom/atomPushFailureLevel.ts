import type { AtomConnection } from "./types/atomClient.js";

export const atomPushFailureLevel = ({
	atomConnection,
}: {
	atomConnection: AtomConnection;
}): "error" | "warn" => (atomConnection.target === "org" ? "error" : "warn");
