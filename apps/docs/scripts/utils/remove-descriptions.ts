export function removeDescriptions({
  spec,
  patterns
}: {
  spec: any;
  patterns: RegExp[];
}) {
  function traverseAndClean(obj: any, path: string = '') {
    if (!obj || typeof obj !== 'object') {
      return;
    }

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
