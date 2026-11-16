import React from 'react';
import { SectionExportActions } from './DashboardShared';

// OSA (Office of Student Affairs) dashboard pieces. The shared Dashboard renders the common parts
// (approvals, upcoming events, Filter by Date, Reservation activity); everything OSA-specific lives here.

export const isOsaRole = (role) => (
  String(role || '').toLowerCase().trim().replace(/_/g, ' ') === 'osa'
);

// "Export dashboard PDF" for OSA: choose Reservation activity and/or Matched reservations.
export const OsaExportActions = (props) => (
  <SectionExportActions
    {...props}
    sections={[
      { key: 'activity', label: 'Reservation activity' },
      { key: 'matched', label: 'Matched reservations' }
    ]}
  />
);

// OSA's analytics below Reservation activity: only Matched reservations, full width.
// (No equipment, utility, or facility rankings and no recent-approval lists.)
export const OsaDashboardInsights = ({ matchedReservations }) => (
  <section className="osa-dashboard-insights" aria-label="OSA filtered analytics">
    {matchedReservations}
  </section>
);
