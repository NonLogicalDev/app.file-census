const MAX_DNS_LABEL_LENGTH = 63;

export function normalizeLocationSlug(value, fallback = '') {
  const normalized = String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, MAX_DNS_LABEL_LENGTH)
    .replace(/-$/g, '');

  return normalized || fallback;
}

export function locationNameFromPath(path) {
  const normalized = String(path || '').trim().replace(/[\\/]+$/g, '');
  if (!normalized) return '';
  const parts = normalized.split(/[\\/]+/).filter(Boolean);
  return parts.at(-1) || '';
}

export function buildLocationSlug(kind, name) {
  const typePart = normalizeLocationSlug(kind, 'local');
  const namePart = normalizeLocationSlug(name, 'location');
  return normalizeLocationSlug(`${typePart}-${namePart}`, 'local-location');
}

export function deriveLocationFields(form, changes, auto = {}, options = {}) {
  const next = { ...form, ...changes };
  const changed = (field) => Object.prototype.hasOwnProperty.call(changes, field);
  let autoName = Boolean(auto.name);
  let autoSlug = Boolean(auto.slug);

  if (changed('slug') && !options.slugDisabled) {
    next.slug = normalizeLocationSlug(next.slug);
    autoSlug = false;
  }

  if (changed('name')) {
    autoName = false;
  }

  if (changed('root_path')) {
    const pathName = locationNameFromPath(next.root_path);
    if (pathName && (!String(form.name || '').trim() || autoName)) {
      next.name = pathName;
      autoName = true;
    }
  }

  if (!options.slugDisabled && !changed('slug') && (!String(form.slug || '').trim() || autoSlug)) {
    next.slug = buildLocationSlug(next.kind, next.name || locationNameFromPath(next.root_path));
    autoSlug = true;
  }

  return {
    form: next,
    auto: { name: autoName, slug: autoSlug }
  };
}
