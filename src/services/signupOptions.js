export const DEFAULT_COURSE_OPTIONS = [
  {
    group: 'Senior High School',
    options: [
      { value: 'STEM', label: 'STEM - Science Technology Engineering Math' },
      { value: 'HUMSS', label: 'HUMSS - Humanities Social Sciences' },
      { value: 'ABM', label: 'ABM - Accountancy Business Management' },
      { value: 'TVL-ICT', label: 'TVL - Information Communications Technology' },
      { value: 'TVL-HE', label: 'TVL - Home Economics' },
      { value: 'TVL-IA', label: 'TVL - Industrial Arts' }
    ]
  },
  {
    group: 'College',
    options: [
      { value: 'BSIT', label: 'BSIT - Bachelor of Science in Information Technology' },
      { value: 'BSCS', label: 'BSCS - Bachelor of Science in Computer Science' },
      { value: 'BSBA', label: 'BSBA - Bachelor of Science in Business Administration' },
      { value: 'BSA', label: 'BSA - Bachelor of Science in Accountancy' },
      { value: 'BACOMM', label: 'BACOMM - Bachelor of Arts in Communication' },
      { value: 'BSEDUC', label: 'BSEDUC - Bachelor of Elementary Education' },
      { value: 'BSHM', label: 'BSHM - Hospitality Management' },
      { value: 'BSTM', label: 'BSTM - Tourism Management' }
    ]
  }
];

export const DEFAULT_DEPARTMENT_OPTIONS = [
  {
    group: 'Academic Departments',
    options: [
      { value: 'SHS Department', label: 'Senior High School (SHS) Department' },
      { value: 'College Department', label: 'College Department' }
    ]
  },
  {
    group: 'Offices & Administration',
    options: [
      { value: 'MIS', label: 'Management Information System (MIS)' },
      { value: 'Registrar', label: "Registrar's Office" },
      { value: 'Cashier', label: 'Cashier' },
      { value: 'Student Affairs', label: 'Office of Student Affairs' },
      { value: 'Guidance', label: 'Guidance Office' },
      { value: 'HR', label: 'Human Resources' },
      { value: 'General Services', label: 'General Services / Building Admin' },
      { value: 'Other', label: 'Other' }
    ]
  }
];

export const DEFAULT_SIGNUP_DROPDOWNS = [
  { value: 'courses', label: 'Course / Program' },
  { value: 'departments', label: 'Department / Office' }
];

export const SIGNUP_TEXT_CHARACTER_TYPES = [
  { value: 'all', label: 'All' },
  { value: 'text', label: 'Text Only' },
  { value: 'number', label: 'Number Only' },
  { value: 'symbols', label: 'Symbols Only' }
];

export const normalizeSignupTextCharacterTypes = (types) => {
  const validTypes = new Set(SIGNUP_TEXT_CHARACTER_TYPES.map(({ value }) => value));
  const selectedTypes = Array.isArray(types)
    ? types.filter((type) => validTypes.has(type))
    : [];
  if (!selectedTypes.length || selectedTypes.includes('all')) return ['all'];
  return [...new Set(selectedTypes)];
};

export const filterSignupTextValue = (value, characterTypes) => {
  const selectedTypes = normalizeSignupTextCharacterTypes(characterTypes);
  if (selectedTypes.includes('all')) return value;

  return Array.from(value).filter((character) => (
    (selectedTypes.includes('text') && /[\p{L} ]/u.test(character))
    || (selectedTypes.includes('number') && /[0-9]/.test(character))
    || (selectedTypes.includes('symbols') && /[\p{P}\p{S}]/u.test(character))
  )).join('');
};

export const normalizeSignupDropdowns = (dropdowns, accountTypes = []) => {
  const normalizedDropdowns = (Array.isArray(dropdowns) ? dropdowns : DEFAULT_SIGNUP_DROPDOWNS)
    .map((dropdown) => ({
      ...dropdown,
      editableOnProfile: dropdown.editableOnProfile !== false
    }));

  accountTypes.forEach((accountType) => {
    if (accountType.dropdown && !normalizedDropdowns.some((dropdown) => dropdown.value === accountType.dropdown)) {
      normalizedDropdowns.push({
        value: accountType.dropdown,
        label: accountType.dropdown,
        editableOnProfile: true
      });
    }
  });

  return normalizedDropdowns;
};

