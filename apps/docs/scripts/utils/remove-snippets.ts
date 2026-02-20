/**
 * Remove code snippets for specific endpoints
 * Config format: { 'METHOD /path': ['Language1', 'Language2'] }
 */
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
    // Parse endpoint key: "METHOD /path"
    const [method, ...pathParts] = endpointKey.split(' ');
    const path = pathParts.join(' '); // Rejoin in case path has spaces

    const lowerMethod = method.toLowerCase();

    // Find the path and method in the spec
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

    // Remove x-codeSamples for specified languages
    if (operation['x-codeSamples'] && Array.isArray(operation['x-codeSamples'])) {
      const originalLength = operation['x-codeSamples'].length;

      operation['x-codeSamples'] = operation['x-codeSamples'].filter(
        (sample: any) => !languagesToRemove.includes(sample.lang)
      );

      const removedCount = originalLength - operation['x-codeSamples'].length;
      if (removedCount > 0) {
        console.log(`  ✓ Removed ${removedCount} snippet(s) from ${method} ${path} (${languagesToRemove.join(', ')})`);
      }

      // If no samples left, remove the array entirely
      if (operation['x-codeSamples'].length === 0) {
        delete operation['x-codeSamples'];
      }
    }
  }

  return spec;
}
