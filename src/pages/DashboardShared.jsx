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

// "Export dashboard PDF" button that opens a pop-up for choosing which sections go in the PDF.
// `sections`: [{ key, label }] in report order. `onExport({ sections })` resolves true when the PDF saved.
export const SectionExportActions = ({
  isExporting,
  error,
  onExport,
  sections,
  dateRangeLabel,
  resultCount,
  dialogTitle = 'Export Filtered Analytics'
}) => {
  const allKeys = sections.map((section) => section.key);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedSections, setSelectedSections] = useState(() => new Set(allKeys));
  const closeModal = () => setIsOpen(false);

  useEffect(() => {
    if (!isOpen || isExporting) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isExporting]);

  const allSelected = allKeys.every((key) => selectedSections.has(key));
  const selectedCount = allKeys.filter((key) => selectedSections.has(key)).length;
  const canExport = selectedCount > 0 && !isExporting;
  const toggleSection = (key) => setSelectedSections((current) => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });
  const handleExport = async () => {
    if (!canExport) return;
    const succeeded = await onExport({ sections: allKeys.filter((key) => selectedSections.has(key)) });
    if (succeeded) setIsOpen(false);
  };

  return (
    <div className="dashboard-export-actions">
      <button
        className="dashboard-export-button"
        type="button"
        onClick={() => setIsOpen(true)}
        disabled={isExporting}
      >
        {isExporting ? 'Generating PDF...' : 'Export dashboard PDF'}
      </button>
      {error && !isOpen && (
        <span className="dashboard-export-error" role="alert">{error}</span>
      )}

      {isOpen && (
        <div
          className="specific-rooms-overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !isExporting) closeModal();
          }}
        >
          <section
            className="specific-rooms-dialog dashboard-export-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="section-export-title"
          >
            <div className="specific-rooms-heading">
              <div>
                <h2 id="section-export-title">{dialogTitle}</h2>
                <p>
                  {dateRangeLabel} · {resultCount} {resultCount === 1 ? 'reservation' : 'reservations'} found
                </p>
              </div>
              <button
                className="specific-rooms-close"
                type="button"
                aria-label="Close export options"
                onClick={closeModal}
                disabled={isExporting}
              >
                ×
              </button>
            </div>

            <div className="specific-rooms-list dashboard-export-options">
              <fieldset>
                <legend>Sections to export</legend>
                <label className="dashboard-export-option dashboard-export-option-all">
                  <IndeterminateCheckbox
                    checked={allSelected}
                    indeterminate={selectedCount > 0 && !allSelected}
                    onChange={() => setSelectedSections(allSelected ? new Set() : new Set(allKeys))}
                  />
                  <span>All sections</span>
                </label>
                {sections.map((section) => (
                  <label className="dashboard-export-option" key={section.key}>
                    <input
                      type="checkbox"
                      checked={selectedSections.has(section.key)}
                      onChange={() => toggleSection(section.key)}
                    />
                    <span>{section.label}</span>
                  </label>
                ))}
              </fieldset>
            </div>

            <div className="dashboard-export-footer">
              {error && <span className="dashboard-export-error" role="alert">{error}</span>}
              <button
                className="dashboard-export-cancel"
                type="button"
                onClick={closeModal}
                disabled={isExporting}
              >
                Cancel
              </button>
              <button
                className="dashboard-export-button"
                type="button"
                onClick={handleExport}
                disabled={!canExport}
              >
                {isExporting ? 'Generating PDF...' : 'Export PDF'}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};
