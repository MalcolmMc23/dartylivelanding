/**
 * Calculates the next upcoming Sunday at 12:00 PM
 * If it's already Sunday after 12pm, returns the following Sunday
 */
export function getNextSundayNoon(): Date {
  const now = new Date();
  const targetDay = 0; // Sunday (0 = Sunday, 1 = Monday, etc.)
  let daysToAdd = (targetDay - now.getDay() + 7) % 7;
  
  // If it's already Sunday and past noon, set to next Sunday
  if (daysToAdd === 0 && now.getHours() >= 12) {
    daysToAdd = 7;
  }
  
  const nextSunday = new Date(now);
  nextSunday.setDate(now.getDate() + daysToAdd);
  nextSunday.setHours(12, 0, 0, 0); // Set to 12:00:00 PM
  
  return nextSunday;
} 