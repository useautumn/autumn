/** How far a copy's customer row says Autumn has applied the writer's seqs, whatever atom id it holds them under. */
export const seenSeqOf = ({
	atomSeqs,
	writerId,
}: {
	atomSeqs: Record<string, Record<string, number>> | null | undefined;
	writerId: string;
}): number =>
	Object.values(atomSeqs ?? {}).find((writerSeqs) => writerId in writerSeqs)?.[
		writerId
	] ?? 0;
