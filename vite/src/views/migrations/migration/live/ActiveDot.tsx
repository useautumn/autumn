import { cn } from "@/lib/utils";

export function ActiveDot({ color }: { color: "green" | "orange" }) {
	const bg = color === "green" ? "bg-green-500" : "bg-orange-400";
	const ping = color === "green" ? "bg-green-400" : "bg-orange-300";
	return (
		<span className="relative flex size-2">
			<span
				className={cn(
					"absolute inline-flex size-full animate-ping rounded-full opacity-75",
					ping,
				)}
			/>
			<span className={cn("relative inline-flex size-2 rounded-full", bg)} />
		</span>
	);
}
