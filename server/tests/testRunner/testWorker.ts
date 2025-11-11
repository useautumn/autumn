#!/usr/bin/env bun

/// <reference lib="webworker" />
declare var self: Worker;

import { test } from "bun:test";

type TestMessage =
	| { type: "test-start"; file: string; test: string }
	| { type: "test-pass"; file: string; test: string; duration: number }
	| { type: "test-fail"; file: string; test: string; duration: number; error: string }
	| { type: "file-complete"; file: string; passed: number; failed: number; duration: number };

let currentFile = "";
let testsRun = 0;
let testsPassed = 0;
let testsFailed = 0;
const fileStartTime = performance.now();

// Intercept test execution to send progress updates
const originalTest = test;

// Override test to track progress
(globalThis as any).test = function (name: string, fn: Function) {
	return originalTest(name, async () => {
		testsRun++;
		const testStart = performance.now();

		self.postMessage({
			type: "test-start",
			file: currentFile,
			test: name,
		} as TestMessage);

		try {
			await fn();
			const duration = performance.now() - testStart;
			testsPassed++;

			self.postMessage({
				type: "test-pass",
				file: currentFile,
				test: name,
				duration,
			} as TestMessage);
		} catch (error) {
			const duration = performance.now() - testStart;
			testsFailed++;

			self.postMessage({
				type: "test-fail",
				file: currentFile,
				test: name,
				duration,
				error: error instanceof Error ? error.message : String(error),
			} as TestMessage);

			throw error; // Re-throw so bun:test sees the failure
		}
	});
};

self.onmessage = async (event: MessageEvent) => {
	const { testFile } = event.data;

	if (!testFile) {
		self.postMessage({ type: "error", error: "No test file specified" });
		return;
	}

	currentFile = testFile;
	testsRun = 0;
	testsPassed = 0;
	testsFailed = 0;

	try {
		// Import the test file - this will execute all tests
		await import(testFile);

		// Wait a tick for all tests to complete
		await new Promise((resolve) => setTimeout(resolve, 100));

		const fileDuration = performance.now() - fileStartTime;

		self.postMessage({
			type: "file-complete",
			file: testFile,
			passed: testsPassed,
			failed: testsFailed,
			duration: fileDuration,
		} as TestMessage);
	} catch (error) {
		self.postMessage({
			type: "error",
			file: testFile,
			error: error instanceof Error ? error.message : String(error),
		});
	}
};
