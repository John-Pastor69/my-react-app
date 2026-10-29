import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, updateDoc, deleteDoc, setDoc } from 'firebase/firestore';
import { Link } from 'react-router-dom';
import { db, auth } from '../../Firebase';
import {
  DEFAULT_ACCOUNT_TYPES,
  DEFAULT_COURSE_OPTIONS,
  DEFAULT_DEPARTMENT_OPTIONS,
  DEFAULT_SIGNUP_DROPDOWNS,
  normalizeSignupTextCharacterTypes,
  SIGNUP_TEXT_CHARACTER_TYPES,
  normalizeAccountTypes,
  normalizeSignupDropdowns
} from '../../services/signupOptions';
import "../../styles/mis/MisUserManagement.scss";
  
const ROLE_OPTIONS = [
  { value: 'mis', label: 'MIS' },
  { value: 'building admin', label: 'Building Admin' },
  { value: 'school admin', label: 'School Admin' },
  { value: 'room checker', label: 'Room Checker' },
  { value: 'academic head', label: 'Academic Head' },
  { value: 'endorser', label: 'Endorser' },
  { value: 'osa', label: 'OSA' },
  { value: 'requestor', label: 'Requestor' }
];

const ROLE_LABELS = {
  'mis': 'MIS',
  'mis admin': 'MIS',
  'building admin': 'Building Admin',
  'school admin': 'School Admin',
  'room checker': 'Room Checker',
  'academic head': 'Academic Head',
  'endorser': 'Endorser',
  'osa': 'OSA',
  'requestor': 'Requestor',
  'user': 'Requestor'
};

const ADMIN_ROLES = ['mis', 'mis admin'];
const SIGNUP_FIELD_TYPES = ['text', 'number', 'email', 'tel'];

const isValidCustomFieldLimit = (value, type) => {
  if (value === '' || value === undefined || value === null) return true;
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue)
    && (type !== 'text' || (Number.isInteger(parsedValue) && parsedValue >= 0));
};

const hasInvalidCustomFieldLimits = (field) => {
  if (!['text', 'number'].includes(field.type)) return false;
  if (!isValidCustomFieldLimit(field.min, field.type) || !isValidCustomFieldLimit(field.max, field.type)) return true;
  if (field.min === '' || field.min === undefined || field.max === '' || field.max === undefined) return false;
  return Number(field.min) > Number(field.max);
};

const formatRole = (role) => {
  if (!role) return 'Requestor';
  const cleanKey = role.toLowerCase().trim().replace(/_/g, ' ');
  if (ROLE_LABELS[cleanKey]) return ROLE_LABELS[cleanKey];
  return cleanKey;
};

const roleBadgeClass = (role) => {
  const cleanRole = (role || '').toLowerCase();
  if (cleanRole === 'mis' || cleanRole.includes('admin')) return 'role-admin';
  if (!cleanRole || cleanRole === 'requestor' || cleanRole === 'user') return 'role-requestor';
  return 'role-approver';
};

// --- DYNAMIC HEARTBEAT STATUS CHECKER ---
const getDynamicStatus = (user) => {
  const storedStatus = (user.status || '').toLowerCase().trim();
  if (storedStatus === 'blocked') return 'Blocked';
  if (storedStatus === 'offline' || storedStatus === 'inactive') return 'Offline';
  if (!user.lastActive) return 'Offline';
  
  let lastActiveDate;
  if (typeof user.lastActive.toDate === 'function') {
    lastActiveDate = user.lastActive.toDate();
  } else {
    lastActiveDate = new Date(user.lastActive);
  }

  const now = new Date();
  const diffInMs = now - lastActiveDate;
  const twoMinutesInMs = 2 * 60 * 1000;

  if (diffInMs < twoMinutesInMs) {
    return 'Online';
  }
  return 'Offline';
};

const formatTimeCreated = (value) => {
  if (!value) return '—';
  const date = typeof value?.toDate === 'function' ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
};

