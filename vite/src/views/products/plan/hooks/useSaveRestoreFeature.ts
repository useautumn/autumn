import type { CreateFeature } from "@autumn/shared";
import { useEffect, useRef } from "react";
import { useFeatureStore } from "@/hooks/stores/useFeatureStore";
import { getDefaultFeature } from "@/views/products/features/utils/defaultFeature";

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
		if (enabled) {
			savedFeatureRef.current = {
				feature: { ...feature },
				baseFeature: baseFeature ? { ...baseFeature } : null,
			};
		}

		const defaultFeature = getDefaultFeature();
		setFeature(defaultFeature);
		setBaseFeature(null);

		return () => {
			if (enabled && savedFeatureRef.current) {
				setFeature(savedFeatureRef.current.feature);
				setBaseFeature(savedFeatureRef.current.baseFeature);
			}
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);
};
