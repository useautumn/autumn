import { Hyperbrowser } from "@hyperbrowser/sdk";
import * as fs from "fs";
import * as path from "path";

const client = new Hyperbrowser({
	apiKey: process.env.HYPERBROWSER_API_KEY,
});

let sessionPromise: Promise<any> | null = null;
let currentSession: any | null = null;

// File paths for coordination across processes
const TEMP_DIR = path.join(process.cwd(), ".tmp");
const SESSION_FILE = path.join(TEMP_DIR, "browser-session.json");
const LOCK_FILE = path.join(TEMP_DIR, "browser-session.lock");

// Ensure temp directory exists
if (!fs.existsSync(TEMP_DIR)) {
	fs.mkdirSync(TEMP_DIR, { recursive: true });
}

export const getBrowserSession = async () => {
	// If we already have a session in memory, return it
	if (currentSession) {
		return currentSession;
	}

	// Check if another process has already created a session
	const existingSession = loadSessionFromFile();
	if (existingSession) {
		currentSession = existingSession;
		console.log("Using existing browser session:", existingSession.id);
		return existingSession;
	}

	// If session creation is already in progress, wait for it
	if (sessionPromise) {
		return await sessionPromise;
	}

	// Try to acquire lock and create session
	sessionPromise = createSessionWithLock();

	try {
		currentSession = await sessionPromise;
		return currentSession;
	} catch (error) {
		// Reset promise on failure so we can retry
		sessionPromise = null;
		throw error;
	}
};

const createSessionWithLock = async (): Promise<any> => {
	// Try to acquire lock
	const lockAcquired = await acquireLock();

	if (!lockAcquired) {
		// Another process is creating the session, wait for it
		console.log("Waiting for another process to create browser session...");
		return await waitForSession();
	}

	try {
		// Double-check if session was created while we were acquiring lock
		const existingSession = loadSessionFromFile();
		if (existingSession) {
			console.log(
				"Session was created by another process:",
				existingSession.id,
			);
			return existingSession;
		}

		// Create new session
		console.log("Creating new browser session...");
		const session = await client.sessions.create();
		console.log("Browser session created successfully:", session.id);

		// Save session to file for other processes
		saveSessionToFile(session);

		return session;
	} finally {
		// Always release lock
		releaseLock();
	}
};

const acquireLock = async (): Promise<boolean> => {
	try {
		// Try to create lock file exclusively
		fs.writeFileSync(LOCK_FILE, process.pid.toString(), { flag: "wx" });
		return true;
	} catch (error) {
		// Lock file exists, another process has the lock
		return false;
	}
};

const releaseLock = () => {
	try {
		if (fs.existsSync(LOCK_FILE)) {
			fs.unlinkSync(LOCK_FILE);
		}
	} catch (error) {
		// Ignore errors when releasing lock
		console.warn("Warning: Could not release lock file:", error);
	}
};

const saveSessionToFile = (session: any) => {
	try {
		fs.writeFileSync(SESSION_FILE, JSON.stringify(session));
	} catch (error) {
		console.error("Failed to save session to file:", error);
	}
};

const loadSessionFromFile = (): any | null => {
	try {
		if (fs.existsSync(SESSION_FILE)) {
			const sessionData = fs.readFileSync(SESSION_FILE, "utf-8");
			return JSON.parse(sessionData);
		}
	} catch (error) {
		// If file is corrupted or doesn't exist, ignore
		console.warn("Could not load session from file:", error);
	}
	return null;
};

const waitForSession = async (): Promise<any> => {
	// Poll for session file to appear
	for (let i = 0; i < 30; i++) {
		// Wait up to 30 seconds
		await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait 1 second

		const session = loadSessionFromFile();
		if (session) {
			console.log("Found session created by another process:", session.id);
			return session;
		}
	}

	throw new Error(
		"Timeout waiting for browser session to be created by another process",
	);
};

// Reset session state (call this between test suites if needed)
export const resetBrowserSession = () => {
	console.log("Resetting browser session state...");
	currentSession = null;
	sessionPromise = null;

	// Clean up files
	try {
		if (fs.existsSync(SESSION_FILE)) {
			fs.unlinkSync(SESSION_FILE);
		}
		if (fs.existsSync(LOCK_FILE)) {
			fs.unlinkSync(LOCK_FILE);
		}
	} catch (error) {
		console.warn("Warning: Could not clean up session files:", error);
	}
};

// Cleanup on process exit
process.on("exit", () => {
	if (currentSession) {
		console.log("Process exiting, cleaning up browser session files...");
		releaseLock();
	}
});

process.on("SIGINT", () => {
	resetBrowserSession();
	process.exit(0);
});

process.on("SIGTERM", () => {
	resetBrowserSession();
	process.exit(0);
});
