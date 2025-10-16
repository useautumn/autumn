import type { CreateFeature } from "@autumn/shared";
import { useEffect, useRef } from "react";
import { useFeatureStore } from "@/hooks/stores/useFeatureStore";
import { getDefaultFeature } from "@/views/products/features/utils/defaultFeature";

/**
 * Hook to save and restore feature store state when creating a new feature in onboarding mode.
 * This prevents the onboarding feature from being overwritten when opening the new feature sheet.
 * Also ensures feature store is reset to default on mount for fresh feature creation.
 *
 * @param enabled - Whether to enable save/restore behavior (typically isOnboarding)
 */
export const useSaveRestoreFeature = ({ enabled }: { enabled: boolean }) => {
	const feature = useFeatureStore((s) => s.feature);
	const setFeature = useFeatureStore((s) => s.setFeature);
	const baseFeature = useFeatureStore((s) => s.baseFeature);
	const setBaseFeature = useFeatureStore((s) => s.setBaseFeature);

	const savedFeatureRef = useRef<{
		feature: CreateFeature;
		baseFeature: CreateFeature | null;
	} | null>(null);

	// biome-ignore lint/correctness/useExhaustiveDependencies: Intentionally using mount/unmount pattern for save/restore
	useEffect(() => {
		// Save current feature store state if enabled (onboarding mode)
		if (enabled) {
			savedFeatureRef.current = {
				feature: { ...feature },
				baseFeature: baseFeature ? { ...baseFeature } : null,
			};
		}

		// Always reset feature store to default for new feature creation
		const defaultFeature = getDefaultFeature();
		setFeature(defaultFeature);
		setBaseFeature(null);

		// Cleanup: Restore saved state on unmount (only if enabled)
		return () => {
			if (enabled && savedFeatureRef.current) {
				setFeature(savedFeatureRef.current.feature);
				setBaseFeature(savedFeatureRef.current.baseFeature);
			}
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []); // Only run on mount/unmount
};
