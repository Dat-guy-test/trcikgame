export interface Env {
  ROOMS: DurableObjectNamespace;
  /** Comma-separated allowed origins, or "*" / empty for any. */
  ALLOWED_ORIGIN?: string;
}
