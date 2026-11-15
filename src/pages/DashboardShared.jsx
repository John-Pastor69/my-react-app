import React, { useEffect, useMemo, useRef, useState } from 'react';
import { sortRankingByValue } from '../services/facilityUtilization';

// Checkbox that can also show a "some selected" dash (used for "All sections" in the export pop-ups).
export const IndeterminateCheckbox = ({ checked, indeterminate, ...props }) => {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return <input ref={ref} type="checkbox" checked={checked} {...props} />;
};

export const RankingModeToggle = ({ label, value, onChange }) => (
  <div className="ranking-mode-toggle" role="group" aria-label={`${label} ranking`}>
    <button type="button" aria-pressed={value === 'most'} onClick={() => onChange('most')}>Most</button>
    <button type="button" aria-pressed={value === 'least'} onClick={() => onChange('least')}>Least</button>
  </div>
);

const RankingRows = ({ items, maximum, trackClassName, otherLabel, ariaLabel }) => (
  <div className="ranking-list" tabIndex={0} aria-label={ariaLabel}>
    {items.map((item, index) => (
      <div className="ranking-row" key={item.id}>
        <span className="ranking-position">{String(index + 1).padStart(2, '0')}</span>
        <span
          className="ranking-name"
          title={item.isOtherRequest ? `${otherLabel}: ${item.name}` : item.name}
        >
          {item.isOtherRequest ? `Other: ${item.name}` : item.name}
        </span>
        <div className={`ranking-track${trackClassName ? ` ${trackClassName}` : ''}`}>
          <span style={{ width: `${item.quantity / maximum * 100}%` }} />
        </div>
        <strong>{item.quantity}</strong>
      </div>
    ))}
  </div>
);

// Most/Least requested ranking for equipment or utilities, working the same way as the
// Most/Least Requested Facilities panel: the panel shows the top 3 (Most leaves out items with
// no requests), ties are listed alphabetically, and "View All" lists every item, including
// those with no requests.
export const ResourceRankingPanel = ({
  title,
  modeLabel,
  mode,
  onModeChange,
  items,
  itemLabel,
  otherLabel,
  trackClassName,
  emptyMessage
}) => {
  const [isAllOpen, setIsAllOpen] = useState(false);
  const isMost = mode === 'most';
  const rankedItems = useMemo(() => sortRankingByValue(items, mode, 'quantity'), [items, mode]);
  const topItems = (isMost ? rankedItems.filter((item) => item.quantity > 0) : rankedItems).slice(0, 3);
  const maximum = Math.max(1, ...rankedItems.map((item) => item.quantity));
  const heading = `${isMost ? 'Most' : 'Least'} Requested ${title}`;
  const dialogTitleId = `${modeLabel.toLowerCase()}-ranking-all-title`;

  useEffect(() => {
    if (!isAllOpen) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setIsAllOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isAllOpen]);

  return (
    <article className="dashboard-panel ranking-panel">
      <div className="panel-heading">
        <div>
          <h2>{heading}</h2>
        </div>
        <RankingModeToggle label={modeLabel} value={mode} onChange={onModeChange} />
      </div>
      {topItems.length ? (
        <RankingRows
          items={topItems}
          maximum={maximum}
          trackClassName={trackClassName}
          otherLabel={otherLabel}
          ariaLabel={`${modeLabel} request rankings`}
        />
      ) : (
        <p className="panel-empty">{emptyMessage}</p>
      )}
      {rankedItems.length > 1 && (
        <button
          className="venue-utilization-view-all"
          type="button"
          onClick={() => setIsAllOpen(true)}
        >
          View All ({rankedItems.length})
        </button>
      )}

      {isAllOpen && (
        <div
          className="specific-rooms-overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setIsAllOpen(false);
          }}
        >
          <section
            className="specific-rooms-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby={dialogTitleId}
          >
            <div className="specific-rooms-heading">
              <div>
                <h2 id={dialogTitleId}>All {title} — {isMost ? 'Most' : 'Least'} Requested</h2>
              </div>
              <button
                className="specific-rooms-close"
                type="button"
                aria-label={`Close all ${itemLabel} rankings`}
                onClick={() => setIsAllOpen(false)}
              >
                ×
              </button>
            </div>
            <div className="specific-rooms-list facility-ranking-modal-list">
              <RankingRows
                items={rankedItems}
                maximum={maximum}
                trackClassName={trackClassName}
                otherLabel={otherLabel}
                ariaLabel={`All ${itemLabel} request rankings`}
              />
            </div>
          </section>
        </div>
      )}
    </article>
  );
};
