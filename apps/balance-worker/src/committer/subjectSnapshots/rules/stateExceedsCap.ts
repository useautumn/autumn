/** A state this large is never written: its customer's rows are deleted instead, and the cap is counted. */
export const stateExceedsCap = ({
	stateJson,
	maxBytes,
}: {
	stateJson: string;
	maxBytes: number;
}): boolean => Buffer.byteLength(stateJson) > maxBytes;
