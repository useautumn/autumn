import { createMiscCache, type MiscCache } from "@autumn/cache";
import type { MiscRedisConfig } from "@autumn/edge-config";
import type { Redis } from "ioredis";

const FAKE_BACKUP = {
	publicConnectionString: "rediss://backup.test:6385",
	privateConnectionString: null,
	url: "backup.test:6385",
};

/** A misc cache over in-memory fakes; the backup exists in the config exactly when a fake backup is given. */
export const createFakeMiscCache = ({
	main,
	backup = null,
	config = () => ({ activeInstance: "main", ramp: null }),
}: {
	main: Redis;
	backup?: Redis | null;
	config?: () => Omit<MiscRedisConfig, "backup">;
}): MiscCache =>
	createMiscCache({
		ctx: {
			config: () => ({ ...config(), backup: backup ? FAKE_BACKUP : null }),
			env: { mainUrl: "rediss://main.test:6385", region: "test", onEcs: false },
			decrypt: (encrypted) => encrypted,
			createClient: ({ config: clientConfig }) =>
				clientConfig.url === FAKE_BACKUP.publicConnectionString && backup
					? backup
					: main,
		},
		config: { commandTimeoutMs: 1_000 },
	});
