'use strict';
const { z } = require('zod');

class HttpError extends Error {
  constructor(status, message, extra) { super(message); this.status = status; this.extra = extra; }
}

/** Validate req.body against a zod schema; throws a 400 with per-field messages. */
function parse(schema, data) {
  const r = schema.safeParse(data ?? {});
  if (r.success) return r.data;
  const fields = {};
  for (const i of r.error.issues) fields[i.path.join('.') || '_'] ??= i.message;
  throw new HttpError(400, 'Please check the highlighted fields.', { fields });
}

const str = (max, min = 0) => z.string().trim().min(min).max(max);
const text = (max) => z.string().max(max).transform((s) => s.replace(/\r\n/g, '\n').trim());

module.exports = { HttpError, parse, str, text, z };
