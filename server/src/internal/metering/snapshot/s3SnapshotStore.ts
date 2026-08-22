import {
	GetObjectCommand,
	NoSuchKey,
	PutObjectCommand,
	S3Client,
} from "@aws-sdk/client-s3";
import {
	FencedError,
	type MeteringSnapshot,
	type SnapshotStore,
} from "./snapshotStore.js";

export class S3SnapshotStore implements SnapshotStore {
	private readonly client: S3Client;
	private readonly bucket: string;
	private readonly prefix: string;

	constructor({
		bucket,
		prefix = "metering-snapshots",
		region = process.env.AWS_REGION ?? "us-east-1",
		client,
	}: {
		bucket: string;
		prefix?: string;
		region?: string;
		client?: S3Client;
	}) {
		this.client = client ?? new S3Client({ region });
		this.bucket = bucket;
		this.prefix = prefix;
	}

	// Fencing here is read-then-write, so it only stops a stale writer that is
	// slower than the new owner; S3 conditional writes would make it strict.
	async put({
		partition,
		epoch,
		offset,
		data,
	}: {
		partition: number;
		epoch: number;
		offset: number;
		data: string;
	}): Promise<void> {
		const stored = await this.getLatest({ partition });
		if (stored && epoch < stored.epoch) {
			throw new FencedError({ partition, epoch, storedEpoch: stored.epoch });
		}

		const snapshot: MeteringSnapshot = { partition, epoch, offset, data };
		await this.client.send(
			new PutObjectCommand({
				Bucket: this.bucket,
				Key: this.keyFor({ partition }),
				Body: JSON.stringify(snapshot),
				ContentType: "application/json",
			}),
		);
	}

	async getLatest({
		partition,
	}: {
		partition: number;
	}): Promise<MeteringSnapshot | null> {
		try {
			const response = await this.client.send(
				new GetObjectCommand({
					Bucket: this.bucket,
					Key: this.keyFor({ partition }),
				}),
			);
			const body = await response.Body?.transformToString();
			return body ? (JSON.parse(body) as MeteringSnapshot) : null;
		} catch (error) {
			if (error instanceof NoSuchKey) return null;
			if (error instanceof Error && error.name === "NoSuchKey") return null;
			throw error;
		}
	}

	private keyFor({ partition }: { partition: number }): string {
		return `${this.prefix}/partition-${partition}/latest.json`;
	}
}
