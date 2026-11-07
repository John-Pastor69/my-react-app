import { getAirconScheduleDetails } from '../services/airconSchedule';
import './AirconScheduleDisplay.scss';

const AirconScheduleDisplay = ({ reservation, facilities }) => {
  const { enabled, groups } = getAirconScheduleDetails(reservation, facilities);

  return (
    <div className="aircon-schedule-display">
      <span className={`aircon-schedule-display__status ${enabled ? 'is-on' : 'is-off'}`}>
        {enabled ? 'ON' : 'OFF'}
      </span>
      {groups.map((group, groupIndex) => (
        <section className="aircon-schedule-display__group" key={`${group.name}-${groupIndex}`}>
          {group.name && <h4>{group.name}</h4>}
          <ul>
            {group.entries.map((entry, entryIndex) => (
              <li
                className={`aircon-schedule-display__entry ${entry.enabled ? 'is-on' : 'is-off'}`}
                key={`${entry.date}-${entryIndex}`}
              >
                {entry.date && <span className="aircon-schedule-display__date">{entry.date}</span>}
                <span className={`aircon-schedule-display__state ${entry.enabled ? 'is-on' : 'is-off'}`}>
                  {entry.enabled ? 'ON' : 'OFF'}
                </span>
                {entry.enabled && entry.time && (
                  <span className="aircon-schedule-display__time">{entry.time}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
};

export default AirconScheduleDisplay;