export const getSignupDropdownOptions = (
  dropdown,
  courses = DEFAULT_COURSE_OPTIONS,
  departments = DEFAULT_DEPARTMENT_OPTIONS
) => {
  const groups = dropdown === 'courses'
    ? courses
    : dropdown === 'departments' ? departments : [];

  return groups.flatMap((group) => group.options.map((option) => ({
    ...option,
    group: group.group
  })));
};

export const normalizeAccountTypes = (
  accountTypes,
  courses = DEFAULT_COURSE_OPTIONS,
  departments = DEFAULT_DEPARTMENT_OPTIONS
) => accountTypes.map((accountType) => ({
  ...accountType,
  role: ['faculty', 'endorser'].includes(String(accountType.role || '').toLowerCase())
    || (!accountType.role && accountType.value === 'Faculty')
    ? 'faculty'
    : 'requestor',
  options: Array.isArray(accountType.options)
    ? accountType.options.map((option) => ({ ...option }))
    : getSignupDropdownOptions(accountType.dropdown, courses, departments),
  customFields: Array.isArray(accountType.customFields)
    ? accountType.customFields.map((field) => ({
      ...field,
      type: field.type || 'text',
      editableOnProfile: field.editableOnProfile !== false,
      characterTypes: normalizeSignupTextCharacterTypes(field.characterTypes)
    }))
    : []
}));

export const DEFAULT_ACCOUNT_TYPES = normalizeAccountTypes([
  { value: 'Student', label: 'Student', dropdown: 'courses', role: 'requestor' },
  { value: 'Student Leader', label: 'Student Leader', dropdown: 'courses', role: 'requestor' },
  { value: 'Admin Staff', label: 'Admin Staff', dropdown: 'departments', role: 'requestor' },
  { value: 'Faculty', label: 'Faculty', dropdown: 'departments', role: 'faculty' }
]);

export const getSignupConfiguration = (data = {}) => {
  const courses = Array.isArray(data.courses) ? data.courses : DEFAULT_COURSE_OPTIONS;
  const departments = Array.isArray(data.departments) ? data.departments : DEFAULT_DEPARTMENT_OPTIONS;
  const accountTypes = normalizeAccountTypes(
    Array.isArray(data.accountTypes) ? data.accountTypes : DEFAULT_ACCOUNT_TYPES,
    courses,
    departments
  );
  return {
    accountTypes,
    dropdownTypes: normalizeSignupDropdowns(data.dropdownTypes, accountTypes)
  };
};

export const getReservationDynamicAttributes = (reservation, person, configuration) => {
  const isEndorser = person === 'endorser';
  const accountTypeValue = isEndorser
    ? reservation.endorserAccountType
    : reservation.requestorTypes?.[0];
  const accountType = configuration.accountTypes.find(({ value }) => value === accountTypeValue);
  if (!accountType) return [];

  const attributes = isEndorser
    ? reservation.endorserAttributes || {}
    : reservation.requestorAttributes || {};
  const entries = [];

  if (accountType.dropdown) {
    const key = `dropdown:${accountType.dropdown}`;
    const rawValue = attributes[key]
      ?? (reservation.signupDropdown?.id === accountType.dropdown
        ? reservation.signupDropdown.value
        : accountType.dropdown === 'courses'
          ? reservation.course || ''
          : accountType.dropdown === 'departments'
            ? reservation.department || ''
            : '');
    if (rawValue) {
      const option = (accountType.options || []).find(({ value }) => value === rawValue);
      const dropdown = configuration.dropdownTypes.find(({ value }) => value === accountType.dropdown);
      entries.push({
        key,
        label: dropdown?.label || accountType.dropdown,
        value: option?.label || rawValue
      });
    }
  }

  (accountType.customFields || []).forEach((field) => {
    const value = attributes[`field:${field.id}`];
    if (value !== undefined && value !== null && String(value).trim()) {
      entries.push({
        key: `field:${field.id}`,
        label: field.label,
        value: String(value)
      });
    }
  });

  if (!isEndorser
    && accountType.dropdown === 'courses'
    && reservation.studentNumber
    && String(reservation.studentNumber).trim()) {
    entries.push({
      key: 'studentNumber',
      label: 'Student Number',
      value: String(reservation.studentNumber)
    });
  }

  return entries;
};
