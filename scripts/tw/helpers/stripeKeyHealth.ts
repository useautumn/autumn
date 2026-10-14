import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { REGISTRY_DIR } from "../constants.js";

const KEY_HEALTH_FILE = join(REGISTRY_DIR, "stripe-key-health.json");
const KEY_HEALTH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type KeyHealthCache = Record<string, { checkedAt: number }>;

const isKeyHealthCache = (value: unknown): value is KeyHealthCache =>
	typeof value === "object" &&
	value !== null &&
	Object.values(value).every(
		(entry) =>
			typeof entry === "object" &&
			entry !== null &&
			"checkedAt" in entry &&
			typeof entry.checkedAt === "number",
	);

const keyFingerprint = (key: string): string =>
	createHash("sha256").update(key).digest("hex").slice(0, 24);

const readCache = (): KeyHealthCache => {
	try {
		const parsed: unknown = JSON.parse(readFileSync(KEY_HEALTH_FILE, "utf8"));
		return isKeyHealthCache(parsed) ? parsed : {};
	} catch {
		return {};
	}
};

export const isKeyKnownHealthy = ({
	cache,
	key,
}: {
	cache: KeyHealthCache;
	key: string;
}): boolean => {
	const entry = cache[keyFingerprint(key)];
	return (
		entry !== undefined && Date.now() - entry.checkedAt < KEY_HEALTH_TTL_MS
	);
};

export const loadKeyHealthCache = (): KeyHealthCache => readCache();

export const saveHealthyKeys = ({
	cache,
	healthyKeys,
}: {
	cache: KeyHealthCache;
	healthyKeys: string[];
}): void => {
	const now = Date.now();
	const next: KeyHealthCache = {};
	for (const [fingerprint, entry] of Object.entries(cache)) {
		if (now - entry.checkedAt < KEY_HEALTH_TTL_MS) {
			next[fingerprint] = entry;
		}
	}
	for (const key of healthyKeys) {
		next[keyFingerprint(key)] = { checkedAt: now };
	}
	try {
		mkdirSync(REGISTRY_DIR, { recursive: true });
		writeFileSync(KEY_HEALTH_FILE, JSON.stringify(next, null, 2));
	} catch {}
};
