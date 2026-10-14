export function stripJsDoc({ spec }: { spec: any }) {
  let strippedCount = 0;

  function cleanDescription(description: string): string {
    if (!description || typeof description !== 'string') {
      return description;
    }

    const sections = description.split(/\n\s*\n/);
    const firstSection = sections[0];

    const cleaned = firstSection
      .split('\n')
      .map(line => line.trim())
      .join(' ')
      .trim();

    if (cleaned !== description.trim()) {
      strippedCount++;
    }

    return cleaned;
  }

  function traverseAndClean(obj: any) {
    if (!obj || typeof obj !== 'object') {
      return;
    }

    if ('description' in obj && typeof obj.description === 'string') {
      obj.description = cleanDescription(obj.description);
    }

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
