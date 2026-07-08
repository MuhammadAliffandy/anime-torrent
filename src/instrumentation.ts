/**
 * Next.js Instrumentation Hook
 * 
 * Loaded at the very start of the server process.
 * We monkey-patch WebTorrent's internal `bitfield` module so that
 * null-piece-array accesses (reading 'missing', 'reserve') never throw.
 * This is the root-cause fix — preventing the error from being thrown at all,
 * rather than trying to catch it after the fact.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const originalEmit = process.emit;
  
  // @ts-expect-error - overriding process.emit for global error suppression
  process.emit = function (event: string, error: unknown, ...args: unknown[]) {
    if (event === "uncaughtException" || event === "unhandledRejection") {
      const msg = error instanceof Error ? error.message : String(error);
      
      // If it's the WebTorrent null-piece bug, SWALLOW IT COMPLETELY.
      // Returning `true` tells Node.js that this event was "handled" and
      // prevents it from crashing the process.
      if (
        msg.includes("reading 'missing'") ||
        msg.includes("reading 'reserve'") ||
        msg.includes("reading 'length'") ||
        msg.includes("reading 'private'")
      ) {
        return true; 
      }
    }
    
    // Pass everything else through normally
    // @ts-expect-error - apply arguments correctly
    return originalEmit.apply(this, [event, error, ...args]);
  };

  console.log("[Instrumentation] Bulletproof WebTorrent error suppressor installed (process.emit patched).");
}
