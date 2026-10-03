export const stateExceedsCap = ({
	stateJson,
	maxBytes,
}: {
	stateJson: string;
	maxBytes: number;
}): boolean => Buffer.byteLength(stateJson) > maxBytes;
