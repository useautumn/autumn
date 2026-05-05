"use client";

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import lottie, { type AnimationItem } from "lottie-web";
import { useEffect, useRef } from "react";

if (typeof window !== "undefined") {
	gsap.registerPlugin(ScrollTrigger);
}

export default function SolutionAnimation() {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const animRef = useRef<AnimationItem | null>(null);

	useEffect(() => {
		if (!containerRef.current) return;

		const isMobile = window.innerWidth < 768;
		const url = isMobile
			? "/animation/solution-mobile.json"
			: "/animation/solution-desktop.json";

		let cancelled = false;
		const cleanupRef = { current: () => {} };

		const initAnimation = () => {
			if (cancelled || !containerRef.current) return;

			fetch(url)
				.then((res) => res.json())
				.then((animationData) => {
					if (cancelled || !containerRef.current) return;

					const anim = lottie.loadAnimation({
						container: containerRef.current,
						renderer: "svg",
						loop: false,
						autoplay: false,
						animationData,
					});

					animRef.current = anim;

					const totalFrames = anim.totalFrames;
					const loopStart = Math.floor(totalFrames * 0.2);

					anim.addEventListener("complete", () => {
						anim.loop = true;
						anim.playSegments([loopStart, totalFrames], true);
					});

					const st = ScrollTrigger.create({
						trigger: containerRef.current,
						start: "top 75%",
						onEnter: () => anim.play(),
					});

					cleanupRef.current = () => {
						st.kill();
						anim.destroy();
					};
				});
		};

		// Defer the 1.4–2.1 MB Lottie JSON fetch until the element is close to
		// the viewport. Without this the browser fetches it during initial load
		// and blocks the main thread while parsing the large JSON blob.
		if (!("IntersectionObserver" in window)) {
			initAnimation();
			return;
		}

		const observer = new IntersectionObserver(
			(entries) => {
				// intersectionRatio > 0 guards against a Safari bug where
				// isIntersecting fires as false on the initial sync callback.
				if (entries[0].isIntersecting || entries[0].intersectionRatio > 0) {
					observer.disconnect();
					initAnimation();
				}
			},
			{ rootMargin: "200px" },
		);

		observer.observe(containerRef.current);

		return () => {
			cancelled = true;
			observer.disconnect();
			cleanupRef.current();
		};
	}, []);

	return <div ref={containerRef} style={{ width: "100%" }} />;
}
