import { Writable } from "node:stream";

export const createConsoleJsonStream = () =>
	new Writable({
		write(chunk, _encoding, callback) {
			console.log(chunk.toString().trimEnd());
			callback();
		},
	});
