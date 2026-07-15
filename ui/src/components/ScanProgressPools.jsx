import { poolProgressView } from '../utils/progress.js';
import {
  progressBarClassName,
  progressMetaClassName,
  progressPoolClassName,
  progressPoolCountClassName,
  progressPoolHeaderClassName,
  progressPoolsClassName,
  progressPoolTitleClassName,
  progressSegmentClassName,
  progressStatusClassName
} from './ui/progressClasses.js';

const POOLS = [
  ['discovery', 'Discovery'],
  ['metadata', 'Metadata'],
  ['hashing', 'Hashing']
];

export default function ScanProgressPools({ progress, compact = false }) {
  const pools = progress?.pools;
  if (!pools) return null;

  return (
    <div className={progressPoolsClassName({ compact })} aria-label="Scan worker pool progress">
      {POOLS.map(([id, label]) => (
        <PoolProgress key={id} label={label} pool={pools[id]} compact={compact} />
      ))}
    </div>
  );
}

function PoolProgress({ label, pool = {}, compact }) {
  const view = poolProgressView(label, pool);

  return (
    <section className={progressPoolClassName({ compact })} title={view.title}>
      <div className={progressPoolHeaderClassName({ compact })}>
        <strong className={progressPoolTitleClassName}>{label}</strong>
        <span className={progressPoolCountClassName}>{view.countLabel}</span>
      </div>
      <div className={progressBarClassName({ compact })} role="progressbar" aria-label={`${label} worker pool`} aria-valuemin="0" aria-valuemax="100" aria-valuenow={view.percent} aria-valuetext={view.ariaValueText}>
        {view.segments.map((segment) => (
          <span
            key={segment.id}
            className={progressSegmentClassName(segment.id)}
            style={{ width: `${segment.percent}%` }}
            title={`${segment.label}: ${segment.value.toLocaleString()}`}
          />
        ))}
      </div>
      {!compact && (
        <div className={progressMetaClassName}>
          <span className={progressStatusClassName}>{view.statusLabel}</span>
        </div>
      )}
    </section>
  );
}
