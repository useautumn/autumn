"use client";

import { useEffect, useRef, useState } from "react";
import {
	SESSION_DURATION_MS,
	SESSION_PLAYBACK_RATE,
	SESSION_STAGES,
	sessionStageAt,
} from "./cloudAgentSessionData";

export function useCloudAgentSession() {
	const ref = useRef<HTMLElement>(null);
	const [playback, setPlayback] = useState({
		time: 0,
		playing: false,
		inspected: null as number | null,
	});
	const controls = useRef({
		replay: () => {},
		toggle: () => {},
		inspect: (_index: number) => {},
	});

	useEffect(() => {
		const element = ref.current;
		if (!element) return;
		const media = window.matchMedia("(prefers-reduced-motion: reduce)");
		let time = 0;
		let playing = false;
		let started = false;
		let visible = false;
		let inspected: number | null = null;
		let frame = 0;
		let previous = 0;
		const publish = () => setPlayback({ time, playing, inspected });
		const tick = (now: number) => {
			if (!playing || !visible || document.hidden) return;
			if (previous)
				time = Math.min(
					SESSION_DURATION_MS,
					time + (now - previous) * SESSION_PLAYBACK_RATE,
				);
			previous = now;
			playing = time < SESSION_DURATION_MS;
			publish();
			if (playing) frame = requestAnimationFrame(tick);
		};
		const resume = () => {
			cancelAnimationFrame(frame);
			previous = 0;
			if (playing && visible && !document.hidden)
				frame = requestAnimationFrame(tick);
		};
		const replay = () => {
			started = true;
			inspected = null;
			time = media.matches ? SESSION_DURATION_MS : 0;
			playing = !media.matches;
			publish();
			resume();
		};
		controls.current = {
			replay,
			toggle: () => {
				if (time >= SESSION_DURATION_MS) {
					replay();
					return;
				}
				started = true;
				inspected = null;
				playing = !playing;
				publish();
				resume();
			},
			inspect: (index) => {
				started = true;
				playing = false;
				inspected = index;
				time = SESSION_STAGES[index].end;
				publish();
				resume();
			},
		};
		const observer = new IntersectionObserver(
			([entry]) => {
				visible = entry.isIntersecting;
				if (visible && !started) replay();
				else resume();
			},
			{ threshold: 0.3 },
		);
		const onMotionChange = () => {
			if (media.matches && started) replay();
		};
		observer.observe(element);
		document.addEventListener("visibilitychange", resume);
		media.addEventListener("change", onMotionChange);
		return () => {
			observer.disconnect();
			cancelAnimationFrame(frame);
			document.removeEventListener("visibilitychange", resume);
			media.removeEventListener("change", onMotionChange);
		};
	}, []);

	return {
		ref,
		...playback,
		stageIndex:
			playback.inspected ?? Math.max(0, sessionStageAt(playback.time)),
		replay: () => controls.current.replay(),
		toggle: () => controls.current.toggle(),
		inspect: (index: number) => controls.current.inspect(index),
	};
}
