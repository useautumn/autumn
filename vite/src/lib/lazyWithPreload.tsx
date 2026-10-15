import {
	type ComponentType,
	lazy,
	useState,
	useSyncExternalStore,
} from "react";

/**
 * React.lazy that renders synchronously once its chunk is preloaded. Plain lazy
 * always suspends on first render, and React then holds the reveal for 300ms.
 */
export const lazyWithPreload = <Props extends object>(
	load: () => Promise<{ default: ComponentType<Props> }>,
) => {
	let loaded: ComponentType<Props> | undefined;
	let settled = false;
	let pending: Promise<{ default: ComponentType<Props> }> | undefined;
	const listeners = new Set<() => void>();

	const settle = () => {
		settled = true;
		for (const listener of listeners) listener();
	};

	const loadOnce = () => {
		pending ??= load().then(
			(module) => {
				loaded = module.default;
				settle();
				return module;
			},
			(error) => {
				// A failed fetch (deploy, flaky network) must not leave callers waiting forever:
				// settle so the route renders, and let the next attempt fetch again.
				pending = undefined;
				settle();
				throw error;
			},
		);
		return pending;
	};

	/** Fire-and-forget warm-up; render-time failures surface through React.lazy instead. */
	const preload = () => {
		loadOnce().catch(() => undefined);
	};

	const isSettled = () => settled;

	// Subscribing starts the load, so a caller waiting on the chunk never has to kick it off.
	const subscribe = (listener: () => void) => {
		listeners.add(listener);
		preload();
		return () => {
			listeners.delete(listener);
		};
	};

	const LazyComponent = lazy(loadOnce);

	const PreloadableComponent = (props: Props) => {
		// Fixed for the component's lifetime, so a later preload never swaps it and remounts.
		const [Component] = useState<ComponentType<Props>>(
			() => loaded ?? LazyComponent,
		);
		return <Component {...props} />;
	};

	return Object.assign(PreloadableComponent, {
		preload,
		isSettled,
		subscribe,
	});
};

type PreloadableChunk = {
	isSettled: () => boolean;
	subscribe: (listener: () => void) => () => void;
};

const alwaysSettled = () => true;
const noopSubscribe = () => () => {};

/** Loads a preloadable route chunk and reports when it has finished, loaded or not. */
export const useChunkSettled = (chunk: PreloadableChunk | undefined) =>
	useSyncExternalStore(
		chunk?.subscribe ?? noopSubscribe,
		chunk?.isSettled ?? alwaysSettled,
	);
