import { describe, expect, test } from "bun:test";
import { createCsvUploadBuffer } from "@/internal/customers/exports/csv/csvUploadBuffer.js";

const decoder = new TextDecoder();

const createRecordingUploader = () => {
	const uploads: Array<{ partNumber: number; body: Uint8Array }> = [];
	return {
		uploads,
		uploadPart: ({
			partNumber,
			body,
		}: {
			partNumber: number;
			body: Uint8Array;
		}) => {
			uploads.push({ partNumber, body });
			return Promise.resolve({ partNumber, eTag: `etag-${partNumber}` });
		},
	};
};

describe("createCsvUploadBuffer", () => {
	test("buffers small appends and uploads a single final part", async () => {
		const { uploads, uploadPart } = createRecordingUploader();
		const buffer = createCsvUploadBuffer({ uploadPart, flushBytes: 100 });

		await buffer.append("header\r\n");
		await buffer.append("row-1\r\n");
		const { parts, byteCount } = await buffer.finalize();

		expect(uploads).toHaveLength(1);
		expect(parts).toEqual([{ partNumber: 1, eTag: "etag-1" }]);
		expect(decoder.decode(uploads[0].body)).toBe("header\r\nrow-1\r\n");
		expect(byteCount).toBe(uploads[0].body.byteLength);
	});

	test("flushes a part whenever the buffer clears the threshold", async () => {
		const { uploads, uploadPart } = createRecordingUploader();
		const buffer = createCsvUploadBuffer({ uploadPart, flushBytes: 10 });

		await buffer.append("aaaa");
		expect(uploads).toHaveLength(0);
		await buffer.append("bbbbbbb");
		expect(uploads).toHaveLength(1);
		await buffer.append("cc");
		const { parts } = await buffer.finalize();

		expect(uploads).toHaveLength(2);
		expect(parts.map((part) => part.partNumber)).toEqual([1, 2]);
		expect(decoder.decode(uploads[0].body)).toBe("aaaabbbbbbb");
		expect(decoder.decode(uploads[1].body)).toBe("cc");
	});

	test("every part except the last meets the flush threshold", async () => {
		const { uploads, uploadPart } = createRecordingUploader();
		const flushBytes = 8;
		const buffer = createCsvUploadBuffer({ uploadPart, flushBytes });

		for (let index = 0; index < 10; index++) {
			await buffer.append("abc");
		}
		await buffer.finalize();

		for (const upload of uploads.slice(0, -1)) {
			expect(upload.body.byteLength).toBeGreaterThanOrEqual(flushBytes);
		}
	});

	test("concatenated parts reproduce the appended text in order", async () => {
		const { uploads, uploadPart } = createRecordingUploader();
		const buffer = createCsvUploadBuffer({ uploadPart, flushBytes: 5 });

		const appended = ["one,", "two,", "three,", "four"];
		for (const text of appended) {
			await buffer.append(text);
		}
		const { byteCount } = await buffer.finalize();

		const combined = uploads
			.map((upload) => decoder.decode(upload.body))
			.join("");
		expect(combined).toBe(appended.join(""));
		expect(byteCount).toBe(new TextEncoder().encode(combined).byteLength);
	});

	test("uploads nothing when no text was appended", async () => {
		const { uploads, uploadPart } = createRecordingUploader();
		const buffer = createCsvUploadBuffer({ uploadPart });

		await buffer.append("");
		const { parts, byteCount } = await buffer.finalize();

		expect(uploads).toHaveLength(0);
		expect(parts).toEqual([]);
		expect(byteCount).toBe(0);
	});

	test("counts multi-byte characters by encoded size, not string length", async () => {
		const { uploads, uploadPart } = createRecordingUploader();
		const buffer = createCsvUploadBuffer({ uploadPart, flushBytes: 4 });

		// Two euro signs encode to 6 bytes, crossing the 4-byte threshold at once.
		await buffer.append("€€");
		const { byteCount } = await buffer.finalize();

		expect(uploads).toHaveLength(1);
		expect(uploads[0].body.byteLength).toBe(6);
		expect(byteCount).toBe(6);
	});
});
