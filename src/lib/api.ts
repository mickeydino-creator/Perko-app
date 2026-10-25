import type { Backend } from './backend';
import { DEMO } from './config';
import { createDemoBackend } from './demoBackend';
import { createSupabaseBackend } from './supabaseBackend';

/** The one data layer of the app. Supabase when configured in .env, otherwise local demo data. */
export const api: Backend = DEMO ? createDemoBackend() : createSupabaseBackend();
