"use client";

import { useEffect, useState } from "react";

const AnimatedStars = () => {
  const [stars, setStars] = useState<{ 
    id: number; 
    x: number; 
    y: number; 
    size: number; 
    duration: number;
    floatDuration: number;
    floatDelay: number;
  }[]>([]);

  useEffect(() => {
    // Generate 100 stars with random positions, sizes, and animation properties
    const newStars = Array.from({ length: 100 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 2 + 1,
      duration: Math.random() * 3 + 2,
      floatDuration: Math.random() * 4 + 4, // Random float duration between 4-8s
      floatDelay: Math.random() * 2, // Random delay between 0-2s
    }));
    setStars(newStars);
  }, []);

  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none">
      <div className="absolute inset-0 bg-gradient-to-b from-[#121212] via-[#0a0a0a] to-[#121212]" />
      {stars.map((star) => (
        <div
          key={star.id}
          className="absolute rounded-full bg-[#A259FF] animate-twinkle animate-float"
          style={{
            left: `${star.x}%`,
            top: `${star.y}%`,
            width: `${star.size}px`,
            height: `${star.size}px`,
            animationDuration: `${star.duration}s, ${star.floatDuration}s`,
            animationDelay: `0s, ${star.floatDelay}s`,
            opacity: Math.random() * 0.5 + 0.5,
            boxShadow: '0 0 4px #A259FF',
          }}
        />
      ))}
    </div>
  );
};

export default AnimatedStars; 