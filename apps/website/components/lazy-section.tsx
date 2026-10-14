"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";

export default function LazySection({ children }: { children: ReactNode }) {
	const ref = useRef<HTMLDivElement>(null);
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		const el = ref.current;
		if (!el) return;

		if (!("IntersectionObserver" in window)) {
			setMounted(true);
			return;
		}

		const observer = new IntersectionObserver(
			([entry]) => {
				// intersectionRatio > 0 guards against a Safari bug where
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

	return <div ref={ref} style={{ minHeight: "1px" }}>{mounted ? children : null}</div>;
}
