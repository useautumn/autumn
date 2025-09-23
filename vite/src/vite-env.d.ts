/// <reference types="vite/client" />

// View Transitions API
interface Document {
	startViewTransition?: (callback: () => void) => ViewTransition;
}

interface ViewTransition {
	finished: Promise<void>;
	ready: Promise<void>;
	updateCallbackDone: Promise<void>;
	skipTransition(): void;
}
