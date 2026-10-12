import { config } from "zod";

// The production CSP forbids eval. Zod decides at schema-definition time whether to probe for it,
// so this module must be imported before any module that defines a schema (see main.tsx).
config({ jitless: true });
