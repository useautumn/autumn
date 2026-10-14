import { statfsSync } from "node:fs";

export const readVolumeBytes = ({
	path,
}: {
	path: string;
}): { totalBytes: number; availBytes: number } => {
	try {
		const { bsize, blocks, bavail } = statfsSync(path);
		return { totalBytes: bsize * blocks, availBytes: bsize * bavail };
	} catch {
		return { totalBytes: 0, availBytes: 0 };
	}
};