const getCreatedDate = (user) => {
  const value = user.timeCreated || user.createdAt;
  if (!value) return null;
  const date = typeof value?.toDate === 'function' ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const MisUserManagement = ({ currentUserRole }) => {
  const [usersData, setUsersData] = useState([]);
  const [searchQuery, setSearchQuery] = useState(''); // Added search state
  const [userFilter, setUserFilter] = useState('all');
  const [unverifiedAgeFilter, setUnverifiedAgeFilter] = useState('all');
  const [unverifiedFilterNow, setUnverifiedFilterNow] = useState(() => Date.now());
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [deletingUserId, setDeletingUserId] = useState(null);
  const [accountTypes, setAccountTypes] = useState(() => normalizeAccountTypes(DEFAULT_ACCOUNT_TYPES));
  const [signupDropdowns, setSignupDropdowns] = useState(() => DEFAULT_SIGNUP_DROPDOWNS.map((dropdown) => ({ ...dropdown })));
  const [newSignupDropdown, setNewSignupDropdown] = useState('');
  const [newAccountType, setNewAccountType] = useState({ value: '', label: '', dropdown: '' });
  const [newAccountTypeOptions, setNewAccountTypeOptions] = useState({});
  const [newAccountTypeFields, setNewAccountTypeFields] = useState({});
  const [isSavingSignupOptions, setIsSavingSignupOptions] = useState(false);
  const [signupOptionsError, setSignupOptionsError] = useState('');
  const [signupOptionsSuccess, setSignupOptionsSuccess] = useState('');

  const [roleModalUser, setRoleModalUser] = useState(null);
  const [selectedRole, setSelectedRole] = useState('requestor');
  const [isUpdatingRole, setIsUpdatingRole] = useState(false);
  const [updatingBlockUserId, setUpdatingBlockUserId] = useState(null);

  const [currentUser, setCurrentUser] = useState(null);
  const normalizedCurrentUserRole = (currentUserRole || '').toLowerCase().trim().replace(/_/g, ' ');
  const isSuperAdmin = normalizedCurrentUserRole === 'super admin';

  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged((user) => setCurrentUser(user));
    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    if (!isSuperAdmin) return undefined;

    return onSnapshot(
      doc(db, 'app_settings', 'signupOptions'),
      (snapshot) => {
        const data = snapshot.data() || {};
        const nextAccountTypes = Array.isArray(data.accountTypes) ? data.accountTypes : DEFAULT_ACCOUNT_TYPES;
        const nextCourses = Array.isArray(data.courses) ? data.courses : DEFAULT_COURSE_OPTIONS;
        const nextDepartments = Array.isArray(data.departments) ? data.departments : DEFAULT_DEPARTMENT_OPTIONS;
        setSignupDropdowns(normalizeSignupDropdowns(data.dropdownTypes, nextAccountTypes));
        setAccountTypes(normalizeAccountTypes(nextAccountTypes, nextCourses, nextDepartments));
        setSignupOptionsError('');
        setSignupOptionsSuccess('');
      },
      (error) => {
        console.error('Failed to load signup options:', error);
        setSignupOptionsError('Could not load signup options. Check Firestore access and try again.');
      }
    );
  }, [isSuperAdmin]);

  useEffect(() => {
    if (!currentUser) return; // Added safeguard

    const unsubscribe = onSnapshot(
      collection(db, 'users'),
      (snapshot) => {
        const list = snapshot.docs
          .map((d) => {
            const data = d.data();
            if ((data.role || '').toLowerCase().trim().replace(/_/g, ' ') === 'super admin') {
              return null;
            }
            let rawName = (data.name || '').trim();
            let title = '';

            // 1. Detect title robustly (case-insensitive) and extract it
            if (/faculty/i.test(rawName)) {
              title = '(Faculty)';
              rawName = rawName.replace(/\(?faculty\)?/gi, ''); // Removes the word and optional parentheses
            } else if (/student/i.test(rawName)) {
              title = '(Student)';
              rawName = rawName.replace(/\(?student\)?/gi, '');
            }

            // 2. Clean up any trailing commas or stray punctuation left behind
            rawName = rawName.replace(/,\s*$/, '').replace(/,\s*,/g, ',').trim();

            // 3. Reverse "Last, First" if a comma still exists
            if (rawName.includes(',')) {
              const parts = rawName.split(',');
              const lastName = parts[0].trim();
              // Join the rest safely in case there were multiple commas
              const firstNames = parts.slice(1).join(' ').trim();
              rawName = `${firstNames} ${lastName}`;
            }

            // 4. Combine name and title, collapsing any accidental double spaces
            let finalName = title ? `${rawName} ${title}` : rawName;
            finalName = finalName.replace(/\s+/g, ' ').trim();

            return { id: d.id, ...data, name: finalName };
          })
          .filter(Boolean)
          .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

        setUsersData(list);
        setLoadError('');
        setIsLoading(false);
      },
      (error) => {
        console.error('Failed to load users:', error);
        setLoadError(
          error.code === 'permission-denied'
            ? 'You do not have permission to view users. Check your Firestore rules.'
            : 'Could not load users. Please try again.'
        );
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [currentUser]);

  const handleOpenRoleModal = (user) => {
    setRoleModalUser(user);
    
    let currentRole = user.role ? user.role.replace(/_/g, ' ').toLowerCase().trim() : 'requestor';
    
    if (currentRole.includes('mis')) {
      currentRole = 'mis';
    } else if (currentRole === 'user') {
      currentRole = 'requestor';
    }

    setSelectedRole(currentRole);
  };

  const handleSaveRole = async () => {
    if (!roleModalUser) return;

    try {
      setIsUpdatingRole(true);
      setActionError('');

      let roleToSave = selectedRole.toLowerCase().trim();
      if (roleToSave === 'mis admin' || roleToSave.includes('mis')) {
        roleToSave = 'mis';
      }

      await updateDoc(doc(db, 'users', roleModalUser.id), {
        role: roleToSave
      });

      setRoleModalUser(null);
    } catch (error) {
      console.error('Failed to update role:', error);
      setActionError('Could not update the user role.');
    } finally {
      setIsUpdatingRole(false);
    }
  };

  const handleToggleBlock = async (user) => {
    if (user.id === currentUser?.uid) {
      setActionError('You cannot block your own account.');
      return;
    }

    const isBlocked = (user.status || '').toLowerCase().trim() === 'blocked';
    const action = isBlocked ? 'unblock' : 'block';
    const confirmation = isBlocked
      ? `Unblock ${user.name || user.email}? They will be able to sign in again.`
      : `Block ${user.name || user.email}? They will not be able to sign in until an administrator unblocks the account.`;

    if (!window.confirm(confirmation)) return;

    try {
      setUpdatingBlockUserId(user.id);
      setActionError('');
      await updateDoc(doc(db, 'users', user.id), {
        status: isBlocked ? 'Offline' : 'Blocked'
      });
    } catch (error) {
      console.error(`Failed to ${action} user account:`, error);
      setActionError(`Could not ${action} this user account. Please try again.`);
    } finally {
      setUpdatingBlockUserId(null);
    }
  };

  const handleDeleteUnverifiedUser = async (user) => {
    if (!isSuperAdmin || user.emailVerified !== false) return;

    const confirmed = window.confirm(
      `Delete the Firestore profile for ${user.name || user.email || 'this user'}? This does not delete their Firebase Authentication account.`
    );
    if (!confirmed) return;

    try {
      setDeletingUserId(user.id);
      setActionError('');
      await deleteDoc(doc(db, 'users', user.id));
    } catch (error) {
      console.error('Failed to delete unverified user profile:', error);
      setActionError('Could not delete this user profile. Please try again.');
    } finally {
      setDeletingUserId(null);
    }
  };

  const handleUpdateAccountTypeOption = (accountTypeIndex, optionIndex, field, value) => {
    setSignupOptionsSuccess('');
    setAccountTypes((current) => current.map((accountType, currentAccountTypeIndex) => (
      currentAccountTypeIndex === accountTypeIndex
        ? {
          ...accountType,
          options: accountType.options.map((option, currentOptionIndex) => (
            currentOptionIndex === optionIndex ? { ...option, [field]: value } : option
          ))
        }
        : accountType
    )));
  };

  const handleAddAccountTypeOption = (accountTypeIndex) => {
    const value = (newAccountTypeOptions[accountTypeIndex] || '').trim();
    if (!value) return;
    const accountType = accountTypes[accountTypeIndex];
    if (accountType.options.some((option) => option.value.trim().toLowerCase() === value.toLowerCase())) {
      setSignupOptionsError('Dropdown values must be unique within each account type.');
      return;
    }

    setAccountTypes((current) => current.map((item, index) => (
      index === accountTypeIndex
        ? { ...item, options: [...item.options, { value, label: value }] }
        : item
    )));
    setNewAccountTypeOptions((current) => ({ ...current, [accountTypeIndex]: '' }));
    setSignupOptionsError('');
    setSignupOptionsSuccess('');
  };

  const handleRemoveAccountTypeOption = (accountTypeIndex, optionIndex) => {
    setSignupOptionsSuccess('');
    setAccountTypes((current) => current.map((accountType, currentAccountTypeIndex) => (
      currentAccountTypeIndex === accountTypeIndex
        ? { ...accountType, options: accountType.options.filter((_, index) => index !== optionIndex) }
        : accountType
    )));
  };

  const handleUpdateAccountTypeField = (accountTypeIndex, fieldIndex, field, value) => {
    setSignupOptionsSuccess('');
    setAccountTypes((current) => current.map((accountType, currentAccountTypeIndex) => (
      currentAccountTypeIndex === accountTypeIndex
        ? {
          ...accountType,
          customFields: accountType.customFields.map((customField, currentFieldIndex) => (
            currentFieldIndex === fieldIndex ? { ...customField, [field]: value } : customField
          ))
        }
        : accountType
    )));
  };

  const handleUpdateAccountTypeFieldCharacterType = (accountTypeIndex, fieldIndex, characterType, checked) => {
    const accountType = accountTypes[accountTypeIndex];
    const field = accountType.customFields[fieldIndex];
    const selectedTypes = normalizeSignupTextCharacterTypes(field.characterTypes);
    const nextTypes = characterType === 'all'
      ? ['all']
      : [
        ...selectedTypes.filter((type) => type !== 'all' && (type !== characterType || checked)),
        ...(checked && !selectedTypes.includes(characterType) ? [characterType] : [])
      ];

    handleUpdateAccountTypeField(
      accountTypeIndex,
      fieldIndex,
      'characterTypes',
      normalizeSignupTextCharacterTypes(nextTypes)
    );
  };

  const handleAddAccountTypeField = (accountTypeIndex) => {
    const draft = newAccountTypeFields[accountTypeIndex] || { label: '', type: 'text', min: '', max: '' };
    const label = draft.label.trim();
    if (!label) return;
    if (hasInvalidCustomFieldLimits(draft)) {
      setSignupOptionsError('Set valid minimum and maximum values. The minimum cannot exceed the maximum.');
      return;
    }

    const accountType = accountTypes[accountTypeIndex];
    if (accountType.customFields.some((field) => field.label.trim().toLowerCase() === label.toLowerCase())) {
      setSignupOptionsError('Custom input field names must be unique within each account type.');
      return;
    }

    const idBase = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'custom-field';
    const existingIds = new Set(accountType.customFields.map((field) => field.id));
    let id = idBase;
    let suffix = 2;
    while (existingIds.has(id)) {
      id = `${idBase}-${suffix}`;
      suffix += 1;
    }

    setAccountTypes((current) => current.map((item, index) => (
      index === accountTypeIndex
        ? {
          ...item,
          customFields: [...item.customFields, {
            id,
            label,
            type: draft.type || 'text',
            editableOnProfile: true,
            characterTypes: ['all'],
            ...(draft.min !== '' ? { min: draft.min } : {}),
            ...(draft.max !== '' ? { max: draft.max } : {})
          }]
        }
        : item
    )));
    setNewAccountTypeFields((current) => ({
      ...current,
      [accountTypeIndex]: { label: '', type: 'text', min: '', max: '' }
    }));
    setSignupOptionsError('');
    setSignupOptionsSuccess('');
  };

  const handleRemoveAccountTypeField = (accountTypeIndex, fieldIndex) => {
    setSignupOptionsSuccess('');
    setAccountTypes((current) => current.map((accountType, currentAccountTypeIndex) => (
      currentAccountTypeIndex === accountTypeIndex
        ? { ...accountType, customFields: accountType.customFields.filter((_, index) => index !== fieldIndex) }
        : accountType
    )));
  };

  const handleUpdateAccountType = (index, field, value) => {
    setSignupOptionsSuccess('');
    setAccountTypes((current) => current.map((accountType, accountTypeIndex) => (
      accountTypeIndex === index ? { ...accountType, [field]: value } : accountType
    )));
  };

  const handleUpdateSignupDropdown = (index, field, value) => {
    setSignupOptionsSuccess('');
    setSignupDropdowns((current) => current.map((dropdown, dropdownIndex) => (
      dropdownIndex === index ? { ...dropdown, [field]: value } : dropdown
    )));
  };

  const handleAddSignupDropdown = () => {
    const label = newSignupDropdown.trim();
    if (!label) return;
    if (signupDropdowns.some((dropdown) => dropdown.label.trim().toLowerCase() === label.toLowerCase())) {
      setSignupOptionsError('Signup dropdown names must be unique.');
      return;
    }

    const valueBase = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'dropdown';
    const existingValues = new Set(signupDropdowns.map((dropdown) => dropdown.value));
    let value = valueBase;
    let suffix = 2;
    while (existingValues.has(value)) {
      value = `${valueBase}-${suffix}`;
      suffix += 1;
    }

    setSignupDropdowns((current) => [...current, { value, label, editableOnProfile: true }]);
    setNewSignupDropdown('');
    setSignupOptionsError('');
    setSignupOptionsSuccess('');
  };

  const handleRemoveSignupDropdown = (dropdown) => {
    const assignedTypes = accountTypes.filter((accountType) => accountType.dropdown === dropdown.value);
    if (assignedTypes.length > 0 && !window.confirm(
      `Remove "${dropdown.label}"? It will also remove this dropdown and its values from ${assignedTypes.length} account type${assignedTypes.length === 1 ? '' : 's'}.`
    )) return;

    setSignupDropdowns((current) => current.filter((item) => item.value !== dropdown.value));
    setAccountTypes((current) => current.map((accountType) => (
      accountType.dropdown === dropdown.value
        ? { ...accountType, dropdown: '' }
        : accountType
    )));
    setNewAccountType((current) => (
      current.dropdown === dropdown.value ? { ...current, dropdown: '' } : current
    ));
    setSignupOptionsSuccess('');
  };

  const handleAddAccountType = () => {
    const value = newAccountType.value.trim();
    const label = newAccountType.label.trim();
    if (!value || !label) {
      setSignupOptionsError('Each account type needs both a value and a display name.');
      return;
    }
    if (accountTypes.some((accountType) => accountType.value.trim().toLowerCase() === value.toLowerCase())) {
      setSignupOptionsError('Account type values must be unique.');
      return;
    }
    const dropdownOptions = newAccountType.dropdown
      ? accountTypes.find((accountType) => accountType.dropdown === newAccountType.dropdown)?.options || []
      : [];

    setAccountTypes((current) => [...current, {
      value,
      label,
      dropdown: newAccountType.dropdown,
      role: 'requestor',
      options: dropdownOptions.map((option) => ({ ...option })),
      customFields: []
    }]);
    setNewAccountType({ value: '', label: '', dropdown: '' });
    setSignupOptionsError('');
    setSignupOptionsSuccess('');
  };

  const handleSaveSignupOptions = async () => {
    const dropdownValues = signupDropdowns.map((dropdown) => dropdown.value.trim().toLowerCase());
    const dropdownLabels = signupDropdowns.map((dropdown) => dropdown.label.trim().toLowerCase());
    const hasInvalidDropdowns = signupDropdowns.some((dropdown) => (
      !dropdown.value.trim() || !dropdown.label.trim()
    )) || new Set(dropdownValues).size !== dropdownValues.length
      || new Set(dropdownLabels).size !== dropdownLabels.length;
    const accountTypeValues = accountTypes.map((accountType) => accountType.value.trim().toLowerCase());
    const hasInvalidAccountTypes = accountTypes.some((accountType) => (
      !accountType.value.trim()
      || !accountType.label.trim()
      || !['', ...signupDropdowns.map((dropdown) => dropdown.value)].includes(accountType.dropdown || '')
    )) || new Set(accountTypeValues).size !== accountTypeValues.length;
    const hasInvalidDropdownOptions = accountTypes.some((accountType) => {
      if (!accountType.dropdown) return false;
      const optionValues = accountType.options.map((option) => option.value.trim().toLowerCase());
      return (accountType.dropdown && accountType.options.length === 0)
        || accountType.options.some((option) => !option.value.trim() || !option.label.trim())
        || new Set(optionValues).size !== optionValues.length;
    });
    const hasInvalidCustomFields = accountTypes.some((accountType) => {
      const fieldIds = accountType.customFields.map((field) => field.id.trim().toLowerCase());
      const fieldLabels = accountType.customFields.map((field) => field.label.trim().toLowerCase());
      return accountType.customFields.some((field) => (
        !field.id.trim() || !field.label.trim() || !SIGNUP_FIELD_TYPES.includes(field.type)
      ) || hasInvalidCustomFieldLimits(field)) || new Set(fieldIds).size !== fieldIds.length
        || new Set(fieldLabels).size !== fieldLabels.length;
    });
    if (hasInvalidDropdowns) {
      setSignupOptionsError('Each signup dropdown needs a unique value and display name.');
      return;
    }
    if (hasInvalidAccountTypes) {
      setSignupOptionsError('Each account type needs a unique value, display name, and valid dropdown selection.');
      return;
    }
    if (hasInvalidDropdownOptions) {
      setSignupOptionsError('Each signup dropdown needs at least one value, and its values need unique values and display names.');
      return;
    }
    if (hasInvalidCustomFields) {
      setSignupOptionsError('Optional input fields need unique names, valid types, and valid min/max limits.');
      return;
    }

    try {
      setIsSavingSignupOptions(true);
      setSignupOptionsError('');
      setSignupOptionsSuccess('');
      await setDoc(doc(db, 'app_settings', 'signupOptions'), {
        accountTypes,
        dropdownTypes: signupDropdowns
      }, { merge: true });
      setSignupOptionsSuccess('Successfully changed.');
    } catch (error) {
      console.error('Failed to save signup options:', error);
      setSignupOptionsError('Could not save signup options. Please try again.');
    } finally {
      setIsSavingSignupOptions(false);
    }
  };

  // Filter users based on search query
  const filteredUsers = usersData.filter((user) => {
    if (isSuperAdmin && userFilter === 'unverified' && user.emailVerified !== false) return false;
    if (isSuperAdmin && userFilter === 'unverified' && unverifiedAgeFilter !== 'all') {
      const createdDate = getCreatedDate(user);
      const minimumAgeMs = Number(unverifiedAgeFilter) * 24 * 60 * 60 * 1000;
      if (!createdDate || unverifiedFilterNow - createdDate.getTime() < minimumAgeMs) return false;
    }

    const query = searchQuery.toLowerCase();
    return (
      (user.name && user.name.toLowerCase().includes(query)) ||
      (user.email && user.email.toLowerCase().includes(query)) ||
      (user.role && user.role.toLowerCase().includes(query)) ||
      (user.department && user.department.toLowerCase().includes(query)) ||
      (user.course && user.course.toLowerCase().includes(query))
    );
  });

  const totalUsers = usersData.length;
  const activeUsers = usersData.filter((u) => getDynamicStatus(u) === 'Online').length;
  const totalAdmins = usersData.filter((u) => ADMIN_ROLES.includes(u.role?.toLowerCase().trim())).length;

  // --- ROLE ACCESS CHECK ---
  const allowedRoles = ['mis', 'mis admin', 'building admin', 'super admin'];
  if (!normalizedCurrentUserRole || !allowedRoles.includes(normalizedCurrentUserRole)) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#64748B' }}>
        <h2>Access Denied</h2>
        <p>You do not have permission to view this page.</p>
      </div>
    );
  }

  const renderAccountTypes = () => (
    <>
      <div className="signup-account-type-list">
        {accountTypes.map((accountType, index) => (
          <div className="signup-account-type-editor" key={`account-type-${index}`}>
            <div className="signup-account-type-row">
              <label>
                <span>Value</span>
                <input
                  value={accountType.value}
                  onChange={(event) => handleUpdateAccountType(index, 'value', event.target.value)}
                  disabled={isSavingSignupOptions}
                />
              </label>
              <label>
                <span>Display name</span>
                <input
                  value={accountType.label}
                  onChange={(event) => handleUpdateAccountType(index, 'label', event.target.value)}
                  disabled={isSavingSignupOptions}
                />
              </label>
              <label>
                <span>Signup dropdown</span>
                <select
                  value={accountType.dropdown || ''}
                  onChange={(event) => handleUpdateAccountType(index, 'dropdown', event.target.value)}
                  disabled={isSavingSignupOptions}
                >
                  <option value="">No dropdown</option>
                  {signupDropdowns.map((dropdown) => (
                    <option key={dropdown.value} value={dropdown.value}>{dropdown.label}</option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="remove-signup-option-btn"
                onClick={() => {
                  setAccountTypes((current) => current.filter((_, accountTypeIndex) => accountTypeIndex !== index));
                  setNewAccountTypeOptions({});
                  setNewAccountTypeFields({});
                  setSignupOptionsSuccess('');
                }}
                disabled={isSavingSignupOptions}
                aria-label={`Remove ${accountType.label}`}
              >
                Remove
              </button>
            </div>
            <div className="signup-account-dropdown-options">
              <h4>
                {accountType.dropdown
                  ? `${signupDropdowns.find((dropdown) => dropdown.value === accountType.dropdown)?.label || accountType.dropdown} values`
                  : 'Dropdown values (select a signup dropdown above to use these on signup)'}
              </h4>
              <div className="signup-option-list">
                {accountType.options.map((option, optionIndex) => (
                  <div className="signup-option-row" key={`${index}-${optionIndex}`}>
                    <label>
                      <span>Value</span>
                      <input
                        value={option.value}
                        onChange={(event) => handleUpdateAccountTypeOption(index, optionIndex, 'value', event.target.value)}
                        disabled={isSavingSignupOptions}
                      />
                    </label>
                    <label>
                      <span>Display name</span>
                      <input
                        value={option.label}
                        onChange={(event) => handleUpdateAccountTypeOption(index, optionIndex, 'label', event.target.value)}
                        disabled={isSavingSignupOptions}
                      />
                    </label>
                    <button
                      type="button"
                      className="remove-signup-option-btn"
                      onClick={() => handleRemoveAccountTypeOption(index, optionIndex)}
                      disabled={isSavingSignupOptions}
                      aria-label={`Remove ${option.label}`}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
              <div className="add-signup-option-row">
                <input
                  aria-label={`Add a value for ${accountType.label}`}
                  placeholder="Add dropdown value"
                  value={newAccountTypeOptions[index] || ''}
                  onChange={(event) => setNewAccountTypeOptions((current) => ({
                    ...current,
                    [index]: event.target.value
                  }))}
                  disabled={isSavingSignupOptions}
                />
                <button
                  type="button"
                  className="add-signup-value-btn"
                  onClick={() => handleAddAccountTypeOption(index)}
                  disabled={isSavingSignupOptions || !newAccountTypeOptions[index]?.trim()}
                >
                  Add Value
                </button>
              </div>
            </div>
            <div className="signup-account-custom-fields">
              <h4>Optional signup input fields</h4>
              <div className="signup-custom-field-list">
                {accountType.customFields.map((field, fieldIndex) => (
                  <div
                    className={`signup-custom-field-row${['text', 'number'].includes(field.type) ? ' has-limits' : ''}`}
                    key={field.id}
                  >
                    <label>
                      <span>Field label</span>
                      <input
                        value={field.label}
                        onChange={(event) => handleUpdateAccountTypeField(index, fieldIndex, 'label', event.target.value)}
                        disabled={isSavingSignupOptions}
                      />
                    </label>
                    <label>
                      <span>Input type</span>
                      <select
                        value={field.type}
                        onChange={(event) => handleUpdateAccountTypeField(index, fieldIndex, 'type', event.target.value)}
                        disabled={isSavingSignupOptions}
                      >
                        {SIGNUP_FIELD_TYPES.map((type) => (
                          <option key={type} value={type}>{type[0].toUpperCase() + type.slice(1)}</option>
                        ))}
                      </select>
                    </label>
                    {['text', 'number'].includes(field.type) && (
                      <>
                        <label>
                          <span>{field.type === 'text' ? 'Min characters' : 'Min value'}</span>
                          <input
                            type="number"
                            min={field.type === 'text' ? 0 : undefined}
                            step={field.type === 'text' ? 1 : 'any'}
                            value={field.min ?? ''}
                            onChange={(event) => handleUpdateAccountTypeField(index, fieldIndex, 'min', event.target.value)}
                            disabled={isSavingSignupOptions}
                          />
                        </label>
                        <label>
                          <span>{field.type === 'text' ? 'Max characters' : 'Max value'}</span>
                          <input
                            type="number"
                            min={field.type === 'text' ? 0 : undefined}
                            step={field.type === 'text' ? 1 : 'any'}
                            value={field.max ?? ''}
                            onChange={(event) => handleUpdateAccountTypeField(index, fieldIndex, 'max', event.target.value)}
                            disabled={isSavingSignupOptions}
                          />
                        </label>
                      </>
                    )}
                    <button
                      type="button"
                      className="remove-signup-option-btn"
                      onClick={() => handleRemoveAccountTypeField(index, fieldIndex)}
                      disabled={isSavingSignupOptions}
                      aria-label={`Remove ${field.label} input field`}
                    >
                      Remove
                    </button>
                    {field.type === 'text' && (
                      <fieldset className="signup-character-type-options">
                        <legend>Allowed characters</legend>
                        {SIGNUP_TEXT_CHARACTER_TYPES.map(({ value, label }) => (
                          <label key={value}>
                            <input
                              type="checkbox"
                              checked={normalizeSignupTextCharacterTypes(field.characterTypes).includes(value)}
                              onChange={(event) => handleUpdateAccountTypeFieldCharacterType(
                                index,
                                fieldIndex,
                                value,
                                event.target.checked
                              )}
                              disabled={isSavingSignupOptions}
                            />
                            <span>{label}</span>
                          </label>
                        ))}
                      </fieldset>
                    )}
                    <label className="signup-profile-editable-option">
                      <input
                        type="checkbox"
                        checked={field.editableOnProfile !== false}
                        onChange={(event) => handleUpdateAccountTypeField(
                          index,
                          fieldIndex,
                          'editableOnProfile',
                          event.target.checked
                        )}
                        disabled={isSavingSignupOptions}
                      />
                      <span>Editable on profile</span>
                    </label>
                  </div>
                ))}
              </div>
              <div className="add-signup-option-row">
                <input
                  aria-label={`New optional input field label for ${accountType.label}`}
                  placeholder="New input field (e.g., Student Number)"
                  value={newAccountTypeFields[index]?.label || ''}
                  onChange={(event) => setNewAccountTypeFields((current) => ({
                    ...current,
                    [index]: { ...(current[index] || { type: 'text', min: '', max: '' }), label: event.target.value }
                  }))}
                  disabled={isSavingSignupOptions}
                />
                <select
                  aria-label={`New input field type for ${accountType.label}`}
                  value={newAccountTypeFields[index]?.type || 'text'}
                  onChange={(event) => setNewAccountTypeFields((current) => ({
                    ...current,
                    [index]: { ...(current[index] || { label: '', min: '', max: '' }), type: event.target.value }
                  }))}
                  disabled={isSavingSignupOptions}
                >
                  {SIGNUP_FIELD_TYPES.map((type) => (
                    <option key={type} value={type}>{type[0].toUpperCase() + type.slice(1)}</option>
                  ))}
                </select>
                {['text', 'number'].includes(newAccountTypeFields[index]?.type || 'text') && (
                  <>
                    <input
                      type="number"
                      min={newAccountTypeFields[index]?.type !== 'number' ? 0 : undefined}
                      step={newAccountTypeFields[index]?.type !== 'number' ? 1 : 'any'}
                      aria-label={`Minimum ${newAccountTypeFields[index]?.type === 'number' ? 'value' : 'characters'} for ${accountType.label}`}
                      placeholder={newAccountTypeFields[index]?.type === 'number' ? 'Min value (optional)' : 'Min characters (optional)'}
                      value={newAccountTypeFields[index]?.min || ''}
                      onChange={(event) => setNewAccountTypeFields((current) => ({
                        ...current,
                        [index]: { ...(current[index] || { label: '', type: 'text', max: '' }), min: event.target.value }
                      }))}
                      disabled={isSavingSignupOptions}
                    />
                    <input
                      type="number"
                      min={newAccountTypeFields[index]?.type !== 'number' ? 0 : undefined}
                      step={newAccountTypeFields[index]?.type !== 'number' ? 1 : 'any'}
                      aria-label={`Maximum ${newAccountTypeFields[index]?.type === 'number' ? 'value' : 'characters'} for ${accountType.label}`}
                      placeholder={newAccountTypeFields[index]?.type === 'number' ? 'Max value (optional)' : 'Max characters (optional)'}
                      value={newAccountTypeFields[index]?.max || ''}
                      onChange={(event) => setNewAccountTypeFields((current) => ({
                        ...current,
                        [index]: { ...(current[index] || { label: '', type: 'text', min: '' }), max: event.target.value }
                      }))}
                      disabled={isSavingSignupOptions}
                    />
                  </>
                )}
                <button
                  type="button"
                  className="add-signup-value-btn"
                  onClick={() => handleAddAccountTypeField(index)}
                  disabled={isSavingSignupOptions || !newAccountTypeFields[index]?.label?.trim()}
                >
                  Add Input
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="signup-account-type-row add-signup-account-type-row">
        <label>
          <span>Value</span>
          <input
            value={newAccountType.value}
            onChange={(event) => setNewAccountType((current) => ({ ...current, value: event.target.value }))}
            placeholder="Account type value"
            disabled={isSavingSignupOptions}
          />
        </label>
        <label>
          <span>Display name</span>
          <input
            value={newAccountType.label}
            onChange={(event) => setNewAccountType((current) => ({ ...current, label: event.target.value }))}
            placeholder="Account type name"
            disabled={isSavingSignupOptions}
          />
        </label>
        <label>
          <span>Signup dropdown</span>
          <select
            value={newAccountType.dropdown}
            onChange={(event) => setNewAccountType((current) => ({ ...current, dropdown: event.target.value }))}
            disabled={isSavingSignupOptions}
          >
            <option value="">No dropdown</option>
            {signupDropdowns.map((dropdown) => (
              <option key={dropdown.value} value={dropdown.value}>{dropdown.label}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="add-signup-value-btn"
          onClick={handleAddAccountType}
          disabled={isSavingSignupOptions || !newAccountType.value.trim() || !newAccountType.label.trim()}
        >
          Add account type
        </button>
      </div>
    </>
  );

  return (
    <div className="user-management-content">
      <div className="page-header">
        <div>
          <h1>All Users</h1>
        </div>
      </div>

      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-info">
            <span className="label">Total Users</span>
            <span className="count">{totalUsers}</span>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-info">
            <span className="label">Online Users</span>
            <span className="count">{activeUsers}</span>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-info">
            <span className="label">Admins</span>
            <span className="count">{totalAdmins}</span>
          </div>
        </div>
      </div>

      <div className="table-container">
        <div className="table-controls">
          <div className="controls-left">
            <h2>User Directory</h2>
            <p>Search and manage all system users</p>
            <div className="table-pagination">
              <span className="pagination-text">
                {filteredUsers.length === 0
                  ? 'No users to show'
                  : `Showing all ${filteredUsers.length} users`}
              </span>
            </div>
          </div>

          <div className="controls-right">
            <div className="search-input-wrapper">
              <span className="search-icon">🔍</span>
              <input 
                type="text" 
                placeholder="Search users..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            {isSuperAdmin && (
              <select
                className="user-filter-select"
                aria-label="Filter users"
                value={userFilter}
                onChange={(event) => setUserFilter(event.target.value)}
              >
                <option value="all">All users</option>
                <option value="unverified">Unverified users</option>
              </select>
            )}
            {isSuperAdmin && userFilter === 'unverified' && (
              <select
                className="user-filter-select"
                aria-label="Filter by days since creation"
                value={unverifiedAgeFilter}
                onChange={(event) => {
                  setUnverifiedFilterNow(Date.now());
                  setUnverifiedAgeFilter(event.target.value);
                }}
              >
                <option value="all">Any age</option>
                <option value="7">7+ days</option>
                <option value="14">14+ days</option>
              </select>
            )}
          </div>
        </div>

        {actionError && <div className="error-banner">{actionError}</div>}

        <div className="table-content-scroll">
          <div className="table-scroll-wrapper">
            <table className="user-table">
              <thead>
                <tr>
                  <th>USER</th>
                  <th>ROLE</th>
                  <th>DEPARTMENT</th>
                  <th>COURSE</th>
                  {!isSuperAdmin || userFilter === 'all' ? <th>STATUS</th> : <th>TIME CREATED</th>}
                  <th>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {isLoading || loadError || filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="empty-state-cell">
                      <div className="empty-state">
                        <span className="empty-state-icon">{loadError ? '⚠️' : '👥'}</span>
                        <p className="empty-state-title">
                          {isLoading ? 'Loading users…' : loadError ? 'Something went wrong' : 'No users found'}
                        </p>
                        <p className="empty-state-subtitle">
                          {isLoading
                            ? 'Fetching the latest users from the database.'
                            : loadError || (searchQuery ? 'Try adjusting your search filters.' : 'Users will appear here once they are registered.')}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((user) => {
                    const status = getDynamicStatus(user);
                    const isActive = status === 'Online';
                    const isBlocked = status === 'Blocked';

                    return (
                      <tr key={user.id}>
                        <td>
                          <Link
                            className="user-name-cell user-profile-link"
                            to={`/account?userId=${encodeURIComponent(user.id)}`}
                          >
                            {user.avatarUrl ? (
                              <img className="avatar-img" src={user.avatarUrl} alt="" />
                            ) : (
                              <span className="avatar-placeholder">{(user.name || '?').charAt(0)}</span>
                            )}
                            <span className="user-name-copy">
                              <span className="user-title">{user.name || 'Unnamed User'}</span>
                              <span className="user-email">{user.email}</span>
                            </span>
                          </Link>
                        </td>
                        <td>
                          <span className={`role-badge ${roleBadgeClass(user.role)}`}>
                            {formatRole(user.role)}
                          </span>
                        </td>
                        <td>{user.department || '—'}</td>
                        <td>{user.course || '—'}</td>
                        {isSuperAdmin && userFilter === 'unverified' ? (
                          <td>{formatTimeCreated(user.timeCreated || user.createdAt)}</td>
                        ) : (
                          <td>
                            <span className={`status-dot ${isActive ? 'status-active' : 'status-inactive'}`}>
                              {status}
                            </span>
                          </td>
                        )}
                        <td>
                          {isSuperAdmin && userFilter === 'unverified' ? (
                            <button
                              className="action-btn delete-unverified-btn"
                              type="button"
                              onClick={() => handleDeleteUnverifiedUser(user)}
                              disabled={deletingUserId === user.id}
                            >
                              {deletingUserId === user.id ? 'Deleting…' : '⚠ Delete profile'}
                            </button>
                          ) : (
                            <div className="action-buttons">
                              <button
                                className="action-btn assign-role-btn"
                                onClick={() => handleOpenRoleModal(user)}
                              >
                                👤 Assign Role
                              </button>
                              <button
                                className={`action-btn block-user-btn${isBlocked ? ' unblock-user-btn' : ''}`}
                                type="button"
                                onClick={() => handleToggleBlock(user)}
                                disabled={user.id === currentUser?.uid || updatingBlockUserId === user.id}
                                title={user.id === currentUser?.uid ? 'You cannot block your own account.' : undefined}
                              >
                                {updatingBlockUserId === user.id ? 'Updating…' : isBlocked ? 'Unblock' : '⚠ Block'}
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {isSuperAdmin && (
        <section className="signup-options-container" aria-labelledby="signup-options-title">
          <div className="signup-options-heading">
            <div>
              <h2 id="signup-options-title">Signup Account Types</h2>
              <p>Manage each account type and its signup dropdown values.</p>
            </div>
            <button
              type="button"
              className="save-signup-options-btn"
              onClick={handleSaveSignupOptions}
              disabled={isSavingSignupOptions}
            >
              {isSavingSignupOptions ? 'Saving…' : 'Save changes'}
            </button>
          </div>
          {signupOptionsError && <div className="error-banner" role="alert">{signupOptionsError}</div>}
          {signupOptionsSuccess && <div className="success-banner" role="status">{signupOptionsSuccess}</div>}
          <section className="signup-option-category">
            <h3>Signup Dropdowns</h3>
            <div className="signup-dropdown-list">
              {signupDropdowns.map((dropdown, index) => (
                <div className="signup-dropdown-row" key={dropdown.value}>
                  <label>
                    <span>Dropdown name</span>
                    <input
                      value={dropdown.label}
                      onChange={(event) => handleUpdateSignupDropdown(index, 'label', event.target.value)}
                      disabled={isSavingSignupOptions}
                    />
                  </label>
                   <label className="signup-profile-editable-option">
                     <input
                       type="checkbox"
                       checked={dropdown.editableOnProfile !== false}
                       onChange={(event) => handleUpdateSignupDropdown(
                         index,
                         'editableOnProfile',
                         event.target.checked
                       )}
                       disabled={isSavingSignupOptions}
                     />
                     <span>Editable on profile</span>
                   </label>
                   <button
                    type="button"
                    className="remove-signup-option-btn"
                    onClick={() => handleRemoveSignupDropdown(dropdown)}
                    disabled={isSavingSignupOptions}
                    aria-label={`Remove ${dropdown.label} signup dropdown`}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
            <div className="add-signup-option-row">
              <input
                aria-label="New signup dropdown name"
                placeholder="New dropdown name (e.g., Course / Program)"
                value={newSignupDropdown}
                onChange={(event) => setNewSignupDropdown(event.target.value)}
                disabled={isSavingSignupOptions}
              />
              <button
                type="button"
                className="add-signup-value-btn"
                onClick={handleAddSignupDropdown}
                disabled={isSavingSignupOptions || !newSignupDropdown.trim()}
              >
                Add Dropdown
              </button>
            </div>
          </section>
          <section className="signup-option-category">
            <h3>Account Types</h3>
            {renderAccountTypes()}
          </section>
        </section>
      )}

      {roleModalUser && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>Assign Role</h3>
            <p className="confirm-text">
              Select a new role for <strong>{roleModalUser.name || roleModalUser.email}</strong>:
            </p>
            
            <div className="role-select-wrapper">
              <select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value)}
                className="role-select"
              >
                {ROLE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="modal-actions">
              <button
                type="button"
                onClick={() => setRoleModalUser(null)}
                disabled={isUpdatingRole}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary-solid"
                onClick={handleSaveRole}
                disabled={isUpdatingRole}
              >
                {isUpdatingRole ? 'Saving…' : 'Save Role'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MisUserManagement;