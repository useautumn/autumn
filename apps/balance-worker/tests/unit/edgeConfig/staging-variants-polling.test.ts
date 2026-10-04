import { afterEach, expect, test } from "bun:test";
import {
	type EdgeConfigS3Client,
	stagingVariantsEdgeConfig,
} from "@autumn/edge-config";
import {
	createWorkerEdgeConfigs,
	type WorkerEdgeConfigs,
} from "../../../src/edgeConfig/createWorkerEdgeConfigs.js";

const LIVE = JSON.stringify({
	experiments: { slice: { arms: ["A", "B"] } },
	updatedAt: new Date().toISOString(),
});

/** Serves a live variants config from any bucket and counts reads of that key. */
const createCountingS3 = () => {
	const reads = { variants: 0 };
	const client: EdgeConfigS3Client = {
		send: async (command) => {
			const { Key } = command.input as { Key?: string };
			if (Key === stagingVariantsEdgeConfig.key) {
				reads.variants += 1;
				return { Body: { transformToString: async () => LIVE } };
			}
			const missing = new Error("NoSuchKey");
			missing.name = "NoSuchKey";
			throw missing;
		},
	};
	return { reads, client };
};

let running: WorkerEdgeConfigs | undefined;
afterEach(() => {
	running?.stop();
	running = undefined;
});

const startOn = async ({ bucket }: { bucket: string }) => {
	const { reads, client } = createCountingS3();
	running = createWorkerEdgeConfigs({
		ctx: { s3Client: client },
		config: { location: { bucket, region: "us-east-1" } },
	});
	await running.start();
	return { reads, edgeConfigs: running };
};

test("a worker on the prod or dev bucket never polls staging variants, even when the key is live", async () => {
	for (const bucket of ["autumn-prod-server", "autumn-dev-server"]) {
		const { reads, edgeConfigs } = await startOn({ bucket });
		expect(reads.variants).toBe(0);
		expect(edgeConfigs.stagingVariants.get().experiments).toEqual({});
		edgeConfigs.stop();
	}
});

test("a worker on the staging bucket polls the live variants config", async () => {
	const { reads, edgeConfigs } = await startOn({ bucket: "autumn-staging" });
	expect(reads.variants).toBe(1);
	expect(Object.keys(edgeConfigs.stagingVariants.get().experiments)).toEqual([
		"slice",
	]);
});
