import { describe, expect, mock, test } from "bun:test";
import {
	createShakeDetector,
	isMobilePhone,
} from "@/views/command-bar/shakeDetection";

describe("isMobilePhone", () => {
	test("accepts iPhone and Android phone user agents", () => {
		expect(
			isMobilePhone(
				"Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1",
			),
		).toBe(true);
		expect(
			isMobilePhone(
				"Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/128.0 Mobile Safari/537.36",
			),
		).toBe(true);
	});

	test("rejects tablets and desktop browsers", () => {
		expect(
			isMobilePhone(
				"Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1",
			),
		).toBe(false);
		expect(
			isMobilePhone(
				"Mozilla/5.0 (Linux; Android 15; Pixel Tablet) AppleWebKit/537.36 Chrome/128.0 Safari/537.36",
			),
		).toBe(false);
		expect(
			isMobilePhone("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"),
		).toBe(false);
	});
});

describe("createShakeDetector", () => {
	test("requires two strong direction changes inside the peak window", () => {
		const onShake = mock();
		const detectShake = createShakeDetector({ onShake });

		detectShake({ x: 0, y: 0, z: 9.8, timestamp: 0 });
		detectShake({ x: 21, y: 0, z: 9.8, timestamp: 100 });
		expect(onShake).not.toHaveBeenCalled();
		detectShake({ x: -21, y: 0, z: 9.8, timestamp: 250 });

		expect(onShake).toHaveBeenCalledTimes(1);
	});

	test("ignores ordinary movement and enforces a cooldown", () => {
		const onShake = mock();
		const detectShake = createShakeDetector({ onShake });

		detectShake({ x: 0, y: 0, z: 9.8, timestamp: 0 });
		detectShake({ x: 2, y: 1, z: 10, timestamp: 100 });
		detectShake({ x: 22, y: 0, z: 9.8, timestamp: 200 });
		detectShake({ x: -22, y: 0, z: 9.8, timestamp: 300 });
		detectShake({ x: 22, y: 0, z: 9.8, timestamp: 400 });
		detectShake({ x: -22, y: 0, z: 9.8, timestamp: 500 });

		expect(onShake).toHaveBeenCalledTimes(1);

		detectShake({ x: 22, y: 0, z: 9.8, timestamp: 2_000 });
		detectShake({ x: -22, y: 0, z: 9.8, timestamp: 2_100 });
		expect(onShake).toHaveBeenCalledTimes(2);
	});
});
