export default function HacmanLogo({ className = "h-8" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 240 60"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="HACMAN logo"
      role="img"
    >
      {/* "HA" in serif font - white on dark bg */}
      <text
        x="0"
        y="46"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontWeight="900"
        fontSize="44"
        fill="currentColor"
      >
        HA
      </text>

      {/* Pac-man "C" - yellow with mouth opening to the right */}
      <circle
        cx="96"
        cy="30"
        r="22"
        fill="#FACC15"
        stroke="currentColor"
        strokeWidth="2"
      />
      {/* Mouth cutout */}
      <path
        d="M 96 30 L 120 18 L 120 42 Z"
        fill="#111111"
      />

      {/* "MAN" after pac-man */}
      <text
        x="120"
        y="46"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontWeight="900"
        fontSize="44"
        fill="currentColor"
      >
        MAN
      </text>
    </svg>
  );
}
