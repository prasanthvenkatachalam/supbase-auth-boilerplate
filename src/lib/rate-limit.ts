/**
 * Rate Limiting Utilities
 * 
 * This module implements industry-standard rate limiting strategies to prevent abuse.
 * We use multiple layers of rate limiting for defense in depth:
 * 
 * 1. IP-based limiting: Prevents single IP from spamming
 * 2. Email-based limiting: Prevents account enumeration and spam with same email
 * 3. Global limiting: Protects overall system resources
 */

import { Ratelimit, type Duration } from "@upstash/ratelimit";
import { redis } from "@/lib/upstash";
import { RATE_LIMIT_CONFIG } from "@/constants/rate-limit";

/**
 * Rate Limiting Strategies:
 * 
 * 1. Sliding Window: Most accurate, prevents burst attacks
 *    - Tracks requests over a continuous time window
 *    - Example: If limit is 5 req/hour, user can't send 5 requests in the first minute
 *      and then 5 more in the next hour
 * 
 * 2. Fixed Window: Simpler, allows burst at window boundaries
 *    - Resets at fixed intervals (e.g., every hour on the hour)
 *    - Slightly less accurate but more performant
 * 
 * 3. Token Bucket: Allows controlled bursts
 *    - Refills tokens at a steady rate
 *    - Good for APIs that need to allow occasional spikes
 */

/**
 * IP-based rate limiter for signup attempts
 * 
 * Configuration:
 * - 3 attempts per 15 minutes per IP
 * - Using sliding window algorithm for accuracy
 * - Prefix "ratelimit:signup:ip:" to organize Redis keys
 * 
 * Why these limits?
 * - 3 attempts: Allows for typos but prevents brute force
 * - 15 minutes: Short enough to prevent abuse, long enough to deter automated attacks
 */
export const ipRateLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(
    RATE_LIMIT_CONFIG.SIGNUP.IP.LIMIT,
    RATE_LIMIT_CONFIG.SIGNUP.IP.WINDOW as Duration
  ),
  analytics: true, // Track rate limit metrics
  prefix: RATE_LIMIT_CONFIG.SIGNUP.IP.PREFIX,
});

/**
 * Email-based rate limiter
 * 
 * Configuration:
 * - 5 attempts per hour per email
 * - Prevents someone from repeatedly trying to sign up with the same email
 * - Useful to detect account enumeration attacks
 * 
 * Why these limits?
 * - 5 attempts: More lenient than IP (user might try from different devices)
 * - 1 hour: Prevents rapid automated account creation
 */
export const emailRateLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(
    RATE_LIMIT_CONFIG.SIGNUP.EMAIL.LIMIT,
    RATE_LIMIT_CONFIG.SIGNUP.EMAIL.WINDOW as Duration
  ),
  analytics: true,
  prefix: RATE_LIMIT_CONFIG.SIGNUP.EMAIL.PREFIX,
});

/**
 * Global rate limiter for all signup attempts
 * 
 * Configuration:
 * - 100 signups per minute across entire application
 * - Last line of defense against DDoS attacks
 * - Protects database and email service from overload
 * 
 * This is a shared limit across all users, so it should be generous
 */
export const globalSignupRateLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(
    RATE_LIMIT_CONFIG.SIGNUP.GLOBAL.LIMIT,
    RATE_LIMIT_CONFIG.SIGNUP.GLOBAL.WINDOW as Duration
  ),
  analytics: true,
  prefix: RATE_LIMIT_CONFIG.SIGNUP.GLOBAL.PREFIX,
});

/**
 * Rate limit response type
 * Contains all information needed to handle rate limiting in API routes
 */
export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number; // Timestamp when the limit resets
  pending: Promise<unknown>; // Internal promise, can be ignored
}

/**
 * Multi-layer rate limit checker for signup
 * 
 * Checks three layers in sequence:
 * 1. Global limit (fastest check, protects system)
 * 2. IP limit (prevents single-source abuse)
 * 3. Email limit (prevents account-specific abuse)
 * 
 * @param ip - Client IP address
 * @param email - Email being registered
 * @returns Object with rate limit results and which limit was hit
 */
