"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";

export default function LazySection({ children }: { children: ReactNode }) {
	const ref = useRef<HTMLDivElement>(null);
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		const el = ref.current;
		if (!el) return;

		const observer = new IntersectionObserver(
			([entry]) => {
				if (entry.isIntersecting) {
					setMounted(true);
					observer.disconnect();
				}
			},
			{ rootMargin: "400px" },
		);

		observer.observe(el);
		return () => observer.disconnect();
	}, []);

	return <div ref={ref}>{mounted ? children : null}</div>;
}
