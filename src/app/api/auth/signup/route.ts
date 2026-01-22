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
import { after } from 'next/after';
import { supabaseAdmin } from "@/utils/supabase/admin";

export const runtime = 'nodejs';

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
    // Step 1: Start async tasks immediately (Parallel Execution)
    // Kick off Supabase client creation (waits for cookies)
    const supabasePromise = createClient();
    // Kick off body parsing
    const bodyPromise = request.json();
    
    // Step 2: Get client IP (Sync)
    const clientIp = getClientIp(request);

    // Step 3: Await Body & Validate
    const body = await bodyPromise;
    
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

    const { email, password, captchaToken } = validationResult.data;

    // Step 4: Start Rate Limit Check (Parallel with Supabase setup)
    console.time("rate-limit-check");
    const rateLimitPromise = checkSignupRateLimit(clientIp, email);
    
    // Await Supabase Client (should be ready by now)
    const supabase = await supabasePromise;

    // Await Rate Limit Result
    const rateLimitResult = await rateLimitPromise;
    console.timeEnd("rate-limit-check");

    if (!rateLimitResult.allowed) {
      // Rate limit exceeded - return 429 with retry information
      const resetDate = rateLimitResult.resetAt;
      const retryAfterSeconds = resetDate
        ? Math.ceil((resetDate.getTime() - Date.now()) / 1000)
        : 900;

      const limitType = rateLimitResult.limitType || "global";
      const messageMap: Record<string, string> = {
        global: ERROR_MESSAGES.RATE_LIMIT.GLOBAL,
        ip: ERROR_MESSAGES.RATE_LIMIT.IP,
        email: ERROR_MESSAGES.RATE_LIMIT.EMAIL,
      };

      return NextResponse.json(
        {
          error: ERROR_MESSAGES.RATE_LIMIT.GENERIC,
          message: messageMap[limitType],
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

    // Step 5: Fast Signup (Non-blocking Email)
    // Instead of waiting for Supabase to send the email (4s), we generate a link
    // and process the email sending in the background.
    console.time("admin-generate-link");
    const { data, error } = await supabaseAdmin.auth.generateLink({
      type: "signup",
      email,
      password,
      options: {
        captchaToken,
        data: {}, // User metadata
      },
    });
    console.timeEnd("admin-generate-link");

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
       // The weak password check might not be directly applicable here as generateLink doesn't perform the same client-side password validation as signUp.
       // Keeping a generic 500 for other errors from generateLink.
       console.error("Generate link error:", error);
       return NextResponse.json(
         {
           error: ERROR_MESSAGES.AUTH.SIGNUP_FAILED,
           message: error.message,
         },
         { status: 500 }
       );
    }

    // Step 6: Background Email Sending
    // This runs after the response closes, making the API fast
    after(async () => {
      console.log(`[Background] Mock sending email to ${email}`);
      console.log(`[Background] Verification Link: ${data.properties?.action_link}`);
      // TODO: Integrate Resend/SendGrid here using the action_link
    });

    // Step 7: Immediate Success Response
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
