import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeUserRole } from './userRole.js';

test('normalizes legacy role spelling and whitespace', () => {
  assert.equal(normalizeUserRole(' Building_Admin '), 'building admin');
  assert.equal(normalizeUserRole('MIS   ADMIN'), 'mis admin');
  assert.equal(normalizeUserRole(null), '');
});
