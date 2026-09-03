import { DigitalSoulMark } from "./DigitalSoulMark";

export const LogoBadge = ({ className }: { className: string }) => {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			className={className}
			fill="none"
			viewBox="0 0 40 40"
			role="img"
			aria-label="DigitalSoul"
			preserveAspectRatio="xMidYMid meet"
			style={{
				aspectRatio: "1 / 1",
			}}
		>
			<rect width="40" height="40" fill="#fff" rx="8"></rect>
			<DigitalSoulMark />
		</svg>
	);
};
