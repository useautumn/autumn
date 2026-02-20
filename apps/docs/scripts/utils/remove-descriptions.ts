/**
 * Remove specific description patterns from schema properties
 */
export function removeDescriptions({
  spec,
  patterns
}: {
  spec: any;
  patterns: RegExp[];
}) {
  // Recursively traverse the spec to find and clean descriptions
  function traverseAndClean(obj: any, path: string = '') {
    if (!obj || typeof obj !== 'object') {
      return;
    }

    // If this object has a description, clean it
    if (typeof obj.description === 'string') {
      let cleaned = obj.description;
      let modified = false;

      for (const pattern of patterns) {
        const original = cleaned;
        cleaned = cleaned.replace(pattern, '').trim();
        if (original !== cleaned) {
          modified = true;
        }
      }

      // Remove the description entirely if it's now empty
      if (cleaned === '') {
        delete obj.description;
        if (modified) {
          console.log(`  ✓ Removed description at ${path || 'root'}`);
        }
      } else if (modified) {
        obj.description = cleaned;
        console.log(`  ✓ Cleaned description at ${path || 'root'}`);
      }
    }

    // Recurse into all properties
    for (const key in obj) {
      if (obj.hasOwnProperty(key) && key !== 'description') {
        const newPath = path ? `${path}.${key}` : key;
        traverseAndClean(obj[key], newPath);
      }
    }
  }

  traverseAndClean(spec);
  return spec;
}
