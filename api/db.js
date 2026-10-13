"use strict";

/**
 * API Database Module
 * 
 * Re-exports the shared database module for backward compatibility.
 * All schema initialization and migrations are handled by the shared module.
 * 
 * @see ./shared/db.js
 */

const { getDb, closeDb } = require("./shared/db");

module.exports = getDb;
module.exports.getDb = getDb;
module.exports.closeDb = closeDb;
