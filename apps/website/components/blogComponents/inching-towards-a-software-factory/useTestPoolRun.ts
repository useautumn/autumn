"use client";

import { useEffect, useRef, useState } from "react";
import { END_MS } from "./testPoolSimulation";

export function useTestPoolRun() {
	const ref = useRef<HTMLElement>(null);
	const [playback, setPlayback] = useState({ time: 0, running: false });
	const replay = useRef(() => {});

	useEffect(() => {
		const element = ref.current;
		if (!element) return;
		const media = window.matchMedia("(prefers-reduced-motion: reduce)");
		let frame = 0;
		let last = 0;
		let time = 0;
		let visible = false;
		let started = false;
		let running = false;
		const tick = (now: number) => {
			if (!running || !visible || document.hidden) return;
			if (last) time = Math.min(END_MS, time + now - last);
			last = now;
			running = time < END_MS;
			setPlayback({ time, running });
			if (running) frame = requestAnimationFrame(tick);
		};
		const resume = () => {
			cancelAnimationFrame(frame);
			last = 0;
			if (visible && !document.hidden && running)
				frame = requestAnimationFrame(tick);
		};
		const start = () => {
			started = true;
			time = media.matches ? END_MS : 0;
			running = !media.matches;
			setPlayback({ time, running });
			resume();
		};
		replay.current = start;
		const observer = new IntersectionObserver(
			([entry]) => {
				visible = entry.isIntersecting;
				if (visible && !started) start();
				else resume();
			},
			{ threshold: 0.35 },
		);
		const onMotionChange = () => {
			if (media.matches && started) start();
		};
		observer.observe(element);
		document.addEventListener("visibilitychange", resume);
		media.addEventListener("change", onMotionChange);
		return () => {
			cancelAnimationFrame(frame);
			observer.disconnect();
			document.removeEventListener("visibilitychange", resume);
			media.removeEventListener("change", onMotionChange);
			replay.current = () => {};
		};
	}, []);

	return { ref, ...playback, replay: () => replay.current() };
}
