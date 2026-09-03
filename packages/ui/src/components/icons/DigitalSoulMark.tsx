import { useId } from "react";

export const DS_BRAND_BLUE = "#3D62E4";
export const DS_BRAND_PURPLE = "#8F4FD9";

const STRIPE_OFFSETS = [-12, -8, -4, 0, 4, 8, 12];

export const DigitalSoulMark = ({
	cx = 20,
	cy = 20,
	r = 16,
}: {
	cx?: number;
	cy?: number;
	r?: number;
}) => {
	const rawId = useId().replace(/[^a-zA-Z0-9]/g, "");
	const gradientId = `ds-gradient-${rawId}`;
	const maskId = `ds-mask-${rawId}`;
	const stripeHeight = r * 0.11;

	return (
		<>
			<defs>
				<linearGradient id={gradientId} x1="0" y1="1" x2="1" y2="0">
					<stop offset="0" stopColor={DS_BRAND_BLUE} />
					<stop offset="1" stopColor={DS_BRAND_PURPLE} />
				</linearGradient>
				<mask id={maskId}>
					<circle cx={cx} cy={cy} r={r} fill="white" />
					<g transform={`rotate(-18 ${cx} ${cy})`}>
						{STRIPE_OFFSETS.map((offset) => (
							<rect
								key={offset}
								x={cx - r - 2}
								y={cy + (offset * r) / 16 - stripeHeight / 2}
								width={r * 2 + 4}
								height={stripeHeight}
								rx={stripeHeight / 2}
								fill="black"
							/>
						))}
					</g>
				</mask>
			</defs>
			<circle
				cx={cx}
				cy={cy}
				r={r}
				fill={`url(#${gradientId})`}
				mask={`url(#${maskId})`}
			/>
		</>
	);
};
