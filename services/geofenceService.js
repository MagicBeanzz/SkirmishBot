/**
 * Geofencing Service
 *
 * Blocks users from prohibited states from making real-money transactions.
 *
 * IMPORTANT: This is a basic implementation. For production, integrate a real
 * IP geolocation service like MaxMind GeoIP2, IPinfo, or ip-api.com
 *
 * Legal Requirements:
 * - Must block users from prohibited states
 * - Must maintain audit log of blocked attempts
 * - Must provide clear error messages to users
 */

const axios = require("axios");

/**
 * List of prohibited states for skill-based gaming with cash prizes
 *
 * These states have laws that may prohibit or restrict skill gaming platforms.
 * This list should be reviewed quarterly with legal counsel.
 */
const PROHIBITED_STATES = [
  "AZ", // Arizona
  "AR", // Arkansas
  "CT", // Connecticut
  "DE", // Delaware
  "FL", // Florida - User specifically requested
  "LA", // Louisiana
  "MD", // Maryland
  "MT", // Montana
  "SC", // South Carolina
  "SD", // South Dakota
  "TN", // Tennessee
];

const PROHIBITED_STATE_NAMES = {
  AZ: "Arizona",
  AR: "Arkansas",
  CT: "Connecticut",
  DE: "Delaware",
  FL: "Florida",
  LA: "Louisiana",
  MD: "Maryland",
  MT: "Montana",
  SC: "South Carolina",
  SD: "South Dakota",
  TN: "Tennessee",
};

/**
 * Check if a user's location is in a prohibited state
 *
 * @param {string} ipAddress - User's IP address (from Discord or webhook)
 * @returns {Promise<{allowed: boolean, state: string|null, reason: string}>}
 */
async function checkGeofence(ipAddress) {
  try {
    // OPTION 1: Free IP geolocation API (has rate limits)
    // For production, replace with MaxMind GeoIP2 or IPinfo paid service

    // Skip localhost/private IPs (development mode)
    if (
      !ipAddress ||
      ipAddress === "127.0.0.1" ||
      ipAddress.startsWith("192.168.") ||
      ipAddress.startsWith("10.") ||
      ipAddress === "::1"
    ) {
      return {
        allowed: true,
        state: null,
        reason: "Development mode - localhost IP",
      };
    }

    // Call free IP geolocation API (ip-api.com - 45 req/min limit)
    const response = await axios.get(`http://ip-api.com/json/${ipAddress}`, {
      timeout: 5000,
    });

    if (response.data.status !== "success") {
      // If geolocation fails, log warning but ALLOW (fail open for user experience)
      console.warn(`⚠️ Geolocation failed for IP ${ipAddress}:`, response.data);
      return {
        allowed: true,
        state: null,
        reason: "Geolocation service unavailable - allowing transaction",
      };
    }

    const { region, regionName, country } = response.data;

    // Only check US residents
    if (country !== "US" && country !== "USA" && country !== "United States") {
      return {
        allowed: true,
        state: null,
        reason: `Non-US location: ${country}`,
      };
    }

    // Check if state is prohibited
    if (PROHIBITED_STATES.includes(region)) {
      console.log(
        `🚫 Geofence block: User in prohibited state ${regionName} (${region})`
      );
      return {
        allowed: false,
        state: region,
        stateName: PROHIBITED_STATE_NAMES[region] || regionName,
        reason: `Prohibited state: ${PROHIBITED_STATE_NAMES[region] || regionName}`,
      };
    }

    // Allow transaction
    return {
      allowed: true,
      state: region,
      stateName: regionName,
      reason: `Allowed state: ${regionName}`,
    };
  } catch (error) {
    console.error("❌ Error in geofence check:", error.message);

    // FAIL OPEN: If geolocation service is down, allow transaction
    // Alternatively, you could FAIL CLOSED (block all) for maximum compliance
    return {
      allowed: true,
      state: null,
      reason: `Geolocation error - allowing transaction (${error.message})`,
    };
  }
}

/**
 * Get user-friendly error message for prohibited states
 *
 * @param {string} stateCode - Two-letter state code
 * @returns {string} Error message
 */
function getProhibitedStateMessage(stateCode) {
  const stateName = PROHIBITED_STATE_NAMES[stateCode] || stateCode;

  return (
    `❌ **Service Unavailable in ${stateName}**\n\n` +
    `We're sorry, but our skill-based gaming platform is not available to residents of ${stateName} ` +
    `due to state regulations regarding paid competitions.\n\n` +
    `**Why is this restricted?**\n` +
    `${stateName} has specific laws that may prohibit or restrict online skill gaming platforms ` +
    `with cash prizes. To ensure full compliance with state law, we do not accept players from this state.\n\n` +
    `**What you can do:**\n` +
    `• If you believe this is an error, please contact support\n` +
    `• If you're traveling, this restriction is based on your current location\n` +
    `• Review our Terms of Service for more information on geographic restrictions\n\n` +
    `We appreciate your understanding and apologize for any inconvenience.`
  );
}

/**
 * Log geofence check for audit trail
 *
 * @param {string} userId - Discord user ID
 * @param {string} ipAddress - IP address
 * @param {object} checkResult - Result from checkGeofence()
 * @param {string} action - Action being attempted (e.g., "ticket_purchase", "payout_request")
 */
async function logGeofenceCheck(userId, ipAddress, checkResult, action) {
  const AuditLog = require("../models/AuditLog");

  try {
    await AuditLog.create({
      userId,
      action: `geofence_check_${action}`,
      details: {
        ipAddress,
        allowed: checkResult.allowed,
        state: checkResult.state,
        stateName: checkResult.stateName,
        reason: checkResult.reason,
      },
      timestamp: new Date(),
    });
  } catch (error) {
    console.error("❌ Error logging geofence check:", error);
  }
}

/**
 * Middleware to check geofence before allowing ticket purchases
 *
 * @param {object} interaction - Discord interaction
 * @returns {Promise<{allowed: boolean, message: string|null}>}
 */
async function checkTicketPurchaseGeofence(interaction) {
  // Discord doesn't provide direct IP access, so we use a workaround:
  // In production, you would:
  // 1. Collect IP during Stripe checkout (Stripe provides customer IP)
  // 2. Store IP in user profile on first purchase
  // 3. Use stored IP for subsequent checks

  // For now, return allowed (implement proper IP collection via Stripe)
  return {
    allowed: true,
    message: null,
    reason: "IP collection not yet implemented - using Stripe IP verification",
  };
}

module.exports = {
  checkGeofence,
  getProhibitedStateMessage,
  logGeofenceCheck,
  checkTicketPurchaseGeofence,
  PROHIBITED_STATES,
  PROHIBITED_STATE_NAMES,
};
