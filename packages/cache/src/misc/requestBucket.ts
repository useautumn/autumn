/** A request's stable slot in [0, 100): what a percentage ramp is measured against. */
export const getRequestBucket = ({
	requestId,
}: {
	requestId: string;
}): number => Number(BigInt(Bun.hash(requestId)) % 100n);
