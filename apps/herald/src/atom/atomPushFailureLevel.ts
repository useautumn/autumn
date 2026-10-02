import type { AtomConnection } from "./types/atomClient.js";

/** An org's Atom left stale serves its customers wrong answers, so it pages; our shadow Atom is test-only and never does. */
export const atomPushFailureLevel = ({
	atomConnection,
}: {
	atomConnection: AtomConnection;
}): "error" | "warn" => (atomConnection.target === "org" ? "error" : "warn");
