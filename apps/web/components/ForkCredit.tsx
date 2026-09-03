import { BRAND } from "@cap/utils";

export function ForkCredit({ className }: { className?: string }) {
	return (
		<p className={className ?? "text-xs text-center text-gray-9"}>
			{BRAND.forkCredit} ·{" "}
			<a
				href={BRAND.forkSourceUrl}
				target="_blank"
				rel="noreferrer"
				className="underline underline-offset-2 hover:text-gray-12"
			>
				código fuente (AGPL-3.0)
			</a>
		</p>
	);
}
