type CompareInput = { created_at: number; id: string };

export const compareCusProducts = (a: CompareInput, b: CompareInput): number => {
	if (a.created_at !== b.created_at) return b.created_at - a.created_at;
	if (a.id < b.id) return -1;
	if (a.id > b.id) return 1;
	return 0;
};
