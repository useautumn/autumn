export function removeSnippets({
  spec,
  removals
}: {
  spec: any;
  removals: Record<string, string[]>;
}) {
  if (!spec.paths) {
    return spec;
  }

  for (const [endpointKey, languagesToRemove] of Object.entries(removals)) {
    const [method, ...pathParts] = endpointKey.split(' ');
    const path = pathParts.join(' ');

    const lowerMethod = method.toLowerCase();

    const pathObj = spec.paths[path];
    if (!pathObj) {
      console.warn(`  ⚠ Path "${path}" not found`);
      continue;
    }

    const operation = pathObj[lowerMethod];
    if (!operation) {
      console.warn(`  ⚠ Method "${method}" not found for path "${path}"`);
      continue;
    }

    if (operation['x-codeSamples'] && Array.isArray(operation['x-codeSamples'])) {
      const originalLength = operation['x-codeSamples'].length;

      operation['x-codeSamples'] = operation['x-codeSamples'].filter(
        (sample: any) => !languagesToRemove.includes(sample.lang)
      );

      const removedCount = originalLength - operation['x-codeSamples'].length;
      if (removedCount > 0) {
        console.log(`  ✓ Removed ${removedCount} snippet(s) from ${method} ${path} (${languagesToRemove.join(', ')})`);
      }

      if (operation['x-codeSamples'].length === 0) {
        delete operation['x-codeSamples'];
      }
    }
  }

  return spec;
}
