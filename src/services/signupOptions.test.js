import assert from 'node:assert/strict';
import test from 'node:test';
import { isValidSignupRegex, matchesSignupRegex, normalizeAccountTypes } from './signupOptions.js';

test('validates full custom-field values with regex patterns', () => {
  assert.equal(matchesSignupRegex('STU123', '[A-Z]{3}[0-9]{3}'), true);
  assert.equal(matchesSignupRegex('STU123x', '[A-Z]{3}[0-9]{3}'), false);
  assert.equal(matchesSignupRegex('STU123', '^[A-Z]{3}[0-9]{3}$'), true);
  assert.equal(matchesSignupRegex('anything', ''), true);
});

test('identifies invalid signup regex patterns', () => {
  assert.equal(isValidSignupRegex('[A-Z'), false);
  assert.equal(matchesSignupRegex('value', '['), false);
  assert.equal(isValidSignupRegex('[A-Z]+'), true);
});

test('preserves regex patterns when normalizing account type fields', () => {
  const [accountType] = normalizeAccountTypes([{
    value: 'Student',
    customFields: [{
      id: 'student-id',
      label: 'Student ID',
      pattern: '\\d{8}',
      placeholder: 'Enter student ID'
    }]
  }]);

  assert.equal(accountType.customFields[0].pattern, '\\d{8}');
  assert.equal(accountType.customFields[0].placeholder, 'Enter student ID');
});