export async function checkSignupRateLimit(
  ip: string,
  email: string
): Promise<{
  allowed: boolean;
  limitType?: "global" | "ip" | "email";
  limit?: number;
  remaining?: number;
  resetAt?: Date;
}> {
  try {
    // Layer 1: Check global rate limit first (cheapest check)
    const globalResult = await globalSignupRateLimiter.limit("global");
    if (!globalResult.success) {
      return {
        allowed: false,
        limitType: "global",
        limit: globalResult.limit,
        remaining: globalResult.remaining,
        resetAt: new Date(globalResult.reset),
      };
    }

    // Layer 2: Check IP-based rate limit
    const ipResult = await ipRateLimiter.limit(ip);
    if (!ipResult.success) {
      return {
        allowed: false,
        limitType: "ip",
        limit: ipResult.limit,
        remaining: ipResult.remaining,
        resetAt: new Date(ipResult.reset),
      };
    }

    // Layer 3: Check email-based rate limit
    const emailResult = await emailRateLimiter.limit(email.toLowerCase());
    if (!emailResult.success) {
      return {
        allowed: false,
        limitType: "email",
        limit: emailResult.limit,
        remaining: emailResult.remaining,
        resetAt: new Date(emailResult.reset),
      };
    }

    // All checks passed
    return {
      allowed: true,
      remaining: Math.min(
        globalResult.remaining,
        ipResult.remaining,
        emailResult.remaining
      ),
    };
  } catch (error) {
    // If Redis is down, fail open (allow request) to maintain availability
    // Log the error for monitoring
    console.error("Rate limit check failed:", error);
    return {
      allowed: true, // Fail open - availability over security in this case
    };
  }
}

/**
 * Reset rate limits for a specific identifier
 * Useful for testing or customer support scenarios
 * 
 * @param type - Type of rate limit to reset
 * @param identifier - The specific IP or email to reset
 */
export async function resetRateLimit(
  type: "ip" | "email" | "global",
  identifier: string
): Promise<void> {
  const prefix =
    type === "ip"
      ? "ratelimit:signup:ip:"
      : type === "email"
      ? "ratelimit:signup:email:"
      : "ratelimit:signup:global:";

  const key = `${prefix}${identifier}`;
  await redis.del(key);
}

/**
 * Login rate limiters
 * Stricter than signup to prevent brute force attacks
 */
export const ipLoginRateLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(
    RATE_LIMIT_CONFIG.LOGIN.IP.LIMIT,
    RATE_LIMIT_CONFIG.LOGIN.IP.WINDOW as Duration
  ),
  analytics: true,
  prefix: RATE_LIMIT_CONFIG.LOGIN.IP.PREFIX,
});

export const emailLoginRateLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(
    RATE_LIMIT_CONFIG.LOGIN.EMAIL.LIMIT,
    RATE_LIMIT_CONFIG.LOGIN.EMAIL.WINDOW as Duration
  ),
  analytics: true,
  prefix: RATE_LIMIT_CONFIG.LOGIN.EMAIL.PREFIX,
});

export const globalLoginRateLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(
    RATE_LIMIT_CONFIG.LOGIN.GLOBAL.LIMIT,
    RATE_LIMIT_CONFIG.LOGIN.GLOBAL.WINDOW as Duration
  ),
  analytics: true,
  prefix: RATE_LIMIT_CONFIG.LOGIN.GLOBAL.PREFIX,
});

/**
 * Check rate limits for login
 * 
 * @param ip - Client IP
 * @param email - User email
 */
export async function checkLoginRateLimit(
  ip: string,
  email: string
): Promise<{
  allowed: boolean;
  limitType?: "global" | "ip" | "email";
  limit?: number;
  remaining?: number;
  resetAt?: Date;
}> {
  try {
    // Layer 1: Global
    const globalResult = await globalLoginRateLimiter.limit("global");
    if (!globalResult.success) {
      return {
        allowed: false,
        limitType: "global",
        limit: globalResult.limit,
        remaining: globalResult.remaining,
        resetAt: new Date(globalResult.reset),
      };
    }

    // Layer 2: IP
    const ipResult = await ipLoginRateLimiter.limit(ip);
    if (!ipResult.success) {
      return {
        allowed: false,
        limitType: "ip",
        limit: ipResult.limit,
        remaining: ipResult.remaining,
        resetAt: new Date(ipResult.reset),
      };
    }

    // Layer 3: Email
    const emailResult = await emailLoginRateLimiter.limit(email.toLowerCase());
    if (!emailResult.success) {
      return {
        allowed: false,
        limitType: "email",
        limit: emailResult.limit,
        remaining: emailResult.remaining,
        resetAt: new Date(emailResult.reset),
      };
    }

    return {
      allowed: true,
      remaining: Math.min(
        globalResult.remaining,
        ipResult.remaining,
        emailResult.remaining
      ),
      limit: emailResult.limit, // Most specific limit
      resetAt: new Date(emailResult.reset),
    };
  } catch (error) {
    console.error("Login rate limit check failed:", error);
    return { allowed: true };
  }
}
