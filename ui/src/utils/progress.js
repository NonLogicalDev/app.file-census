function count(value) {
  return Math.max(0, Number(value || 0));
}

function plural(value, singular, pluralValue = `${singular}s`) {
  return `${value} ${value === 1 ? singular : pluralValue}`;
}

export function poolProgressView(label, pool = {}) {
  const queued = count(pool.queued);
  const active = count(pool.active);
  const completed = count(pool.completed);
  const failed = count(pool.failed);
  const processed = completed + failed;
  const observed = processed + queued + active;
  const rawPercent = observed > 0 ? Math.round((processed / observed) * 100) : 0;
  const percent = observed > 0 && active + queued > 0
    ? Math.max(8, Math.min(100, rawPercent))
    : Math.min(100, rawPercent);
  const statusLabel = observed
    ? `Done ${processed.toLocaleString()} | Queued ${queued.toLocaleString()} | Active ${active.toLocaleString()}`
    : 'idle';
  const countLabel = `Done ${processed.toLocaleString()} | Queued ${queued.toLocaleString()} | Active ${active.toLocaleString()}`;
  const segments = [
    { id: 'done', label: 'Done', value: processed },
    { id: 'queued', label: 'Queued', value: queued },
    { id: 'active', label: 'Active', value: active }
  ].filter((segment) => segment.value > 0).map((segment) => ({
    ...segment,
    percent: observed ? (segment.value / observed) * 100 : 0
  }));

  return {
    queued,
    active,
    completed,
    failed,
    processed,
    observed,
    percent,
    segments,
    countLabel,
    statusLabel,
    ariaValueText: observed
      ? [
          plural(completed, 'completed work item'),
          failed ? `${failed} failed` : null,
          queued ? `${queued} queued` : null,
          active ? `${active} active` : null
        ].filter(Boolean).join(', ')
      : 'idle',
    title: observed ? `${label}: ${statusLabel}` : label
  };
}
