/** zstd keeps a ~8 KB state near 1.8 KB, inline in the row rather than TOASTed, so each rewrite logs ~40% less WAL. */
export const subjectSnapshotStateHex = ({
	stateJson,
}: {
	stateJson: string;
}): string =>
	`\\x${Buffer.from(Bun.zstdCompressSync(Buffer.from(stateJson), { level: 1 })).toString("hex")}`;

export const subjectSnapshotStateOf = ({
	stored,
}: {
	stored: Uint8Array;
}): unknown =>
	JSON.parse(Buffer.from(Bun.zstdDecompressSync(stored)).toString("utf8"));
