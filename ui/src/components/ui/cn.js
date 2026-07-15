export function cn(...values) {
  return values.flatMap(normalizeClassValue).filter(Boolean).join(' ');
}

function normalizeClassValue(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap(normalizeClassValue);
  if (typeof value === 'object') {
    return Object.entries(value)
      .filter(([, enabled]) => Boolean(enabled))
      .map(([className]) => className);
  }
  return [String(value)];
}
