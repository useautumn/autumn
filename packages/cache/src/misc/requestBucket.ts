export const getRequestBucket = ({
	requestId,
}: {
	requestId: string;
}): number => Number(BigInt(Bun.hash(requestId)) % 100n);
