import { useCallback, useEffect, useState } from "react";
import {
	createShakeDetector,
	isMobilePhone,
} from "@/views/command-bar/shakeDetection";

type MotionPermission =
	| "unsupported"
	| "prompt"
	| "requesting"
	| "granted"
	| "denied";

type DeviceMotionEventConstructor = typeof DeviceMotionEvent & {
	requestPermission?: () => Promise<"granted" | "denied">;
};

export const useShakeToOpenCommandBar = (onShake: () => void) => {
	const [permission, setPermission] = useState<MotionPermission>("unsupported");

	useEffect(() => {
		if (
			!isMobilePhone(navigator.userAgent) ||
			typeof window.DeviceMotionEvent === "undefined"
		) {
			setPermission("unsupported");
			return;
		}

		const DeviceMotion =
			window.DeviceMotionEvent as DeviceMotionEventConstructor;
		setPermission(
			typeof DeviceMotion.requestPermission === "function"
				? "prompt"
				: "granted",
		);
	}, []);

	useEffect(() => {
		if (permission !== "granted") return;

		const detectShake = createShakeDetector({ onShake });
		const handleMotion = (event: DeviceMotionEvent) => {
			const acceleration =
				event.acceleration ?? event.accelerationIncludingGravity;
			if (
				acceleration?.x == null ||
				acceleration.y == null ||
				acceleration.z == null
			) {
				return;
			}

			detectShake({
				x: acceleration.x,
				y: acceleration.y,
				z: acceleration.z,
				timestamp: event.timeStamp,
			});
		};

		window.addEventListener("devicemotion", handleMotion);
		return () => window.removeEventListener("devicemotion", handleMotion);
	}, [onShake, permission]);

	const requestPermission = useCallback(async () => {
		const DeviceMotion =
			window.DeviceMotionEvent as DeviceMotionEventConstructor;
		if (typeof DeviceMotion?.requestPermission !== "function") return;

		setPermission("requesting");
		try {
			setPermission(await DeviceMotion.requestPermission());
		} catch {
			setPermission("denied");
		}
	}, []);

	return { permission, requestPermission };
};
