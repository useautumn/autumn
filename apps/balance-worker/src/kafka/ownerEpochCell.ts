export type OwnerEpochCell = {
	read(): string | undefined;
	write(epoch: string): void;
};

export function createOwnerEpochCell(): OwnerEpochCell {
	let current: string | undefined;
	function read(): string | undefined {
		return current;
	}
	function write(epoch: string): void {
		current = epoch;
	}
	return { read, write };
}
