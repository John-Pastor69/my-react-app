export const sanitizeEventName = value => String(value ?? '').replace(/[^A-Za-z0-9 ]/g, '');
