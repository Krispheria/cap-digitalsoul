import { DigitalSoulMark } from "./DigitalSoulMark";

export const Logo = ({
	className,
	showVersion,
	showBeta,
	white,
	hideLogoName,
	viewBoxDimensions = "0 0 120 40",
	style,
}: {
	className?: string;
	showVersion?: boolean;
	showBeta?: boolean;
	white?: boolean;
	hideLogoName?: boolean;
	style?: React.CSSProperties;
	viewBoxDimensions?: `${string} ${string} ${string} ${string}`;
}) => {
	return (
		<div className="flex items-center">
			<svg
				viewBox={viewBoxDimensions}
				xmlns="http://www.w3.org/2000/svg"
				preserveAspectRatio="xMidYMid meet"
				fill="none"
				style={style}
				role="img"
				aria-label="DigitalSoul"
				className={className}
			>
				<DigitalSoulMark />
				{!hideLogoName && (
					<text
						x="42"
						y="25.5"
						className={`${white ? "fill-white" : "fill-gray-12"}`}
						fill={white ? "#ffffff" : "#12161F"}
						fontSize="13.5"
						fontWeight="700"
						letterSpacing="0.2"
						textLength="76"
						lengthAdjust="spacingAndGlyphs"
					>
						DigitalSoul
					</text>
				)}
			</svg>
			{showVersion && (
				<span
					className={`text-[10px] font-medium ${
						white ? "text-white" : "text-gray-1"
					}`}
				>
					v{process.env.appVersion}
				</span>
			)}
			{showBeta && (
				<span
					className={`text-[10px] font-medium min-w-[52px] ${
						white ? "text-white" : "text-gray-1"
					}`}
				>
					Beta v{process.env.appVersion}
				</span>
			)}
		</div>
	);
};
