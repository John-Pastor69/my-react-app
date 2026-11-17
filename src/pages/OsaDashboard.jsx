import React from 'react';
import { SectionExportActions } from './DashboardShared';
import { MisDashboardResourceConsumption } from './MisDashboard';

// OSA (Office of Student Affairs) dashboard pieces. The shared Dashboard renders the common parts
// (approvals, upcoming events, Filter by Date, Reservation activity); everything OSA-specific lives here.

export const isOsaRole = (role) => (
  String(role || '').toLowerCase().trim().replace(/_/g, ' ') === 'osa'
);

const formatReservations = (count) => `${count} reservation${count === 1 ? '' : 's'}`;

// Wording for the requestor-group chart when it counts facility and room reservations.
const FACILITY_CONSUMPTION_LABELS = {
  title: 'Facility Reservations by Program',
  formatCount: formatReservations,
  totalSuffix: 'facility and room reservations',
  pieDescription: 'with a facility or specific room',
  viewItems: 'View facilities',
  itemsListLabel: 'facilities and rooms',
  emptyMessage: 'No approved facility or room reservations by programs or courses match the selected filters.',
  allTitle: 'All Programs',
  allSubtitle: 'Approved facility and room reservations by program or course, most first.',
  dialogId: 'osa-facility-consumption-all-title'
};

// "Export dashboard PDF" for OSA: choose which sections go in the PDF.
export const OsaExportActions = (props) => (
  <SectionExportActions
    {...props}
    sections={[
      { key: 'activity', label: 'Reservation activity' },
      { key: 'facilityConsumption', label: 'Facility Reservations by Program' },
      { key: 'matched', label: 'Matched reservations' }
    ]}
  />
);

// OSA's analytics below Reservation activity: which programs/courses reserve facilities and rooms the
// most (top 3, with View All), then Matched reservations.
export const OsaDashboardInsights = ({ facilityConsumptionChart, matchedReservations }) => (
  <section className="osa-dashboard-insights" aria-label="OSA filtered analytics">
    {facilityConsumptionChart && (
      <MisDashboardResourceConsumption
        chart={facilityConsumptionChart}
        labels={FACILITY_CONSUMPTION_LABELS}
      />
    )}
    {matchedReservations}
  </section>
);
