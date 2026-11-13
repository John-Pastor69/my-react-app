import React from 'react';

export const RankingModeToggle = ({ label, value, onChange }) => (
  <div className="ranking-mode-toggle" role="group" aria-label={`${label} ranking`}>
    <button type="button" aria-pressed={value === 'most'} onClick={() => onChange('most')}>Most</button>
    <button type="button" aria-pressed={value === 'least'} onClick={() => onChange('least')}>Least</button>
  </div>
);
