export const normalizeUserRole = (role) => (
  String(role || '').toLowerCase().trim().replace(/_/g, ' ').replace(/\s+/g, ' ')
);
