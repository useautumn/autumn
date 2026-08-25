export async function* ndjsonLines(
	chunks: AsyncIterable<Uint8Array> | Iterable<Uint8Array>,
): AsyncGenerator<string> {
	const decoder = new TextDecoder();
	let buffer = "";
	for await (const chunk of chunks) {
		buffer += decoder.decode(chunk, { stream: true });
		let newlineIndex = buffer.indexOf("\n");
		while (newlineIndex >= 0) {
			const line = buffer.slice(0, newlineIndex).trim();
			buffer = buffer.slice(newlineIndex + 1);
			newlineIndex = buffer.indexOf("\n");
			if (line) yield line;
		}
	}
}
