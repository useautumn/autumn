import { cn } from "@/lib/utils";

const CORNERS = [
	"top-0 left-0 border-t-[1.5px] border-l-[1.5px]",
	"top-0 right-0 border-t-[1.5px] border-r-[1.5px]",
	"bottom-0 left-0 border-b-[1.5px] border-l-[1.5px]",
	"bottom-0 right-0 border-b-[1.5px] border-r-[1.5px]",
] as const;

export function BracketCorners() {
	return (
		<div
			aria-hidden="true"
			className="pointer-events-none absolute inset-4 md:inset-6 z-20"
		>
			{CORNERS.map((corner) => (
				<span
					key={corner}
					className={cn("absolute h-4 w-4 border-white/70", corner)}
				/>
			))}
		</div>
	);
}
