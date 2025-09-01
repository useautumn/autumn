import { Redis } from "ioredis";

export class CacheManager {
	private static instance: CacheManager | null = null;
	private client: Redis | null = null;
	private initialized = false;
	private initPromise: Promise<void> | null = null;

	private constructor() {
		// Empty private constructor
	}

	// Create redis connection
	private async initializeRedis(): Promise<void> {
		console.log("Initializing Cache Manager...");
		if (this.initialized) return;

		const redisUrl = process.env.REDIS_BACKUP_URL || process.env.REDIS_URL;

		if (!redisUrl) {
			throw new Error("Cache error: no redis connection string set in env");
		}

		this.client = new Redis(redisUrl, {
			retryStrategy: (_times) => {
				return 5000;
			},
		});

		this.client.on("error", (error) => {
			console.log(`Cache manager connection error: ${error.message}`);
		});

		// Check if connection is live
		console.log("  1. Pinging redis...");
		await this.client.ping();

		this.initialized = true;
	}

	public static async getInstance(): Promise<CacheManager> {
		if (!CacheManager.instance) {
			CacheManager.instance = new CacheManager();
			CacheManager.instance.initPromise =
				CacheManager.instance.initializeRedis();
		}

		// Wait for initialization to complete
		if (CacheManager.instance.initPromise) {
			await CacheManager.instance.initPromise;
		}

		return CacheManager.instance;
	}

	public static async getClient() {
		const cache = await CacheManager.getInstance();
		return cache.client;
	}

	public static async getJson(key: string) {
		const client = await CacheManager.getClient();

		if (!client) {
			throw new Error("Cache client not initialized");
		}

		if (client.status !== "ready") {
			console.warn("Cache client is not in ready state");
			return null;
		}

		const res = await client.get(key);

		if (!res) {
			return null;
		}

		return JSON.parse(res);
	}

	public static async setJson(
		key: string,
		value: any,
		ttl: number | string = 3600,
	) {
		const client = await CacheManager.getClient();
		if (!client) {
			throw new Error("Cache client not initialized");
		}

		if (client.status !== "ready") {
			console.warn("Cache client is not in ready state");
			return;
		}

		if (typeof ttl === "number") {
			await client.set(key, JSON.stringify(value), "EX", ttl);
		} else if (typeof ttl === "string" && ttl.toLowerCase() === "forever") {
			await client.set(key, JSON.stringify(value));
		}
	}

	public static async invalidate({
		action,
		value,
	}: {
		action: string;
		value: string;
	}) {
		const client = await CacheManager.getClient();
		if (!client) {
			throw new Error("Cache client not initialized");
		}

		if (client.status !== "ready") {
			console.warn("Cache client is not in ready state");
			return;
		}

		await client.del(`${action}:${value}`);
	}

	static async disconnect() {
		const client = await CacheManager.getClient();
		if (!client) {
			throw new Error("Cache client not initialized");
		}

		if (client.status !== "ready") {
			console.warn("Cache client is not in ready state");
			return;
		}

		await client.quit();
	}
}
