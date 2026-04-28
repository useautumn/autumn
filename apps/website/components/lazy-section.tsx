"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";

export default function LazySection({ children }: { children: ReactNode }) {
	const ref = useRef<HTMLDivElement>(null);
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		const el = ref.current;
		if (!el) return;

		// iOS < 12.2 has no IntersectionObserver — mount everything immediately.
		if (!("IntersectionObserver" in window)) {
			setMounted(true);
			return;
		}

		const observer = new IntersectionObserver(
			([entry]) => {
				// intersectionRatio > 0 guards against a Safari bug where
				// isIntersecting fires as false on the initial sync callback.
				if (entry.isIntersecting || entry.intersectionRatio > 0) {
					setMounted(true);
					observer.disconnect();
				}
			},
			{ rootMargin: "1000px 0px" },
		);

		observer.observe(el);
		return () => observer.disconnect();
	}, []);

	// min-height: 1px prevents the wrapper collapsing to zero height before
	// content mounts, which would cause iOS to jump scroll position on mount.
	return <div ref={ref} style={{ minHeight: "1px" }}>{mounted ? children : null}</div>;
}
