import {
	GetObjectCommand,
	ListObjectsV2Command,
	NoSuchKey,
	PutObjectCommand,
	S3Client,
} from "@aws-sdk/client-s3";
import {
	FencedError,
	type MeteringSnapshot,
	type SnapshotStore,
} from "./snapshotStore.js";

const CLAIM_KEY_PATTERN = /epoch-(\d+)\.json$/;

// S3 conditional-write failures don't get a typed exception class from the
// SDK (only Get/Head-family errors like NoSuchKey do) — they surface as a
// generic service exception with a 412 status, so this is the only reliable
// way to tell "someone already claimed this epoch" apart from a real failure.
const isPreconditionFailed = ({ error }: { error: unknown }): boolean => {
	if (!(error instanceof Error)) return false;
	const metadata = (error as { $metadata?: { httpStatusCode?: number } })
		.$metadata;
	return (
		metadata?.httpStatusCode === 412 || error.name === "PreconditionFailed"
	);
};

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

	// Durably claims the next epoch even when no snapshot is ever written under
	// it (e.g. a worker that claims ownership and crashes before its first
	// snapshot): a claim marker records the epoch as taken independently of
	// `put()`'s epoch fence, so a later boot can't be handed the same epoch a
	// dead owner already holds.
	async claimEpoch({ partition }: { partition: number }): Promise<number> {
		let candidate = await this.nextCandidate({ partition });

		for (;;) {
			try {
				await this.client.send(
					new PutObjectCommand({
						Bucket: this.bucket,
						Key: this.claimKeyFor({ partition, epoch: candidate }),
						Body: JSON.stringify({
							partition,
							epoch: candidate,
							claimedAt: new Date().toISOString(),
						}),
						ContentType: "application/json",
						IfNoneMatch: "*",
					}),
				);
				return candidate;
			} catch (error) {
				if (!isPreconditionFailed({ error })) throw error;
				candidate = Math.max(
					candidate + 1,
					await this.nextCandidate({ partition }),
				);
			}
		}
	}

	private async nextCandidate({
		partition,
	}: {
		partition: number;
	}): Promise<number> {
		const [latest, highestClaim] = await Promise.all([
			this.getLatest({ partition }),
			this.highestClaimedEpoch({ partition }),
		]);
		return Math.max(latest?.epoch ?? 0, highestClaim) + 1;
	}

	private async highestClaimedEpoch({
		partition,
	}: {
		partition: number;
	}): Promise<number> {
		let highest = 0;
		let continuationToken: string | undefined;

		do {
			const response = await this.client.send(
				new ListObjectsV2Command({
					Bucket: this.bucket,
					Prefix: this.claimsPrefixFor({ partition }),
					ContinuationToken: continuationToken,
				}),
			);

			for (const object of response.Contents ?? []) {
				const match = object.Key?.match(CLAIM_KEY_PATTERN);
				if (match) highest = Math.max(highest, Number(match[1]));
			}

			continuationToken = response.IsTruncated
				? response.NextContinuationToken
				: undefined;
		} while (continuationToken);

		return highest;
	}

	private keyFor({ partition }: { partition: number }): string {
		return `${this.prefix}/partition-${partition}/latest.json`;
	}

	private claimsPrefixFor({ partition }: { partition: number }): string {
		return `${this.prefix}/partition-${partition}/claims/`;
	}

	private claimKeyFor({
		partition,
		epoch,
	}: {
		partition: number;
		epoch: number;
	}): string {
		return `${this.claimsPrefixFor({ partition })}epoch-${epoch}.json`;
	}
}
