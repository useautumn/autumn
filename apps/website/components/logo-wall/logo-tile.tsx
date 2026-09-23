import { cn } from "@/lib/utils";
import { type Logo, logoHeightFactor } from "./logos";
import TileCorners from "./tile-corners";
import { TILE_FRAME } from "./tile-frame";

const LOGO_UNIT = "min(12cqw, 24px)";

export default function LogoTile({
	logo,
	className,
}: {
	logo: Logo;
	className?: string;
}) {
	return (
		<a
			href={logo.href}
			target="_blank"
			rel="noopener noreferrer"
			className={cn(
				TILE_FRAME,
				"@container group flex items-center justify-center outline-none",
				className,
			)}
		>
			<img
				src={logo.src}
				alt={logo.name}
				loading="lazy"
				draggable={false}
				className="w-auto max-w-[72%] object-contain select-none transition-[filter] duration-200 ease-out group-hover:brightness-[1.63] group-focus-visible:brightness-[1.63]"
				style={{
					height: `calc(${LOGO_UNIT} * ${logoHeightFactor(logo)})`,
				}}
			/>
			<TileCorners />
		</a>
	);
}
