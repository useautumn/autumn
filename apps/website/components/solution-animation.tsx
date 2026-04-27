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
		let cancelled = false;

		const isMobile = window.innerWidth < 768;
		const url = isMobile
			? "/animation/solution-mobile.json"
			: "/animation/solution-desktop.json";

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

		const cleanupRef = { current: () => {} };

		return () => {
			cancelled = true;
			cleanupRef.current();
		};
	}, []);

	return <div ref={containerRef} style={{ width: "100%" }} />;
}
