"use client";

import { useEffect, useState } from "react";

const AnimatedStars = () => {
  const [stars, setStars] = useState<
    {
      id: number;
      x: number;
      y: number;
      size: number;
      duration: number;
      floatDuration: number;
      floatDelay: number;
      floatDistance: number;
      floatDirection: number;
    }[]
  >([]);

  useEffect(() => {
    // Generate 100 stars with random positions, sizes, and animation properties
    const newStars = Array.from({ length: 150 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 2 + 1,
      duration: Math.random() * 3 + 2,
      floatDuration: Math.random() * 4 + 4, // Random float duration between 4-8s
      floatDelay: Math.random() * 2, // Random delay between 0-2s
      floatDistance: Math.random() * 30 + 10, // 10-40px float distance
      floatDirection: Math.random() > 0.5 ? 1 : -1, // up or down
    }));
    setStars(newStars);
  }, []);

  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none">
      {/* Add keyframes for floating animation */}
      <style>
        {`
          @keyframes float {
            0% { transform: translateY(0); }
            50% { transform: translateY(var(--float-distance)); }
            100% { transform: translateY(0); }
          }
        `}
      </style>
      <div className="absolute inset-0 bg-gradient-to-b from-[#121212] via-[#0a0a0a] to-[#121212]" />
      {stars.map((star) => {
        const style: React.CSSProperties & Record<string, string | number> = {
          left: `${star.x}%`,
          top: `${star.y}%`,
          width: `${star.size}px`,
          height: `${star.size}px`,
          animation: `float ${star.floatDuration}s ease-in-out ${star.floatDelay}s infinite, twinkle ${star.duration}s infinite`,
          opacity: Math.random() * 0.5 + 0.5,
          boxShadow: "0 0 4px #A259FF",
          "--float-distance": `${star.floatDirection * star.floatDistance}px`,
        };
        return (
          <div
            key={star.id}
            className="absolute rounded-full bg-[#A259FF]"
            style={style}
          />
        );
      })}
    </div>
  );
};

export default AnimatedStars;
