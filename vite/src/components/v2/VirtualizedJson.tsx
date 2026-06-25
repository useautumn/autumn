import { useVirtualizer } from "@tanstack/react-virtual";
import { useMemo, useRef } from "react";
import { highlightJsonLine } from "@/lib/highlightJson";
import { cn } from "@/lib/utils";

const LINE_HEIGHT = 21;
const OVERSCAN = 20;

/**
 * Renders large JSON fast by virtualizing lines — only the visible ~30 lines
 * are highlighted and mounted, keeping DOM node count constant regardless of
 * payload size. A single <pre> with thousands of spans stalls layout/paint.
 */
export function VirtualizedJson({
	json,
	className,
}: {
	json: string;
	className?: string;
}) {
	const lines = useMemo(() => json.split("\n"), [json]);
	const scrollRef = useRef<HTMLDivElement>(null);

	const virtualizer = useVirtualizer({
		count: lines.length,
		getScrollElement: () => scrollRef.current,
		estimateSize: () => LINE_HEIGHT,
		overscan: OVERSCAN,
	});

	return (
		<div
			ref={scrollRef}
			className={cn(
				"overflow-auto font-mono font-medium text-[13px] leading-[1.6]",
				className,
			)}
		>
			<div
				className="relative w-max min-w-full"
				style={{ height: virtualizer.getTotalSize() }}
			>
				{virtualizer.getVirtualItems().map((item) => (
					<div
						key={item.key}
						className="absolute left-0 top-0 whitespace-pre px-4"
						style={{
							height: LINE_HEIGHT,
							transform: `translateY(${item.start}px)`,
						}}
						// biome-ignore lint/security/noDangerouslySetInnerHtml: highlightJsonLine escapes all input
						dangerouslySetInnerHTML={{
							__html: highlightJsonLine(lines[item.index]) || "​",
						}}
					/>
				))}
			</div>
		</div>
	);
}
