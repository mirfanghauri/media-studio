"use strict";

/**
 * Error Handler Middleware for Media Studio API
 * 
 * Provides standardized error response format across all endpoints.
 * 
 * Error Response Format:
 * {
 *   error: string,        // Human-readable error message
 *   code?: string,        // Machine-readable error code
 *   details?: any,        // Additional context (optional)
 *   timestamp: string     // ISO timestamp
 * }
 */

/**
 * Error codes for common scenarios
 */
const ErrorCodes = {
  // Validation errors (4xx)
  INVALID_INPUT: "INVALID_INPUT",
  MISSING_PARAMETER: "MISSING_PARAMETER",
  INVALID_PARAMETER: "INVALID_PARAMETER",
  INVALID_FILE_TYPE: "INVALID_FILE_TYPE",
  FILE_TOO_LARGE: "FILE_TOO_LARGE",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  
  // Processing errors (5xx)
  INTERNAL_ERROR: "INTERNAL_ERROR",
  QUEUE_ERROR: "QUEUE_ERROR",
  STORAGE_ERROR: "STORAGE_ERROR",
  AI_PROVIDER_ERROR: "AI_PROVIDER_ERROR",
  RATE_LIMIT_EXCEEDED: "RATE_LIMIT_EXCEEDED",
  
  // Content policy
  CONTENT_POLICY_VIOLATION: "CONTENT_POLICY_VIOLATION",
};

/**
 * Create a standardized error response
 * 
 * @param {string} message - Human-readable error message
 * @param {string} code - Error code from ErrorCodes
 * @param {number} statusCode - HTTP status code
 * @param {any} details - Additional context
 * @returns {Object} Standardized error response
 */
function createError(message, code = ErrorCodes.INTERNAL_ERROR, statusCode = 500, details = null) {
  const response = {
    error: message,
    code,
    timestamp: new Date().toISOString(),
  };
  
  if (details !== null) {
    response.details = details;
  }
  
  return { response, statusCode };
}

/**
 * Send a standardized error response
 * 
 * @param {FastifyReply} reply - Fastify reply object
 * @param {string} message - Human-readable error message
 * @param {string} code - Error code
 * @param {number} statusCode - HTTP status code
 * @param {any} details - Additional context
 */
function sendError(reply, message, code = ErrorCodes.INTERNAL_ERROR, statusCode = 500, details = null) {
  const { response, statusCode: status } = createError(message, code, statusCode, details);
  return reply.code(status).send(response);
}

/**
 * Predefined error helpers
 */
const Errors = {
  // 400 Bad Request
  badRequest: (message, details = null) => 
    createError(message, ErrorCodes.INVALID_INPUT, 400, details),
  
  missingParam: (param) => 
    createError(`Missing required parameter: ${param}`, ErrorCodes.MISSING_PARAMETER, 400),
  
  invalidParam: (param, reason) => 
    createError(`Invalid parameter '${param}': ${reason}`, ErrorCodes.INVALID_PARAMETER, 400),
  
  invalidFileType: (allowed) => 
    createError(`Invalid file type. Allowed: ${allowed}`, ErrorCodes.INVALID_FILE_TYPE, 400),
  
  fileTooLarge: (maxSize) => 
    createError(`File too large. Maximum size: ${maxSize}`, ErrorCodes.FILE_TOO_LARGE, 400),
  
  // 401 Unauthorized
  unauthorized: (message = "Authentication required") => 
    createError(message, ErrorCodes.UNAUTHORIZED, 401),
  
  // 403 Forbidden
  forbidden: (message = "Access denied") => 
    createError(message, ErrorCodes.FORBIDDEN, 403),
  
  // 404 Not Found
  notFound: (resource) => 
    createError(`${resource} not found`, ErrorCodes.NOT_FOUND, 404),
  
  // 429 Rate Limit
  rateLimited: (retryAfter = 60) => 
    createError(
      `Rate limit exceeded. Please wait ${retryAfter} seconds before retrying.`,
      ErrorCodes.RATE_LIMIT_EXCEEDED,
      429,
      { retryAfter }
    ),
  
  // 500 Internal Server Error
  internal: (message = "Internal server error", details = null) => 
    createError(message, ErrorCodes.INTERNAL_ERROR, 500, details),
  
  // Queue errors
  queueError: (message) => 
    createError(message, ErrorCodes.QUEUE_ERROR, 500),
  
  // Storage errors
  storageError: (message) => 
    createError(message, ErrorCodes.STORAGE_ERROR, 500),
  
  // AI Provider errors
  aiProviderError: (provider, message) => 
    createError(`AI provider '${provider}' error: ${message}`, ErrorCodes.AI_PROVIDER_ERROR, 500),
  
  // Content policy
  contentPolicy: (message) => 
    createError(message, ErrorCodes.CONTENT_POLICY_VIOLATION, 400),
};

/**
 * Fastify error handler plugin
 * Automatically catches errors and formats them
 */
async function errorHandlerPlugin(app) {
  app.setErrorHandler((error, request, reply) => {
    // Log the error
    request.log.error(error);
    
    // Handle known error types
    if (error.validation) {
      // Fastify validation error
      return sendError(
        reply,
        error.message,
        ErrorCodes.INVALID_INPUT,
        400,
        { validation: error.validation }
      );
    }
    
    if (error.statusCode === 401) {
      return sendError(reply, "Unauthorized", ErrorCodes.UNAUTHORIZED, 401);
    }
    
    if (error.statusCode === 403) {
      return sendError(reply, "Forbidden", ErrorCodes.FORBIDDEN, 403);
    }
    
    if (error.statusCode === 404) {
      return sendError(reply, error.message || "Not found", ErrorCodes.NOT_FOUND, 404);
    }
    
    if (error.statusCode === 429) {
      return sendError(reply, "Rate limit exceeded", ErrorCodes.RATE_LIMIT_EXCEEDED, 429);
    }
    
    // Default to internal server error
    const isProduction = process.env.NODE_ENV === "production";
    return sendError(
      reply,
      isProduction ? "Internal server error" : error.message,
      ErrorCodes.INTERNAL_ERROR,
      error.statusCode || 500,
      isProduction ? null : { stack: error.stack }
    );
  });
}

module.exports = {
  ErrorCodes,
  Errors,
  createError,
  sendError,
  errorHandlerPlugin,
};
