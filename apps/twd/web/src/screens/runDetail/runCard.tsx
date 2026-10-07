import { type ReactNode, useEffect, useRef, useState } from "react";
import { cn } from "../../lib/format.ts";

/** A run page card: muted title, optional right-hand slot, body below. */
export const RunCard = ({
	title,
	right,
	children,
	className,
}: {
	title: ReactNode;
	right?: ReactNode;
	children: ReactNode;
	className?: string;
}) => (
	<section
		className={cn(
			"flex min-h-0 min-w-0 flex-col gap-2.5 rounded-[10px] border bg-interactive-secondary px-3.5 py-3",
			className,
		)}
	>
		<header className="flex min-h-6 shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2">
			<h2 className="text-xs font-medium text-muted-foreground">{title}</h2>
			{right}
		</header>
		{children}
	</section>
);

/** Fills the rest of its card and scrolls; fades the bottom edge while more is below. */
export const ScrollFade = ({
	children,
	className,
}: {
	children: ReactNode;
	className?: string;
}) => {
	const ref = useRef<HTMLDivElement>(null);
	const [more, setMore] = useState(false);
	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		const update = () =>
			setMore(el.scrollHeight - el.scrollTop - el.clientHeight > 1);
		update();
		const observer = new ResizeObserver(update);
		observer.observe(el);
		for (const child of el.children) observer.observe(child);
		el.addEventListener("scroll", update, { passive: true });
		return () => {
			observer.disconnect();
			el.removeEventListener("scroll", update);
		};
	}, []);
	return (
		<div className="relative min-h-0 flex-1">
			<div ref={ref} className={cn("h-full overflow-y-auto", className)}>
				{children}
			</div>
			<div
				aria-hidden
				className={cn(
					"pointer-events-none absolute inset-x-0 bottom-0 h-7 bg-gradient-to-b from-transparent to-interactive-secondary transition-opacity duration-150",
					more ? "opacity-100" : "opacity-0",
				)}
			/>
		</div>
	);
};

export const EmptyNote = ({ children }: { children: ReactNode }) => (
	<p className="py-1 text-xs text-subtle">{children}</p>
);
