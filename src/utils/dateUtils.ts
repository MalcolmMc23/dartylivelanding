/**
 * Calculates the next upcoming Wednesday at 12:00 PM
 * If it's already Wednesday after 12pm, returns the following Wednesday
 */
export function getNextWednesdayNoon(): Date {
  const now = new Date();
  const targetDay = 3; // Wednesday (0 = Sunday, 1 = Monday, etc.)
  let daysToAdd = (targetDay - now.getDay() + 7) % 7;
  
  // If it's already Wednesday and past noon, set to next Wednesday
  if (daysToAdd === 0 && now.getHours() >= 12) {
    daysToAdd = 7;
  }
  
  const nextWednesday = new Date(now);
  nextWednesday.setDate(now.getDate() + daysToAdd);
  nextWednesday.setHours(12, 0, 0, 0); // Set to 12:00:00 PM
  
  return nextWednesday;
} 