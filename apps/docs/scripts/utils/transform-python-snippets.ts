export function transformPythonSnippets({ spec }: { spec: any }) {
  function traverse(obj: any) {
    if (obj && typeof obj === 'object') {
      if (obj['x-codeSamples'] && Array.isArray(obj['x-codeSamples'])) {
        for (const sample of obj['x-codeSamples']) {
          if (sample.lang === 'Python' && sample.source) {
            sample.source = transformPythonCode(sample.source);
          }
        }
      }

      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          traverse(obj[key]);
        }
      }
    }
  }

  traverse(spec);
  return spec;
}

function transformPythonCode(code: string): string {
  if (!code.includes('import asyncio')) {
    code = 'import asyncio\n' + code;
  }

  code = code.replace(
    /client = Autumn\(\s*\n\s*secret_key=["'][^"']*["'],?\s*\n\)/g,
    'autumn = Autumn("am_sk_1234567890")'
  );

  code = code.replace(/\bclient\./g, 'autumn.');

  const lines = code.split('\n');
  const autumnInitIndex = lines.findIndex(line => line.includes('autumn = Autumn('));

  if (autumnInitIndex === -1) {
    return code;
  }

  const beforeLines = lines.slice(0, autumnInitIndex + 1);
  const afterLines = lines.slice(autumnInitIndex + 1).filter(line => line.trim() !== '');

  const transformedAfterLines = afterLines.map(line => {
    const trimmed = line.trim();
    if (trimmed === '') return line;

    let transformed = line;
    if (trimmed.includes('autumn.') && !trimmed.includes('await')) {
      transformed = line.replace(/^(\s*)(\w+\s*=\s*)(autumn\.)/g, '$1$2await $3');
    }

    transformed = '    ' + transformed;

    return transformed;
  });

  const result = [
    ...beforeLines,
    '',
    'async def main():',
    ...transformedAfterLines,
    '',
    'asyncio.run(main())'
  ].join('\n');

  return result;
}
