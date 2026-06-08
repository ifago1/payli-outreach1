import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const REALM = 'Basic realm="payli-outreach", charset="UTF-8"';

/**
 * HTTP Basic Auth voor de hele app. Aan-zetten door BASIC_AUTH_USER
 * en BASIC_AUTH_PASSWORD in .env te zetten; leeg betekent geen
 * authenticatie (handig voor lokale dev). De cron-endpoint heeft
 * zijn eigen header-secret en is uitgesloten via de matcher onderaan.
 */
export function middleware(req: NextRequest) {
  const expectedUser = process.env.BASIC_AUTH_USER;
  const expectedPass = process.env.BASIC_AUTH_PASSWORD;

  if (!expectedUser || !expectedPass) {
    return NextResponse.next();
  }

  const header = req.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    try {
      const decoded = atob(header.slice(6));
      const idx = decoded.indexOf(":");
      if (idx !== -1) {
        const user = decoded.slice(0, idx);
        const pass = decoded.slice(idx + 1);
        if (user === expectedUser && pass === expectedPass) {
          return NextResponse.next();
        }
      }
    } catch {
      // ongeldige base64 — val door naar 401
    }
  }

  return new NextResponse("Authenticatie vereist", {
    status: 401,
    headers: { "WWW-Authenticate": REALM },
  });
}

export const config = {
  // Match alle paths behalve: de cron-route (eigen header-secret),
  // statische Next.js-assets en favicon. Daardoor blijft de loginprompt
  // niet hangen op stylesheets/afbeeldingen.
  matcher: ["/((?!api/sync/cron|_next/static|_next/image|favicon\\.ico|robots\\.txt).*)"],
};
