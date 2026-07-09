// Декоративная иллюстрация ванной для hero. Векторная (line-art) в стиле иконок
// каталога: круглое зеркало, накладная раковина-чаша с изливом-гусаком и водой,
// подвесная тумба, полотенце на кольце, флаконы, капли. Все цвета — через CSS-
// классы на var(--…), поэтому сцена сама подстраивается под тёмную тему.
// aria-hidden: заголовок рядом уже несёт смысл, дублировать для скринридера незачем.
export default function HeroArt() {
  return (
    <svg
      className="hero-art"
      viewBox="0 0 480 440"
      fill="none"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <defs>
        <clipPath id="ha-frame-clip">
          <rect x="16" y="14" width="448" height="412" rx="26" />
        </clipPath>
      </defs>

      {/* Рамка-«кадр» сцены */}
      <rect className="ha-frame" x="16" y="14" width="448" height="412" rx="26" />

      <g clipPath="url(#ha-frame-clip)">
        {/* Плиточная стена — едва заметная сетка затирки */}
        <g className="ha-tile" strokeWidth="1.4">
          <path d="M16 92 H464" />
          <path d="M16 158 H464" />
          <path d="M150 26 V210" />
          <path d="M250 26 V210" />
          <path d="M350 26 V210" />
        </g>

        {/* Мягкое пятно-подсветка за зеркалом */}
        <circle className="ha-soft" cx="250" cy="142" r="104" opacity="0.55" />

        {/* Тень тумбы на полу */}
        <ellipse className="ha-shadow" cx="250" cy="400" rx="128" ry="7" opacity="0.06" />

        {/* Подвесные светильники по бокам зеркала */}
        <g>
          <path className="ha-line" d="M112 15 V56" />
          <circle className="ha-soft-obj" cx="112" cy="66" r="10" />
          <path className="ha-line" d="M388 15 V56" />
          <circle className="ha-soft-obj" cx="388" cy="66" r="10" />
        </g>

        {/* Круглое зеркало с бликом */}
        <circle className="ha-bg-obj" cx="250" cy="142" r="74" />
        <circle className="ha-accent" cx="250" cy="142" r="74" strokeWidth="3.5" />
        <path className="ha-line" d="M214 118 A44 44 0 0 0 208 158" opacity="0.5" />
        <path className="ha-line" d="M226 112 A54 54 0 0 0 220 132" opacity="0.35" />

        {/* Столешница (плита) */}
        <rect className="ha-obj" x="118" y="298" width="264" height="15" rx="7" />

        {/* Подвесная тумба с двумя дверцами */}
        <rect className="ha-obj" x="168" y="313" width="164" height="74" rx="12" />
        <path className="ha-line" d="M250 318 V382" opacity="0.6" />
        <circle className="ha-accent-fill" cx="238" cy="352" r="3" />
        <circle className="ha-accent-fill" cx="262" cy="352" r="3" />
        <path className="ha-line" d="M182 387 V398 M318 387 V398" />

        {/* Полотенце на кольце (слева) */}
        <circle className="ha-accent" cx="96" cy="248" r="15" strokeWidth="3" />
        <rect className="ha-bg-obj" x="85" y="250" width="22" height="54" rx="8" />
        <path className="ha-line" d="M92 256 V300 M100 256 V300" opacity="0.5" />

        {/* Флаконы (справа на столешнице) */}
        <rect className="ha-obj" x="336" y="264" width="21" height="34" rx="6" />
        <path className="ha-accent" d="M346 264 V255 H356" strokeWidth="2.5" />
        <rect className="ha-soft-obj" x="362" y="276" width="19" height="22" rx="5" />
        <path className="ha-line" d="M362 283 H381" opacity="0.6" />

        {/* Раковина-чаша */}
        <path className="ha-obj" d="M200 260 C200 286 214 300 250 300 C286 300 300 286 300 260" />
        <ellipse className="ha-obj" cx="250" cy="260" rx="50" ry="11" />
        <ellipse className="ha-soft" cx="250" cy="260" rx="41" ry="8" />

        {/* Смеситель-гусак */}
        <g className="ha-accent" strokeWidth="6">
          <path d="M316 298 V212 C316 188 300 178 276 178 H250 V230" />
          <path d="M316 226 L333 217" />
        </g>
        <rect className="ha-accent-fill" x="305" y="296" width="22" height="6" rx="3" />

        {/* Струя воды и рябь */}
        <path className="ha-accent" d="M250 232 V257" strokeWidth="3" opacity="0.85" />
        <ellipse
          className="ha-accent"
          cx="250"
          cy="260"
          rx="19"
          ry="4"
          strokeWidth="1.8"
          opacity="0.6"
        />
        <ellipse
          className="ha-accent"
          cx="250"
          cy="261"
          rx="32"
          ry="6.5"
          strokeWidth="1.5"
          opacity="0.32"
        />

        {/* Декоративные капли */}
        <path
          className="ha-soft-obj"
          d="M74 44 C67 55 63 60 63 66 A11 11 0 0 0 85 66 C85 60 81 55 74 44 Z"
        />
        <path
          className="ha-accent"
          d="M108 92 C104 99 101 102 101 106 A7 7 0 0 0 115 106 C115 102 112 99 108 92 Z"
          strokeWidth="2"
        />
      </g>
    </svg>
  )
}
