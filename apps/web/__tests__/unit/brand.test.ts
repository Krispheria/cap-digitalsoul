import { BRAND, CAP_LOGO_URL } from "@cap/utils";
import { describe, expect, it } from "vitest";

describe("BRAND", () => {
	it("routes the email logo through the brand module", () => {
		expect(CAP_LOGO_URL).toBe(BRAND.logoUrl);
		expect(BRAND.logoUrl.startsWith(BRAND.appUrl)).toBe(true);
	});

	it("never points at the upstream product", () => {
		for (const value of Object.values(BRAND)) {
			if (typeof value !== "string") continue;
			expect(value).not.toMatch(/cap\.so|cap\.link/i);
		}
		expect(BRAND.upstreamUrl).toContain("github.com/CapSoftware/Cap");
	});
});
