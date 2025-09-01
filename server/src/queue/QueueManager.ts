import "dotenv/config";

import { Queue } from "bullmq";
import { Redis } from "ioredis";

const BACKUP_REDIS_URL = process.env.REDIS_BACKUP_URL || process.env.REDIS_URL;
const MAIN_REDIS_URL = process.env.REDIS_URL;

export class QueueManager {
	private static instance: QueueManager;
	private queue: Queue | null = null;
	private backupQueue: Queue | null = null;

	private mainConnection: Redis | null = null;
	private backupConnection: Redis | null = null;

	private constructor() {
		this.initializePromise = this.initQueue();
	}

	private initializePromise: Promise<void>;
	public static async getInstance(): Promise<QueueManager> {
		if (!QueueManager.instance) {
			QueueManager.instance = new QueueManager();
		}
		// Wait for initialization to complete
		await QueueManager.instance.initializePromise;
		return QueueManager.instance;
	}

	// 1. Create main redis connection
	private async pingRedis({
		useBackup,
		keepConnection = false,
	}: {
		useBackup: boolean;
		keepConnection?: boolean;
	}) {
		const redisUrl = useBackup ? BACKUP_REDIS_URL : MAIN_REDIS_URL;

		const connection = new Redis(redisUrl!, {
			retryStrategy: (_times) => {
				return 5000;
			},
		});

		connection.on("error", (error) => {
			console.log(
				`Redis connection error (${useBackup ? "backup" : "main"}): ${
					error.message
				}`,
			);

			if (!keepConnection) {
				process.exit(1);
			}
		});

		// Check if connection is live...
		await connection.ping();

		if (!keepConnection) {
			await connection.quit();
		}
		return connection;
	}

	private async createConnections() {
		console.log("2. Creating redis connections (for workers...)");

		this.mainConnection = await this.pingRedis({
			useBackup: false,
			keepConnection: true,
		});
		this.backupConnection = await this.pingRedis({
			useBackup: true,
			keepConnection: true,
		});
	}

	private async initQueue() {
		console.log("Initializing Queue Manager...");
		console.group();
		// 1. Create redis connections
		console.log("1. Pinging main & backup redis");
		this.mainConnection = await this.pingRedis({ useBackup: false });
		this.backupConnection = await this.pingRedis({ useBackup: true });

		await this.createConnections();
		// 2. Initialize main and backup queues
		console.log("2. Initializing main & backup queues");
		const mainQueue = new Queue("autumn", {
			connection: {
				url: MAIN_REDIS_URL,
				enableOfflineQueue: false,
				retryStrategy: (_times: number) => {
					return 5000;
				},
			},
		});

		const backupQueue = new Queue("autumn", {
			connection: {
				url: BACKUP_REDIS_URL,
				enableOfflineQueue: false,
			},
		});

		// Set up error handling for the queue
		mainQueue.on("error", async (error: any) => {
			console.error("QUEUE ERROR:", error.message);
			if (error.code !== "ECONNREFUSED") {
			}
		});

		backupQueue.on("error", async (error: any) => {
			console.error("BACKUP QUEUE ERROR:", error.message);
			if (error.code !== "ECONNREFUSED") {
			}
		});

		this.queue = mainQueue;
		this.backupQueue = backupQueue;
		console.groupEnd();
	}

	// Create workers

	public static async getQueue({
		useBackup,
	}: {
		useBackup: boolean;
	}): Promise<Queue> {
		const queueManager = await QueueManager.getInstance();
		if (!queueManager.queue || !queueManager.backupQueue) {
			throw new Error("Queue not initialized");
		}

		return useBackup ? queueManager.backupQueue : queueManager.queue;
	}

	public static async getConnection({
		useBackup,
	}: {
		useBackup: boolean;
	}): Promise<Redis> {
		const queueManager = await QueueManager.getInstance();
		if (!queueManager.mainConnection || !queueManager.backupConnection) {
			throw new Error("Connection not initialized");
		}
		return useBackup
			? queueManager.backupConnection
			: queueManager.mainConnection;
	}

	public getBackupConnection(): Redis {
		if (!this.backupConnection) {
			throw new Error("Backup connection not initialized");
		}
		return this.backupConnection;
	}
}
