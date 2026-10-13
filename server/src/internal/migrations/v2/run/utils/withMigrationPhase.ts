import { withActiveSpan } from "@/utils/otel/withActiveSpan.js";

export const withMigrationPhase = <T>({
	phase,
	run,
}: {
	phase: "claim" | "customer" | "hydrate" | "billing" | "settle";
	run: () => Promise<T>;
}): Promise<T> => withActiveSpan({ name: `migration.${phase}`, fn: run });
