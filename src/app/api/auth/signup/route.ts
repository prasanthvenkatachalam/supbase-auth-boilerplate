/**
 * Signup API Route with Rate Limiting
 * 
 * This endpoint handles user registration with multiple layers of protection:
 * 1. Rate limiting (IP, email, and global)
 * 2. Input validation using Zod
 * 3. Supabase Auth integration
 * 4. Automatic profile creation (via database trigger)
 * 
 * Architecture decisions:
 * - Using Next.js API Routes for server-side processing
 * - Rate limiting happens BEFORE database queries to protect resources
 * - Returns detailed error messages for better UX
 * - Follows REST conventions (POST for creation, proper status codes)
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { signUpSchema } from "@/lib/validations/auth";
import { checkSignupRateLimit } from "@/lib/rate-limit";
import { ERROR_MESSAGES, SUCCESS_MESSAGES } from "@/constants/messages";
import { RATE_LIMIT_CONFIG } from "@/constants/rate-limit";
import { z } from "zod";

/**
 * Helper function to extract client IP address
 * 
 * Checks multiple headers in order of preference:
 * 1. x-forwarded-for: Set by proxies/load balancers (Vercel, AWS, etc.)
 * 2. x-real-ip: Alternative header used by some proxies (Nginx)
 * 3. Remote address from connection
 * 
 * Returns first valid IP found
 * 
 * Security note: In production, ensure your hosting platform sets these headers correctly
 * to prevent IP spoofing
 */
function getClientIp(request: NextRequest): string {
  // x-forwarded-for can contain multiple IPs (client, proxy1, proxy2)
  // We want the first one (the original client)
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const ips = forwardedFor.split(",").map((ip) => ip.trim());
    return ips[0];
  }

  // Fallback to x-real-ip
  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp;
  }

  // Last resort: use a placeholder (shouldn't happen in production)
  // In local development, this will be used
  return "127.0.0.1";
}

/**
 * POST /api/auth/signup
 * 
 * Request body:
 * {
 *   "email": "user@example.com",
 *   "password": "SecurePassword123!"
 * }
 * 
 * Response codes:
 * - 201: User created successfully
 * - 400: Invalid input (validation failed)
 * - 429: Rate limit exceeded
 * - 409: Email already exists
 * - 500: Server error
 */
export async function POST(request: NextRequest) {
  try {
    // Step 1: Parse and validate request body
    const body = await request.json();
    
    // Validate input using Zod schema
    // This ensures email format is correct and password meets requirements
    const validationResult = signUpSchema.safeParse(body);
    
    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: ERROR_MESSAGES.VALIDATION.INVALID_INPUT,
          details: validationResult.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { email, password } = validationResult.data;

    // Step 2: Get client IP for rate limiting
    const clientIp = getClientIp(request);

    // Step 3: Check rate limits (multi-layer)
    const rateLimitResult = await checkSignupRateLimit(clientIp, email);

    if (!rateLimitResult.allowed) {
      // Rate limit exceeded - return 429 with retry information
      const resetDate = rateLimitResult.resetAt;
      const retryAfterSeconds = resetDate
        ? Math.ceil((resetDate.getTime() - Date.now()) / 1000)
        : 900; // Default to 15 minutes

      // Return different messages based on which limit was hit
      const messages = {
        global: ERROR_MESSAGES.RATE_LIMIT.GLOBAL,
        ip: ERROR_MESSAGES.RATE_LIMIT.IP,
        email: ERROR_MESSAGES.RATE_LIMIT.EMAIL,
      };

      return NextResponse.json(
        {
          error: ERROR_MESSAGES.RATE_LIMIT.GENERIC,
          message: messages[rateLimitResult.limitType || "global"],
          retryAfter: retryAfterSeconds,
          limit: rateLimitResult.limit,
          remaining: rateLimitResult.remaining,
        },
        {
          status: 429,
          headers: {
            "Retry-After": retryAfterSeconds.toString(),
            "X-RateLimit-Limit": rateLimitResult.limit?.toString() || "0",
            "X-RateLimit-Remaining": rateLimitResult.remaining?.toString() || "0",
            "X-RateLimit-Reset": resetDate?.getTime().toString() || "",
          },
        }
      );
    }

    // Step 4: Create Supabase client (server-side)
    const supabase = await createClient();

    // Step 5: Attempt to sign up the user
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // You can add email redirect URL here for email confirmation
        // emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/confirm`,
        
        // Optional: Add user metadata
        data: {
          // Add any additional user data here
          // This will be stored in auth.users.raw_user_meta_data
        },
      },
    });

    // Step 6: Handle Supabase errors
    if (error) {
      // Check for specific error types
      if (error.message.includes("already registered")) {
        return NextResponse.json(
          {
            error: "Conflict",
            message: ERROR_MESSAGES.AUTH.EMAIL_EXISTS,
          },
          { status: 409 } // Conflict status
        );
      }

      // Check for weak password
      if (error.message.includes("Password")) {
        return NextResponse.json(
          {
            error: ERROR_MESSAGES.VALIDATION.INVALID_INPUT,
            message: error.message,
          },
          { status: 400 }
        );
      }

      // Generic error
      console.error("Signup error:", error);
      return NextResponse.json(
        {
          error: ERROR_MESSAGES.AUTH.SIGNUP_FAILED,
          message: error.message,
        },
        { status: 500 }
      );
    }

    // Step 7: Success! Return user data
    // Note: The profile is automatically created by the database trigger
    return NextResponse.json(
      {
        success: true,
        message: SUCCESS_MESSAGES.SIGNUP.CREATED,
        user: {
          id: data.user?.id,
          email: data.user?.email,
        },
        // Include rate limit info in response headers for client-side tracking
      },
      {
        status: 201, // Created
        headers: {
          "X-RateLimit-Limit": rateLimitResult.limit?.toString() || "0",
          "X-RateLimit-Remaining": rateLimitResult.remaining?.toString() || "0",
          "X-RateLimit-Reset": rateLimitResult.resetAt?.getTime().toString() || "",
        },
      }
    );
  } catch (error) {
    // Catch any unexpected errors
    console.error("Unexpected error in signup route:", error);
    
    // Don't expose internal error details to client
    return NextResponse.json(
      {
        error: "Internal Server Error",
        message: ERROR_MESSAGES.AUTH.INTERNAL_ERROR,
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/auth/signup
 * 
 * Returns information about signup rate limits
 * Useful for displaying rate limit status to users
 */
export async function GET(request: NextRequest) {
  const clientIp = getClientIp(request);
  
  return NextResponse.json({
    message: "Signup endpoint",
    rateLimit: {
      ip: {
        limit: RATE_LIMIT_CONFIG.SIGNUP.IP.LIMIT,
        window: RATE_LIMIT_CONFIG.SIGNUP.IP.WINDOW,
      },
      email: {
        limit: RATE_LIMIT_CONFIG.SIGNUP.EMAIL.LIMIT,
        window: RATE_LIMIT_CONFIG.SIGNUP.EMAIL.WINDOW,
      },
      global: {
        limit: RATE_LIMIT_CONFIG.SIGNUP.GLOBAL.LIMIT,
        window: RATE_LIMIT_CONFIG.SIGNUP.GLOBAL.WINDOW,
      },
    },
    clientIp, // Return for debugging (remove in production)
  });
}
