import Link from "next/link";
import { cn } from "@/lib/utils";
import CaseStudyBadge from "./case-study-badge";
import { findCaseStudyHref, type Logo, logoHeightFactor } from "./logos";
import TileCorners from "./tile-corners";
import { TILE_FRAME } from "./tile-frame";

const LOGO_UNIT = "min(12cqw, 24px)";

const EXTERNAL_LINK_PROPS = { target: "_blank", rel: "noopener noreferrer" };

export default function LogoTile({
	logo,
	className,
}: {
	logo: Logo;
	className?: string;
}) {
	const caseStudyHref = findCaseStudyHref(logo);
	const hasCaseStudy = caseStudyHref !== undefined;

	return (
		<Link
			href={caseStudyHref ?? logo.href}
			{...(hasCaseStudy ? {} : EXTERNAL_LINK_PROPS)}
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
			{hasCaseStudy && <CaseStudyBadge />}
			<TileCorners omitBottomRight={hasCaseStudy} />
		</Link>
	);
}
