import React from 'react';
import { SectionExportActions } from './DashboardShared';

// Academic Head dashboard pieces. The shared Dashboard renders the common parts (approvals, upcoming
// events, Filter by Date, Reservation activity); everything Academic Head-specific lives here.

export const isAcademicHeadRole = (role) => (
  String(role || '').toLowerCase().trim().replace(/_/g, ' ') === 'academic head'
);

// "Export dashboard PDF" for the Academic Head: choose which sections go in the PDF.
export const AcademicHeadExportActions = (props) => (
  <SectionExportActions
    {...props}
    sections={[
      { key: 'activity', label: 'Reservation activity' },
      { key: 'matched', label: 'Matched reservations' }
    ]}
  />
);

// Academic Head's analytics below Reservation activity: only Matched reservations, full width.
// (No equipment, utility, or facility rankings and no recent-approval lists.)
export const AcademicHeadDashboardInsights = ({ matchedReservations }) => (
  <section className="matched-only-insights" aria-label="Academic Head filtered analytics">
    {matchedReservations}
  </section>
);
