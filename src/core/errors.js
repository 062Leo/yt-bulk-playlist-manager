// errors.js – Custom error type definitions (SessionError, ApiError, InjectionError, ParseError)

/**
 * Thrown when ytcfg is unavailable after max polling attempts.
 * Indicates that the YouTube page has not initialised its configuration object
 * within the expected time window (see CONFIG.SESSION_POLL_MAX).
 */
class SessionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SessionError';
  }
}

/**
 * Thrown on non-OK HTTP responses from YouTube's internal API endpoints.
 *
 * @param {string}  message  - Human-readable error description.
 * @param {number}  status   - HTTP status code of the failed response.
 * @param {string}  endpoint - URL of the endpoint that returned the error.
 */
class ApiError extends Error {
  constructor(message, status, endpoint) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.endpoint = endpoint;
  }

  /**
   * Creates an ApiError instance from a fetch Response object.
   *
   * @param {Response} res - A fetch Response object.
   * @returns {ApiError}
   */
  static fromResponse(res) {
    return new ApiError('HTTP ' + res.status + ': ' + res.statusText, res.status, res.url);
  }
}

/**
 * Thrown when DOM injection fails unexpectedly (e.g. target element missing,
 * append operation rejected by the browser).
 */
class InjectionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'InjectionError';
  }
}

/**
 * Thrown when an API response cannot be parsed into the expected shape
 * (e.g. missing required fields, unexpected structure, or JSON parse failure).
 */
class ParseError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ParseError';
  }
}
