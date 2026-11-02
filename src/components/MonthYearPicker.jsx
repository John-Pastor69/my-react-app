import React from 'react';

const MONTH_NAMES = Array.from({ length: 12 }, (_, month) => (
  new Date(2000, month, 1).toLocaleString('default', { month: 'long' })
));

const MonthYearPicker = ({ date, onChange }) => {
  const year = date.getFullYear();
  const firstYear = Math.min(1950, year - 20);
  const lastYear = Math.max(new Date().getFullYear() + 20, year + 20);

  return (
    <details className="month-year-picker">
      <summary aria-label={`Choose month and year, currently ${date.toLocaleString('default', { month: 'long', year: 'numeric' })}`}>
        {date.toLocaleString('default', { month: 'long', year: 'numeric' })}
      </summary>
      <div className="month-year-picker-menu">
        <div>
          <span>Month</span>
          <select
            aria-label="Choose month"
            value={date.getMonth()}
            onChange={(event) => onChange(new Date(year, Number(event.target.value), 1))}
          >
            {MONTH_NAMES.map((month, index) => (
              <option key={month} value={index}>{month}</option>
            ))}
          </select>
        </div>
        <div>
          <span>Year</span>
          <select
            aria-label="Choose year"
            value={year}
            onChange={(event) => onChange(new Date(Number(event.target.value), date.getMonth(), 1))}
          >
            {Array.from({ length: lastYear - firstYear + 1 }, (_, index) => firstYear + index)
              .map((optionYear) => <option key={optionYear} value={optionYear}>{optionYear}</option>)}
          </select>
        </div>
      </div>
    </details>
  );
};

export default MonthYearPicker;
