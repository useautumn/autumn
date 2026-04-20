export const getV1PathSegmentAfter = ({
	path,
	segment,
}: {
	path: string;
	segment: string;
}): string | undefined => {
	if (!path.startsWith("/v1")) return undefined;

	const cleanPath = path.split("?")[0].replace(/^\/+|\/+$/g, "");
	const segments = cleanPath.split("/");
	const segmentIndex = segments.indexOf(segment);

	if (segmentIndex === -1) return undefined;

	return segments[segmentIndex + 1];
};
