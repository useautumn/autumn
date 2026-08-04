/** Fetch-backed S3 clients must bypass node:http and retain separate cache identity. */

import { describe, expect, jest, test } from "bun:test";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { FetchHttpHandler } from "@smithy/fetch-http-handler";
import { getS3Client } from "@/external/aws/s3/initS3.js";

describe("getS3Client", () => {
	test("creates and caches a fetch-backed client independently", () => {
		const region = "eu-west-3";
		const defaultClient = getS3Client({ region });
		const fetchClient = getS3Client({ region, httpTransport: "fetch" });
		const cachedFetchClient = getS3Client({ region, httpTransport: "fetch" });

		expect(fetchClient.config.requestHandler).toBeInstanceOf(FetchHttpHandler);
		expect(fetchClient).toBe(cachedFetchClient);
		expect(fetchClient).not.toBe(defaultClient);
	});

	test("sends signed S3 commands through the fetch transport", async () => {
		const originalFetch = globalThis.fetch;
		const fetchMock = jest.fn(
			async () =>
				new Response('{"enabled":true}', {
					headers: { "content-type": "application/json" },
				}),
		);
		globalThis.fetch = fetchMock as unknown as typeof fetch;

		try {
			const client = getS3Client({
				region: "eu-central-2",
				credentials: {
					accessKeyId: "test-access-key",
					secretAccessKey: "test-secret-key",
				},
				httpTransport: "fetch",
			});

			const response = await client.send(
				new GetObjectCommand({ Bucket: "test-bucket", Key: "config.json" }),
			);

			expect(fetchMock).toHaveBeenCalledTimes(1);
			expect(await response.Body?.transformToString()).toBe('{"enabled":true}');
		} finally {
			globalThis.fetch = originalFetch;
		}
	});
});
