import { cn } from "@/lib/utils";
import { BRACKET_CORNERS } from "../customer-stories/bracket-corners";

const isBottomRightCorner = (corner: string) =>
	corner.startsWith("bottom-0 right-0");

export default function TileCorners({
	omitBottomRight = false,
}: {
	omitBottomRight?: boolean;
}) {
	const corners = omitBottomRight
		? BRACKET_CORNERS.filter((corner) => !isBottomRightCorner(corner))
		: BRACKET_CORNERS;

	return (
		<span
			aria-hidden="true"
			className="pointer-events-none absolute inset-2.5 opacity-0 transition-opacity duration-200 ease-out group-hover:opacity-100 group-focus-visible:opacity-100"
		>
			{corners.map((corner) => (
				<span
					key={corner}
					className={cn("absolute size-2 border-white/70", corner)}
				/>
			))}
		</span>
	);
}
