import Image from "next/image";
import styles from "./UniversityLogoScroll.module.css";

const UniversityLogoScroll = () => {
  const logos = [
    { src: "/images/TENESSEELOGO.png", alt: "Tennessee" },
    { src: "/images/UCLALOGO.png", alt: "UCLA" },
    { src: "/images/MICHIGANLOGO.png", alt: "Michigan" },
    { src: "/images/UOFALOGO.png", alt: "Arizona" },
    { src: "/images/Texas_Longhorns_logo.svg.png", alt: "Texas" },
    { src: "/images/OSULOGO.png", alt: "Ohio State" },
    { src: "/images/LSULOGO.png", alt: "LSU" },
    { src: "/images/GEORGIALOGO.png", alt: "Georgia" },
    { src: "/images/DUKELOGO.png", alt: "Duke" },
    { src: "/images/HARVARDLOGO.png", alt: "Harvard" },
    { src: "/images/YALELOGO.png", alt: "Yale" },
    { src: "/images/WISCONSINLOGO.png", alt: "Wisconsin" },
  ];

  // Double the logos array to create the seamless loop effect
  const allLogos = [...logos, ...logos];

  return (
    <div className={styles.scrollContainer}>
      <div className={styles.scrollTrack}>
        {allLogos.map((logo, index) => (
          <div key={`${logo.alt}-${index}`} className={styles.logoItem}>
            <Image
              src={logo.src}
              alt={logo.alt}
              width={96}
              height={96}
              priority={index < 12} // Load first set with priority
              className="object-contain"
            />
          </div>
        ))}
      </div>
    </div>
  );
};

export default UniversityLogoScroll;
