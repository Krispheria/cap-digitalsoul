import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const WEB_ROOT = join(__dirname, "..", "..");
const MONOREPO_ROOT = join(WEB_ROOT, "..", "..");

const FILES = [
	"app/layout.tsx",
	"app/not-found.tsx",
	"app/(org)/login/form.tsx",
	"app/(org)/signup/form.tsx",
	"app/(org)/verify-otp/form.tsx",
	"app/(org)/verify-otp/page.tsx",
	"app/(org)/onboarding/components/WelcomePage.tsx",
	"app/(org)/dashboard/_components/Navbar/Top.tsx",
	"app/s/[videoId]/_components/ShareHeader.tsx",
	"app/c/[id]/page.tsx",
	"app/embed/[videoId]/_components/EmbedVideo.tsx",
	"app/api/og/route.tsx",
	"lib/og/video-og.tsx",
	"lib/og/template.tsx",
	"public/site.webmanifest",
].map((file) => join(WEB_ROOT, file));

const SHARED_FILES = [
	"packages/ui/src/components/icons/Logo.tsx",
	"packages/ui/src/components/icons/LogoBadge.tsx",
	"packages/ui/src/components/LogoSpinner.tsx",
	"packages/utils/src/helpers.ts",
	"packages/database/emails/otp-email.tsx",
	"packages/database/emails/login-link.tsx",
].map((file) => join(MONOREPO_ROOT, file));

const FORBIDDEN = [
	/cap\.so/i,
	/cap\.link/i,
	/Get Cap free/,
	/discord/i,
	/Welcome to Cap\b/,
	/Sign (in|up) to Cap\b/,
	/"Cap Logo"/,
	/raw\.githubusercontent\.com\/CapSoftware/,
];

describe("no upstream branding on the self-hosted journey", () => {
	for (const file of [...FILES, ...SHARED_FILES]) {
		it(`keeps ${file.replace(MONOREPO_ROOT, "")} free of Cap branding`, () => {
			const source = readFileSync(file, "utf8");
			for (const pattern of FORBIDDEN) {
				expect(source).not.toMatch(pattern);
			}
		});
	}
});
