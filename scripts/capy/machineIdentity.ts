import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Capy writes a fresh bindingId per machine; everything else on disk can come from a cloned snapshot. */
export function readCapyBindingId({
	machineConfig = process.env.CAPY_MACHINE_CONFIG,
}: {
	machineConfig?: string;
} = {}): string | undefined {
	if (!machineConfig || !existsSync(machineConfig)) return undefined;
	const { bindingId } = JSON.parse(readFileSync(machineConfig, "utf-8")) as {
		bindingId?: unknown;
	};
	return typeof bindingId === "string" && bindingId ? bindingId : undefined;
}

export const machineIdForBinding = (bindingId: string) =>
	`capy-${bindingId.toLowerCase()}`;

/** Off Capy, a minted id persisted under the prefix stands in for the binding. */
export function getMachineId({
	prefix,
	machineConfig,
}: {
	prefix: string;
	machineConfig?: string;
}): string {
	const bindingId = readCapyBindingId({ machineConfig });
	if (bindingId) return machineIdForBinding(bindingId);

	const idPath = join(prefix, "machine-id");
	if (existsSync(idPath)) {
		const existing = readFileSync(idPath, "utf-8").trim();
		if (existing) return existing;
	}
	const minted = `capy-${randomBytes(8).toString("hex")}`;
	mkdirSync(prefix, { recursive: true });
	writeFileSync(idPath, `${minted}\n`, { mode: 0o600 });
	return minted;
}

/** State minted on another machine (a baked snapshot) must never be reused: it names that machine's branch and secrets. */
export function stateForMachine<T extends { machineId: string }>({
	state,
	machineId,
}: {
	state: T | null;
	machineId: string;
}): T | null {
	return state?.machineId === machineId ? state : null;
}
