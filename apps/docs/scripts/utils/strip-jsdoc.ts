/**
 * Strip JSDoc content from descriptions, keeping only the first paragraph
 */
export function stripJsDoc({ spec }: { spec: any }) {
  let strippedCount = 0;

  function cleanDescription(description: string): string {
    if (!description || typeof description !== 'string') {
      return description;
    }

    // Split by double newline (blank line) and take the first section
    const sections = description.split(/\n\s*\n/);
    const firstSection = sections[0];

    // Clean up whitespace - normalize line breaks and trim
    const cleaned = firstSection
      .split('\n')
      .map(line => line.trim())
      .join(' ')
      .trim();

    // Only count if we actually changed something
    if (cleaned !== description.trim()) {
      strippedCount++;
    }

    return cleaned;
  }

  function traverseAndClean(obj: any) {
    if (!obj || typeof obj !== 'object') {
      return;
    }

    // Clean description field if it exists
    if ('description' in obj && typeof obj.description === 'string') {
      obj.description = cleanDescription(obj.description);
    }

    // Recurse into all properties
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        traverseAndClean(obj[key]);
      }
    }
  }

  traverseAndClean(spec);

  if (strippedCount > 0) {
    console.log(`  ✓ Stripped JSDoc from ${strippedCount} description(s)`);
  }

  return spec;
}
